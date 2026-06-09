"""
verint_triage.py
----------------
The TRIAGE layer for the live computer-use path (decision D6).

Verint's ADHERENCE grid already DETECTS out-of-adherence (the "Out Of Adherence"
column + "Too Long In Activity" counter). Re-deriving that with CIBC-canonical
thresholds would be redundant and would not match this tenant's LOB-custom
activities anyway. So instead of calling alert_engine.evaluate_agents(), the
live path CONSUMES Verint's verdict here and adds the layer the RTA does by hand:
severity, escalation tracking, and (downstream) routing / cards / draft messages.

The simulation engine's evaluate_agents() is intentionally left untouched; this
module is a parallel live path that reuses the same AlertResult / AgentRow
dataclasses (via _engine_bridge) so build_card() accepts our results unchanged.

No network, no LLM, no file I/O. Pure functions, fully unit-testable.
"""

from __future__ import annotations

import re
from typing import Iterable

from _engine_bridge import AgentRow, AlertResult

# Below this many seconds out of adherence we do not raise (0 = flag any OOA).
DEFAULT_MIN_OOA_SECONDS = 0

# Severity duration breakpoints (first-occurrence). Escalation overrides below.
_HIGH_OOA_SECONDS = 20 * 60     # >= 20 min out of adherence -> high
_MEDIUM_OOA_SECONDS = 5 * 60    # >= 5 min  -> medium ; else low


def _slug(text: str) -> str:
    """Stable snake_case token for a rule id, e.g. 'Zillow_Break 2' -> 'zillow_break_2'."""
    return re.sub(r"[^a-z0-9]+", "_", (text or "").lower()).strip("_")


def severity_from_ooa(ooa_seconds: int, escalation_cycle: int) -> str:
    """
    Map OOA duration + escalation state to a CardSeverity value.

    Escalation takes precedence (a persistent violation is always elevated):
        cycle >= 2 -> critical
        cycle == 1 -> high
    Otherwise scale by how long the agent has been out of adherence:
        >= 20 min -> high ; >= 5 min -> medium ; else low
    """
    if escalation_cycle >= 2:
        return "critical"
    if escalation_cycle == 1:
        return "high"
    if ooa_seconds >= _HIGH_OOA_SECONDS:
        return "high"
    if ooa_seconds >= _MEDIUM_OOA_SECONDS:
        return "medium"
    return "low"


def triage(
    rows: Iterable[AgentRow],
    persistence_map: dict[str, int] | None = None,
    min_ooa_seconds: int = DEFAULT_MIN_OOA_SECONDS,
) -> list[AlertResult]:
    """
    Produce AlertResult objects for rows Verint marked out of adherence.

    Parameters
    ----------
    rows:
        AgentRow objects from verint_normalize.to_agent_rows(). Their
        `duration_seconds` carries Verint's OOA duration.
    persistence_map:
        agent_id -> number of *previous* consecutive cycles this agent was
        flagged. Drives escalation. None/{} for the first cycle.
    min_ooa_seconds:
        Minimum OOA duration to raise on. Default 0 flags any positive OOA
        (Verint already decided it is a violation).

    Returns
    -------
    One AlertResult per flagged agent. In-adherence rows (OOA <= threshold) are
    omitted.
    """
    pmap = persistence_map or {}
    results: list[AlertResult] = []

    for row in rows:
        ooa = row.duration_seconds
        if ooa <= min_ooa_seconds:
            continue  # Verint says in adherence (or below floor) -> no alert.

        cycle = pmap.get(row.agent_id, 0)
        results.append(
            AlertResult(
                agent=row,
                # Verint's verdict is a schedule/actual mismatch by definition.
                rule_type="scheduled_activity_mismatch",
                rule_id=f"verint_ooa_{_slug(row.actual_status)}",
                threshold_seconds=None,
                threshold_label="Verint OOA",
                severity=severity_from_ooa(ooa, cycle),
                escalation_cycle=cycle,
            )
        )

    return results
