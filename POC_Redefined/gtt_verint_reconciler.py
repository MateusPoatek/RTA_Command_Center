"""gtt_verint_reconciler.py — join GTT attendance with Verint adherence rows.

Join strategy (priority order):
  1. Exact surname match: GTTRow.surname ↔ Verint agent_name token before comma
  2. Fuzzy full-name match via rapidfuzz (token_set_ratio ≥ 85) as fallback

Produces a ReconciliationReport containing DiscrepancyRow[] and summary stats.
PII policy: workday_id and masked employee tokens are stored but never logged raw.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Literal

from gtt_adapter import GTTRow

try:
    from _engine_bridge import AgentRow
except Exception:
    AgentRow = object  # type: ignore[assignment,misc]

DiscrepancyType = Literal[
    "clocked_in_not_in_adherence",
    "in_adherence_no_clock_in",
    "clocked_out_still_active",
    "match_ok",
]


@dataclass
class DiscrepancyRow:
    workday_id: str
    employee: str           # display name (no email)
    subgroup: str           # GTT LOB label
    lob: str                # Verint LOB
    gtt_event: str          # "clock_in" | "clock_out" | "absent"
    verint_status: str      # actual_status | "not_captured"
    adherence_pct: float | None
    ooa_seconds: int | None
    discrepancy_type: DiscrepancyType

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ReconciliationReport:
    generated_at: str       # ISO-8601 UTC
    functional_area: str
    date: str
    gtt_total: int
    verint_total: int
    matched: int
    discrepancies: list[DiscrepancyRow] = field(default_factory=list)
    intelligence: list[str] = field(default_factory=list)
    schema_version: str = "1.0"

    @property
    def discrepancy_count(self) -> int:
        return sum(1 for d in self.discrepancies if d.discrepancy_type != "match_ok")

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
                    "clocked_out_still_active | match_ok"
                ),
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


def _build_verint_index(verint_rows: list) -> dict[str, list]:
    """surname → list of AgentRow (there can be duplicates across LOBs)."""
    idx: dict[str, list] = {}
    for row in verint_rows:
        sn = _verint_surname(getattr(row, "agent_name", ""))
        idx.setdefault(sn, []).append(row)
    return idx


def _fuzzy_match(gtt_row: GTTRow, verint_rows: list) -> object | None:
    """Try rapidfuzz token_set_ratio ≥ 85 on full display name."""
    try:
        from rapidfuzz import fuzz
    except ImportError:
        return None

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

    # --- Walk GTT rows ---
    for gtr in gtt_rows:
        # Step 1: exact surname
        candidates = verint_idx.get(gtr.surname, [])

        # Step 2: fuzzy fallback if no exact match
        vrow = candidates[0] if candidates else _fuzzy_match(gtr, all_verint)

        if vrow is not None:
            vid = getattr(vrow, "agent_id", id(vrow))
            matched_verint_ids.add(str(vid))
            matched_count += 1

            # Determine discrepancy type
            ooa = getattr(vrow, "duration_seconds", 0) or 0
            if gtr.event_type == "clock_out" and ooa == 0:
                dtype: DiscrepancyType = "clocked_out_still_active"
            else:
                dtype = "match_ok"

            discrepancies.append(DiscrepancyRow(
                workday_id=gtr.workday_id,
                employee=gtr.employee,
                subgroup=gtr.subgroup,
                lob=getattr(vrow, "lob", ""),
                gtt_event=gtr.event_type,
                verint_status=getattr(vrow, "actual_status", ""),
                adherence_pct=getattr(vrow, "adherence_pct", None),
                ooa_seconds=ooa,
                discrepancy_type=dtype,
            ))
        else:
            # GTT has a record but Verint doesn't show this agent
            discrepancies.append(DiscrepancyRow(
                workday_id=gtr.workday_id,
                employee=gtr.employee,
                subgroup=gtr.subgroup,
                lob="",
                gtt_event=gtr.event_type,
                verint_status="not_captured",
                adherence_pct=None,
                ooa_seconds=None,
                discrepancy_type="clocked_in_not_in_adherence",
            ))

    # --- Walk Verint rows not matched by any GTT entry ---
    for vrow in verint_rows:
        vid = str(getattr(vrow, "agent_id", id(vrow)))
        if vid not in matched_verint_ids:
            discrepancies.append(DiscrepancyRow(
                workday_id="",
                employee=_verint_display(getattr(vrow, "agent_name", "")),
                subgroup="",
                lob=getattr(vrow, "lob", ""),
                gtt_event="absent",
                verint_status=getattr(vrow, "actual_status", ""),
                adherence_pct=getattr(vrow, "adherence_pct", None),
                ooa_seconds=getattr(vrow, "duration_seconds", None),
                discrepancy_type="in_adherence_no_clock_in",
            ))

    return ReconciliationReport(
        generated_at=datetime.now(timezone.utc).isoformat(),
        functional_area=functional_area,
        date=date,
        gtt_total=len(gtt_rows),
        verint_total=len(verint_rows),
        matched=matched_count,
        discrepancies=discrepancies,
    )
