"""gtt_verint_reconciler.py — join GTT attendance with Verint adherence rows.

Join strategy (priority order):
  1. Exact surname match: GTTRow.surname ↔ Verint agent_name token before comma
  2. Fuzzy full-name match via rapidfuzz (token_set_ratio ≥ 85) as fallback

Produces a ReconciliationReport containing DiscrepancyRow[] and summary stats.
PII policy: workday_id and masked employee tokens are stored but never logged raw.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Literal

from gtt_adapter import GTTRow

try:
    from _engine_bridge import AgentRow
except Exception:
    AgentRow = object  # type: ignore[assignment,misc]

# Checked ONCE at import time (not per-call) so it can be surfaced in the
# report itself — a missing rapidfuzz silently disables the fuzzy-match
# fallback with no error, which previously made joins fail invisibly for any
# name not caught by exact surname matching. See ReconciliationReport.fuzzy_match_available.
try:
    import rapidfuzz  # noqa: F401
    RAPIDFUZZ_AVAILABLE = True
except ImportError:
    RAPIDFUZZ_AVAILABLE = False

DiscrepancyType = Literal[
    "clocked_in_not_in_adherence",
    "in_adherence_no_clock_in",
    "clocked_out_still_active",
    "not_yet_scheduled",
    "match_ok",
]


@dataclass
class DiscrepancyRow:
    workday_id: str
    employee: str           # display name (no email)
    subgroup: str           # GTT LOB label
    lob: str                # Verint LOB
    # One row per EMPLOYEE (not per GTT event) — GTT emits several rows per
    # person per day (clock_in, daily-communications, productivity, breaks,
    # ...). gtt_event summarises the distinct event types seen for this
    # person (e.g. "clock_in, daily-communications, productivity +2 more");
    # gtt_event_count is the raw count, for anyone who needs the number.
    gtt_event: str
    gtt_event_count: int
    verint_status: str      # actual_status | "not_captured"
    adherence_pct: float | None
    ooa_seconds: int | None
    # Raw minute counts, cumulative up to report-generation time (NOT a
    # full-shift total) — see AgentRow.adherence_minutes / .productive_paid_minutes.
    # None when the agent has no Verint row to derive them from.
    adherence_minutes: int | None
    productive_minutes: int | None
    # Total minutes out-of-adherence today (AgentRow.ooa_minutes) — NOT the
    # same as ooa_seconds above (which is the single WORST violation's
    # duration). None when the agent has no Verint row.
    ooa_minutes: int | None
    # Target/ceiling for "productive hours so far vs. projected for the day" —
    # the agent's SCHEDULED (not actual) shift length in minutes, from
    # publishedSchedule.events. None if no scheduled bounds are available.
    scheduled_minutes: int | None
    discrepancy_type: DiscrepancyType

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ReconciliationReport:
    generated_at: str       # ISO-8601 UTC
    functional_area: str
    date: str
    gtt_total: int          # distinct EMPLOYEES seen in GTT (not raw event rows — see gtt_event_rows_total)
    verint_total: int
    matched: int
    gtt_event_rows_total: int = 0  # raw GTT row count before grouping by employee (for anyone who wants the old number)
    discrepancies: list[DiscrepancyRow] = field(default_factory=list)
    intelligence: list[str] = field(default_factory=list)
    schema_version: str = "1.0"
    # Whether the fuzzy-match fallback was actually available when this report
    # was generated. False means every non-exact-surname join silently failed
    # (no exception — it just never matched) — a report generated with this
    # false is under-reporting matches for reasons unrelated to real attendance.
    fuzzy_match_available: bool = field(default_factory=lambda: RAPIDFUZZ_AVAILABLE)
    # Earliest / latest shift bounds across ALL captured Verint rows (not just
    # discrepancies). Prefers each agent's SCHEDULED (publishedSchedule) bounds
    # so agents who haven't started yet are still included; falls back to
    # their ACTUAL (actualSchedule) bounds only if no scheduled data exists.
    # None if no row had derivable bounds of either kind.
    earliest_shift_start: str | None = None
    latest_shift_end: str | None = None
    # Total occurrences of each GTT AUX event type across the whole raw GTT
    # pull (not deduped per employee) — feeds the event-mix chart.
    gtt_event_type_counts: dict[str, int] = field(default_factory=dict)
    # Per-hour (0-23, as string keys) aggregation across ALL captured Verint
    # rows: how many distinct agents had any activity that hour, and total
    # productive minutes logged in that hour. Sorted by hour ascending. Feeds
    # both the peak-hour chart and the attendance-evolution chart — one
    # aggregation, two views.
    hourly_attendance: list[dict] = field(default_factory=list)

    @property
    def discrepancy_count(self) -> int:
        return sum(
            1 for d in self.discrepancies
            if d.discrepancy_type not in ("match_ok", "not_yet_scheduled")
        )

    def to_dict(self) -> dict:
        return {
            "_meta": {
                "schema_version": self.schema_version,
                "generated_by": "gtt_verint_reconciler.py",
                "sources": ["gtt", "verint"],
                "join_strategy": "surname_exact_then_fuzzy",
                "ai_context": (
                    "discrepancy_type enum: "
                    "clocked_in_not_in_adherence | in_adherence_no_clock_in | "
                    "clocked_out_still_active | not_yet_scheduled | match_ok"
                ),
                "fuzzy_match_available": self.fuzzy_match_available,
                "earliest_shift_start": self.earliest_shift_start,
                "latest_shift_end": self.latest_shift_end,
                "gtt_event_rows_total": self.gtt_event_rows_total,
            },
            "generated_at": self.generated_at,
            "functional_area": self.functional_area,
            "date": self.date,
            "gtt_total": self.gtt_total,
            "verint_total": self.verint_total,
            "matched": self.matched,
            "discrepancy_count": self.discrepancy_count,
            "intelligence": self.intelligence,
            "discrepancies": [d.to_dict() for d in self.discrepancies],
            "gtt_event_type_counts": self.gtt_event_type_counts,
            "hourly_attendance": self.hourly_attendance,
        }


# ---------------------------------------------------------------------------
# Name normalisation helpers
# ---------------------------------------------------------------------------

def _verint_surname(agent_name: str) -> str:
    """Extract surname from Verint "Last, First" format."""
    return agent_name.split(",")[0].strip().lower()


def _verint_display(agent_name: str) -> str:
    parts = agent_name.split(",", 1)
    if len(parts) == 2:
        return f"{parts[1].strip()} {parts[0].strip()}"
    return agent_name.strip()


def _parse_iso(s: str) -> datetime | None:
    """Tolerant ISO-8601 parse — returns None for empty/unparseable input
    rather than raising, since shift_start_iso/shift_end_iso are optional
    (older captures or agents with no derivable actualSchedule bounds)."""
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _build_verint_index(verint_rows: list) -> dict[str, list]:
    """surname → list of AgentRow (there can be duplicates across LOBs)."""
    idx: dict[str, list] = {}
    for row in verint_rows:
        sn = _verint_surname(getattr(row, "agent_name", ""))
        idx.setdefault(sn, []).append(row)
    return idx


def _group_gtt_by_employee(gtt_rows: list[GTTRow]) -> dict[str, list[GTTRow]]:
    """GTT emits one row per AUX event type per employee per day (clock_in,
    daily-communications, productivity, break-1, ...) — group them so the
    report shows one row per person instead of one per event."""
    groups: dict[str, list[GTTRow]] = {}
    for gtr in gtt_rows:
        key = gtr.workday_id or gtr.surname
        groups.setdefault(key, []).append(gtr)
    return groups


def _format_events(event_types: list[str], max_shown: int = 3) -> str:
    """'clock_in, daily-communications, productivity +2 more'."""
    shown = event_types[:max_shown]
    extra = len(event_types) - len(shown)
    label = ", ".join(shown)
    return f"{label} +{extra} more" if extra > 0 else label


def _scheduled_minutes(vrow: object) -> int | None:
    """Scheduled (planned) shift length in minutes — the target/ceiling for
    "productive so far vs. projected for the day". Deliberately uses ONLY the
    scheduled bounds (publishedSchedule), not actual-worked bounds, which
    would just be a moving window while the shift is still in progress."""
    start = _parse_iso(getattr(vrow, "scheduled_start_iso", "") or "")
    end = _parse_iso(getattr(vrow, "scheduled_end_iso", "") or "")
    if start is None or end is None or end < start:
        return None
    return round((end - start).total_seconds() / 60)


def _compute_hourly_attendance(verint_rows: list) -> list[dict]:
    """Aggregate every captured agent's hourly_buckets (parse.js's
    deriveHourlyBuckets, threaded through AgentRow.hourly_buckets) into a
    single report-wide per-hour series: how many distinct agents had any
    activity that hour, and total productive minutes logged in it."""
    by_hour: dict[str, dict[str, int]] = {}
    for vrow in verint_rows:
        buckets = getattr(vrow, "hourly_buckets", None) or {}
        for hour, vals in buckets.items():
            entry = by_hour.setdefault(hour, {"agent_count": 0, "productive_minutes": 0})
            if (vals or {}).get("activeMinutes", 0) > 0:
                entry["agent_count"] += 1
            entry["productive_minutes"] += int((vals or {}).get("productiveMinutes", 0) or 0)
    return [
        {"hour": int(h), "agent_count": v["agent_count"], "productive_minutes": v["productive_minutes"]}
        for h, v in sorted(by_hour.items(), key=lambda kv: int(kv[0]))
    ]


def _fuzzy_match(gtt_row: GTTRow, verint_rows: list) -> object | None:
    """Try rapidfuzz token_set_ratio ≥ 85 on full display name."""
    if not RAPIDFUZZ_AVAILABLE:
        return None
    from rapidfuzz import fuzz

    gtt_full = gtt_row.employee.lower()
    best_score, best_row = 0, None
    for vr in verint_rows:
        candidate = _verint_display(getattr(vr, "agent_name", "")).lower()
        score = fuzz.token_set_ratio(gtt_full, candidate)
        if score > best_score:
            best_score, best_row = score, vr
    return best_row if best_score >= 85 else None


# ---------------------------------------------------------------------------
# Main reconcile function
# ---------------------------------------------------------------------------

def reconcile(
    gtt_rows: list[GTTRow],
    verint_rows: list,
    functional_area: str,
    date: str,
) -> ReconciliationReport:
    """Join GTT attendance with Verint adherence rows and produce a report."""

    verint_idx = _build_verint_index(verint_rows)
    matched_verint_ids: set[str] = set()
    discrepancies: list[DiscrepancyRow] = []
    matched_count = 0

    all_verint = [r for rows in verint_idx.values() for r in rows]

    # --- Walk GTT rows, grouped by employee (one row in, one row out) ---
    gtt_groups = _group_gtt_by_employee(gtt_rows)
    for group in gtt_groups.values():
        rep = group[0]  # shared fields (employee/workday_id/subgroup/surname) are the same across the group
        event_types = sorted({g.event_type for g in group})

        # Step 1: exact surname
        candidates = verint_idx.get(rep.surname, [])

        # Step 2: fuzzy fallback if no exact match
        vrow = candidates[0] if candidates else _fuzzy_match(rep, all_verint)

        if vrow is not None:
            # extractRoster() (verint_extension/parse.js) emits ONE row per
            # employee, not one per activity interval — so only the specific
            # row actually used for this match should be marked. (An earlier
            # version of this marked every same-surname candidate, which was
            # backwards: two DIFFERENT people who happen to share a surname
            # would incorrectly both get marked matched by one GTT row.)
            matched_verint_ids.add(str(getattr(vrow, "agent_id", id(vrow))))
            matched_count += 1

            # Determine discrepancy type — ghost session if this employee's
            # events include a clock_out but Verint still shows 0 OOA (active).
            ooa = getattr(vrow, "duration_seconds", 0) or 0
            if "clock_out" in event_types and ooa == 0:
                dtype: DiscrepancyType = "clocked_out_still_active"
            else:
                dtype = "match_ok"

            discrepancies.append(DiscrepancyRow(
                workday_id=rep.workday_id,
                employee=rep.employee,
                subgroup=rep.subgroup,
                lob=getattr(vrow, "lob", ""),
                gtt_event=_format_events(event_types),
                gtt_event_count=len(group),
                verint_status=getattr(vrow, "actual_status", ""),
                adherence_pct=getattr(vrow, "adherence_pct", None),
                ooa_seconds=ooa,
                adherence_minutes=getattr(vrow, "adherence_minutes", None),
                productive_minutes=getattr(vrow, "productive_paid_minutes", None),
                ooa_minutes=getattr(vrow, "ooa_minutes", None),
                scheduled_minutes=_scheduled_minutes(vrow),
                discrepancy_type=dtype,
            ))
        else:
            # GTT has records but Verint doesn't show this agent
            discrepancies.append(DiscrepancyRow(
                workday_id=rep.workday_id,
                employee=rep.employee,
                subgroup=rep.subgroup,
                lob="",
                gtt_event=_format_events(event_types),
                gtt_event_count=len(group),
                verint_status="not_captured",
                adherence_pct=None,
                ooa_seconds=None,
                adherence_minutes=None,
                productive_minutes=None,
                ooa_minutes=None,
                scheduled_minutes=None,
                discrepancy_type="clocked_in_not_in_adherence",
            ))

    # --- Walk Verint rows not matched by any GTT entry ---
    now = datetime.now(timezone.utc)
    earliest_start: datetime | None = None
    latest_end: datetime | None = None

    for vrow in verint_rows:
        # Two different shift-bound sources, NOT interchangeable:
        #  - scheduled_start/end_iso (publishedSchedule.events) — the PLANNED
        #    schedule, populated for every agent regardless of whether they've
        #    started. This is the one that can tell us "hasn't started yet".
        #  - shift_start/end_iso (actualSchedule.events) — the WORKED
        #    timeline, only populated once the agent has real activity. An
        #    agent who genuinely hasn't started has NO actualSchedule events
        #    at all, so this field is empty for them — useless for a
        #    not-yet-started check, but still the more accurate bound for
        #    "when did work actually happen" once it exists.
        scheduled_start_dt = _parse_iso(getattr(vrow, "scheduled_start_iso", "") or "")
        scheduled_end_dt = _parse_iso(getattr(vrow, "scheduled_end_iso", "") or "")
        actual_start_dt = _parse_iso(getattr(vrow, "shift_start_iso", "") or "")
        actual_end_dt = _parse_iso(getattr(vrow, "shift_end_iso", "") or "")

        # Prefer scheduled bounds for the report-wide earliest/latest stat —
        # it covers agents who haven't started yet too — falling back to
        # actual bounds only when scheduled data isn't available at all.
        start_dt = scheduled_start_dt or actual_start_dt
        end_dt = scheduled_end_dt or actual_end_dt
        if start_dt is not None and (earliest_start is None or start_dt < earliest_start):
            earliest_start = start_dt
        if end_dt is not None and (latest_end is None or end_dt > latest_end):
            latest_end = end_dt

        vid = str(getattr(vrow, "agent_id", id(vrow)))
        if vid not in matched_verint_ids:
            # Use the SCHEDULED start specifically — the actual-worked start
            # is empty for anyone who hasn't started, so it can never signal
            # "not yet started" (see note above).
            dtype: DiscrepancyType = (
                "not_yet_scheduled" if scheduled_start_dt is not None and scheduled_start_dt > now
                else "in_adherence_no_clock_in"
            )
            discrepancies.append(DiscrepancyRow(
                workday_id="",
                employee=_verint_display(getattr(vrow, "agent_name", "")),
                subgroup="",
                lob=getattr(vrow, "lob", ""),
                gtt_event="absent",
                gtt_event_count=0,
                verint_status=getattr(vrow, "actual_status", ""),
                adherence_pct=getattr(vrow, "adherence_pct", None),
                ooa_seconds=getattr(vrow, "duration_seconds", None),
                adherence_minutes=getattr(vrow, "adherence_minutes", None),
                productive_minutes=getattr(vrow, "productive_paid_minutes", None),
                ooa_minutes=getattr(vrow, "ooa_minutes", None),
                scheduled_minutes=_scheduled_minutes(vrow),
                discrepancy_type=dtype,
            ))

    return ReconciliationReport(
        generated_at=now.isoformat(),
        functional_area=functional_area,
        date=date,
        gtt_total=len(gtt_groups),
        gtt_event_rows_total=len(gtt_rows),
        verint_total=len(verint_rows),
        matched=matched_count,
        discrepancies=discrepancies,
        gtt_event_type_counts=dict(Counter(g.event_type for g in gtt_rows)),
        hourly_attendance=_compute_hourly_attendance(verint_rows),
        earliest_shift_start=earliest_start.isoformat() if earliest_start else None,
        latest_shift_end=latest_end.isoformat() if latest_end else None,
    )
