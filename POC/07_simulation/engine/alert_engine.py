"""
alert_engine.py
---------------
Pure rule evaluation layer for the CIBC RTA simulation engine.

Loads alert_thresholds.json and evaluates a list of AgentRow objects,
returning AlertResult objects for every agent that violates a threshold
or is out of adherence with their schedule.

No I/O side effects — all file loading is done once at import time via
load_thresholds(). The evaluate_agents() function is stateless and can
be called repeatedly across simulation cycles.

Rule types handled:
  time_limit_exceeded        — agent has been in a flagged status longer
                               than the CIBC threshold.
  scheduled_activity_mismatch — agent's actual status does not match their
                                scheduled activity.

Exception statuses (ABSU, TRGR, Vacation, etc.) are skipped entirely —
no alert is raised, per the workbook's 'consider before flagging' category.

BLEN compatibility:
  Agents scheduled as 'BLEN - Blended' are expected to be handling calls.
  Productive call-handling statuses (INBD, OUTB, CallOnHold, After Call Work,
  Ready, etc.) are NOT treated as OOA when the scheduled activity is BLEN.
  Time-limit rules still apply to these statuses normally.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

# Resolve rules relative to this file so the engine works from any cwd.
_RULES_DIR = Path(__file__).parent.parent.parent / "01_evidence_pack" / "rules"

# Statuses that are valid productive work for a BLEN-scheduled agent.
# These should NOT trigger an OOA alert — the agent is handling calls as
# expected. Time-limit rules still apply independently.
_BLENDED_COMPATIBLE_STATUSES: frozenset[str] = frozenset({
    "INBD - Inbound",
    "OUTB - Outbound",
    "CallOnHold",
    "After Call Work",
    "Ready",
    "CallConsult",
    "CallConference",
    "CallInternal",
    "DirectCallInbound",
    "OutboundCampaignCall",
})

_BLENDED_SCHEDULED = "BLEN - Blended"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class AgentRow:
    """Normalised agent row sourced from a Verint snapshot (real or synthetic)."""

    agent_id: str
    agent_name: str
    lob: str
    geo: str
    actual_status: str
    scheduled_activity: str
    duration_seconds: int
    adherence_pct: float
    coaching_sessions_this_week: int = 0
    huddles_this_week: int = 0
    open_tickets: int = 0

    # Derived from actualSchedule.events[] (min start / max end) — see
    # verint_extension/parse.js's deriveShiftProductive(). Empty string when
    # not available (e.g. older captures/snapshots that predate this field, OR
    # the agent hasn't generated any actual activity yet this shift).
    shift_start_iso: str = ""
    shift_end_iso: str = ""

    # Derived from publishedSchedule.events[] (the PLANNED schedule) — see
    # parse.js's deriveScheduledShift(). Unlike shift_start_iso/shift_end_iso
    # above, this is populated for EVERY agent once the day's schedule is
    # published, regardless of whether they've started working — use this to
    # answer "has this agent's shift started yet".
    scheduled_start_iso: str = ""
    scheduled_end_iso: str = ""

    # Raw minute counts (not percentages) from parse.js's deriveShiftProductive
    # (productive_*) and deriveAdherence (adherence/ooa) — cumulative up to
    # capture time, i.e. "so far today", not a full-shift total.
    productive_paid_minutes: int = 0
    productive_work_minutes: int = 0
    adherence_minutes: int = 0
    ooa_minutes: int = 0

    # {"<hour 0-23>": {"activeMinutes": int, "productiveMinutes": int}, ...}
    # from parse.js's deriveHourlyBuckets — for intraday charts (peak hour,
    # attendance evolution). {} if not available.
    hourly_buckets: dict = field(default_factory=dict)

    # Internal-only field used by snapshot loader; not part of the rule logic.
    _scenario: str = field(default="", repr=False)


@dataclass
class AlertResult:
    """
    Result of evaluating one AgentRow against the full rule set.

    escalation_cycle tracks how many consecutive 15-minute cycles this agent
    has been flagged for the same violation:
      0 — first occurrence  → alert supervisor channel
      1 — second occurrence → tag operations manager
      2+ — third or more    → senior RTA escalation
    """

    agent: AgentRow
    rule_type: Literal["time_limit_exceeded", "scheduled_activity_mismatch"]
    rule_id: str
    threshold_seconds: int | None
    threshold_label: str
    severity: Literal["info", "low", "medium", "high", "critical"]
    escalation_cycle: int
    is_exception: bool = False


# ---------------------------------------------------------------------------
# Rules loader
# ---------------------------------------------------------------------------

def load_thresholds() -> dict:
    """Load alert_thresholds.json from the evidence pack rules directory."""
    path = _RULES_DIR / "alert_thresholds.json"
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# Severity determination
# ---------------------------------------------------------------------------

def _determine_severity(
    rule_type: str,
    duration_seconds: int,
    threshold_seconds: int | None,
    escalation_cycle: int,
) -> Literal["info", "low", "medium", "high", "critical"]:
    """
    Map rule type + duration + escalation state to a severity level.

    Escalation cycle takes precedence: a persistent violation is always
    elevated regardless of raw duration.
    """
    if escalation_cycle >= 2:
        return "critical"
    if escalation_cycle == 1:
        return "high"

    if rule_type == "time_limit_exceeded" and threshold_seconds:
        # Significantly over threshold (2×) is HIGH even on first occurrence.
        if duration_seconds >= threshold_seconds * 2:
            return "high"
        return "medium"

    # Scheduled-activity mismatches start at MEDIUM on first occurrence.
    return "medium"


# ---------------------------------------------------------------------------
# Rule normalisation helpers
# ---------------------------------------------------------------------------

def _rule_id_from_status(prefix: str, status: str) -> str:
    """Convert a Verint status string to a stable snake_case rule ID."""
    return prefix + "_" + status.lower().replace(" ", "_").replace("-", "_").replace("/", "_")


# ---------------------------------------------------------------------------
# Core evaluation
# ---------------------------------------------------------------------------

def evaluate_agents(
    agents: list[AgentRow],
    thresholds: dict,
    persistence_map: dict[str, int] | None = None,
) -> list[AlertResult]:
    """
    Evaluate a list of AgentRow objects against the loaded threshold rules.

    Parameters
    ----------
    agents:
        Agent rows sourced from the current Verint snapshot (real or synthetic).
    thresholds:
        Loaded alert_thresholds.json dict.
    persistence_map:
        Maps agent_id → number of *previous* consecutive cycles the agent was
        flagged. Used to drive escalation logic. Pass None (or {}) for the
        first cycle.

    Returns
    -------
    List of AlertResult, one per flagged agent. Agents in exception statuses
    or below every applicable threshold are omitted.
    """
    if persistence_map is None:
        persistence_map = {}

    exception_statuses: set[str] = {
        e["status_from_verint"] for e in thresholds["exception_statuses"]
    }
    time_limited: dict[str, dict] = {
        r["status_from_verint"]: r for r in thresholds["time_limited_statuses"]
    }
    ooa_statuses: set[str] = {
        r["status_from_verint"] for r in thresholds["out_of_adherence_statuses"]
    }

    results: list[AlertResult] = []

    for agent in agents:
        status = agent.actual_status
        escalation_cycle = persistence_map.get(agent.agent_id, 0)

        # --- Exception gate -------------------------------------------
        # Exception statuses are never flagged. The RTA should review
        # them manually before raising any alert.
        if status in exception_statuses:
            continue

        # --- Rule 1: time limit exceeded ------------------------------
        # Check this first; a time-limit breach takes precedence over an
        # OOA mismatch for the same status to avoid double-counting.
        if status in time_limited:
            rule = time_limited[status]
            threshold_secs: int = rule["threshold_seconds"]
            if agent.duration_seconds > threshold_secs:
                results.append(
                    AlertResult(
                        agent=agent,
                        rule_type="time_limit_exceeded",
                        rule_id=_rule_id_from_status("time_limit", status),
                        threshold_seconds=threshold_secs,
                        threshold_label=f"{rule['threshold_minutes']} min",
                        severity=_determine_severity(
                            "time_limit_exceeded",
                            agent.duration_seconds,
                            threshold_secs,
                            escalation_cycle,
                        ),
                        escalation_cycle=escalation_cycle,
                    )
                )
                # Do not also raise an OOA alert for the same agent/status.
                continue

        # --- Rule 2: scheduled-activity mismatch ----------------------
        # Flag when the agent is in an OOA-watchlisted status AND that
        # status does not match their scheduled activity for this interval.
        #
        # BLEN exemption: agents scheduled as BLEN - Blended are expected
        # to be in productive call states. Skip OOA for those combinations
        # so that an agent on a normal inbound call is not wrongly flagged.
        if (
            status in ooa_statuses
            and status != agent.scheduled_activity
            and not (
                agent.scheduled_activity == _BLENDED_SCHEDULED
                and status in _BLENDED_COMPATIBLE_STATUSES
            )
        ):
            results.append(
                AlertResult(
                    agent=agent,
                    rule_type="scheduled_activity_mismatch",
                    rule_id=_rule_id_from_status("ooa", status),
                    threshold_seconds=None,
                    threshold_label="scheduled mismatch",
                    severity=_determine_severity(
                        "scheduled_activity_mismatch",
                        agent.duration_seconds,
                        None,
                        escalation_cycle,
                    ),
                    escalation_cycle=escalation_cycle,
                )
            )

    return results
