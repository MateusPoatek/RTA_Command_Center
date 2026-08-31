"""report_intelligence.py — deterministic intelligence bullet generator.

Takes a ReconciliationReport and returns 3-6 plain-English bullets that RTAs
and Scheduling can act on.  No LLM required for MVP — rules are domain-driven.
"""
from __future__ import annotations

from collections import Counter

from gtt_verint_reconciler import ReconciliationReport, DiscrepancyRow


def _fmt_time(iso: str | None) -> str:
    """HH:MM from an ISO timestamp, or '—' if not available."""
    if not iso:
        return "—"
    try:
        from datetime import datetime
        return datetime.fromisoformat(iso).strftime("%H:%M")
    except ValueError:
        return "—"


def generate(report: ReconciliationReport) -> list[str]:
    bullets: list[str] = []
    d = report.discrepancies
    total = report.gtt_total or 1  # avoid division by zero

    # Surface this FIRST — a report generated with zero Verint rows makes
    # EVERY GTT row look like "No Verint record", which reads exactly like a
    # real capture-gap incident but is actually just "nobody had captured
    # Verint data yet when Report was clicked" (e.g. right after a page
    # reload, before recapturing). Distinguish the two clearly.
    if report.gtt_total > 0 and report.verint_total == 0:
        bullets.append(
            "⚠ This report has ZERO Verint rows — every GTT row below shows as "
            "\"No Verint record\" by default, not because of a real capture gap. "
            "Capture Verint (page the calendar or run Full Capture in the extension, "
            "then Push) before clicking Report."
        )
        return bullets

    # Surface this next — it explains inflated discrepancy counts that have
    # nothing to do with real attendance/adherence: without rapidfuzz, any
    # name that doesn't match Verint's format via exact surname (nicknames,
    # extra middle names, typos) silently fails to join at all.
    if not report.fuzzy_match_available:
        bullets.append(
            "⚠ rapidfuzz not installed in the environment that generated this report — "
            "fuzzy name matching was disabled, so any employee whose GTT/Verint name "
            "didn't match exactly on surname was reported as a discrepancy even if they "
            "actually attended. Install rapidfuzz and regenerate before trusting this count."
        )

    unmatched = [r for r in d if r.discrepancy_type == "clocked_in_not_in_adherence"]
    ghost = [r for r in d if r.discrepancy_type == "clocked_out_still_active"]
    no_clock = [r for r in d if r.discrepancy_type == "in_adherence_no_clock_in"]
    not_yet = [r for r in d if r.discrepancy_type == "not_yet_scheduled"]
    ok = [r for r in d if r.discrepancy_type == "match_ok"]

    # --- Shift coverage window (from Verint's own actualSchedule bounds) ---
    if report.earliest_shift_start or report.latest_shift_end:
        bullets.append(
            f"Captured shifts span {_fmt_time(report.earliest_shift_start)} "
            f"to {_fmt_time(report.latest_shift_end)} today — agents whose shift "
            f"hasn't started yet are excluded from the no-clock-in count below."
        )

    # --- Productive hours + adherence minutes, as of report generation ---
    # Cumulative UP TO NOW, not a full-shift total — the shift may not be over.
    productive_rows = [r for r in d if r.productive_minutes is not None and r.productive_minutes > 0]
    if productive_rows:
        avg_productive = sum(r.productive_minutes for r in productive_rows) / len(productive_rows)  # type: ignore[misc]
        bullets.append(
            f"Productive time so far today (as of {_fmt_time(report.generated_at)}): "
            f"avg {avg_productive/60:.1f}h per agent across {len(productive_rows)} agent(s)."
        )

    adherence_min_rows = [r for r in d if r.adherence_minutes is not None]
    if adherence_min_rows:
        total_adh_min = sum(r.adherence_minutes for r in adherence_min_rows)  # type: ignore[misc]
        avg_adh_min = total_adh_min / len(adherence_min_rows)
        bullets.append(
            f"Adherence minutes so far today: avg {avg_adh_min:.0f} min/agent in-adherence "
            f"across {len(adherence_min_rows)} agent(s) ({total_adh_min} min total)."
        )

    # --- Overall health ---
    # "not yet scheduled" isn't a real discrepancy — exclude it here too, same
    # as ReconciliationReport.discrepancy_count does.
    if not d or len(ok) + len(not_yet) == len(d):
        bullets.append(
            f"All {report.gtt_total} agents reconciled with no discrepancies — clean shift."
        )
        if not_yet:
            bullets.append(
                f"{len(not_yet)} agent(s) are on the floor but their shift hasn't started yet "
                f"— not counted as missing attendance."
            )
        return bullets

    mismatch_rate = len(unmatched) / total * 100
    if mismatch_rate > 20:
        bullets.append(
            f"High mismatch: {mismatch_rate:.0f}% of GTT clock-ins ({len(unmatched)} agents) "
            f"had no corresponding Verint adherence record. Investigate capture gap."
        )
    elif unmatched:
        bullets.append(
            f"{len(unmatched)} agent(s) clocked into GTT but were not visible in the "
            f"Verint adherence scan — check if they appeared after the last capture."
        )

    # --- Ghost sessions ---
    if ghost:
        bullets.append(
            f"{len(ghost)} agent(s) clocked OUT in GTT but still appear active in Verint "
            f"— possible ghost sessions. Supervisor review recommended."
        )

    # --- Agents in Verint with no GTT clock-in ---
    if no_clock:
        bullets.append(
            f"{len(no_clock)} agent(s) visible in Verint have no GTT clock-in for today — "
            f"may indicate an attendance logging gap or a late badge-in."
        )

    # --- Absenteeism rate (standard WFM metric) ---
    # % of the roster with a REAL gap (no_clock + unmatched) — deliberately
    # excludes not_yet_scheduled, same as discrepancy_count: an agent whose
    # shift hasn't started isn't absent.
    roster_size = report.verint_total or 1
    absent_count = len(unmatched) + len(no_clock)
    if absent_count > 0:
        absenteeism_rate = absent_count / roster_size * 100
        bullets.append(
            f"Absenteeism: {absenteeism_rate:.1f}% ({absent_count} of {roster_size} agents) "
            f"have a real attendance gap today."
        )

    # --- Agents whose shift hasn't started yet (excluded from the count above) ---
    if not_yet:
        bullets.append(
            f"{len(not_yet)} additional agent(s) are on the floor but their shift hasn't "
            f"started yet, per their own schedule — not counted as a discrepancy."
        )

    # --- Subgroup clustering (site connectivity signal) ---
    subgroup_counts = Counter(r.subgroup for r in unmatched if r.subgroup)
    for subgroup, count in subgroup_counts.most_common(3):
        if count >= 3:
            bullets.append(
                f"Possible site issue in '{subgroup}': {count} agents from that subgroup "
                f"are missing from Verint — check network/login connectivity."
            )

    # --- OOA severity summary ---
    ooa_rows = [r for r in ok if (r.ooa_seconds or 0) > 0]
    if ooa_rows:
        avg_ooa = sum(r.ooa_seconds for r in ooa_rows) / len(ooa_rows)  # type: ignore[arg-type]
        worst = max(ooa_rows, key=lambda r: r.ooa_seconds or 0)
        bullets.append(
            f"{len(ooa_rows)} matched agent(s) are out-of-adherence "
            f"(avg {avg_ooa/60:.1f} min OOA; worst: {worst.employee}, "
            f"{(worst.ooa_seconds or 0)//60} min)."
        )

    return bullets or ["No actionable discrepancies detected."]
