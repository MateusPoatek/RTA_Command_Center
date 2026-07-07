"""report_intelligence.py — deterministic intelligence bullet generator.

Takes a ReconciliationReport and returns 3-6 plain-English bullets that RTAs
and Scheduling can act on.  No LLM required for MVP — rules are domain-driven.
"""
from __future__ import annotations

from collections import Counter

from gtt_verint_reconciler import ReconciliationReport, DiscrepancyRow


def generate(report: ReconciliationReport) -> list[str]:
    bullets: list[str] = []
    d = report.discrepancies
    total = report.gtt_total or 1  # avoid division by zero

    unmatched = [r for r in d if r.discrepancy_type == "clocked_in_not_in_adherence"]
    ghost = [r for r in d if r.discrepancy_type == "clocked_out_still_active"]
    no_clock = [r for r in d if r.discrepancy_type == "in_adherence_no_clock_in"]
    ok = [r for r in d if r.discrepancy_type == "match_ok"]

    # --- Overall health ---
    if not d or len(ok) == len(d):
        bullets.append(
            f"All {report.gtt_total} agents reconciled with no discrepancies — clean shift."
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
