"""
alert_formatter.py
------------------
Generates human-readable alert messages and recommended actions from
AlertResult objects, matching the format Axel and the RTA team use in
Google Chat LOB channels.

All output is deterministic: same inputs always produce the same text.
No I/O side effects.

Alert message format (matches ABD documented convention):
  First occurrence:   "<LOB> alert: <Agent> — <Status> <MM:SS>
                       (scheduled: <ScheduledActivity>). Please check."
  Second occurrence:  "@supervisor <LOB> follow-up: <Agent> — still in
                       <Status> <MM:SS>. Second consecutive cycle.
                       Intervention needed."
  Third+ occurrence:  "@operations_manager ESCALATION <LOB>: <Agent> —
                       <Status> <MM:SS>. <N> consecutive cycles.
                       Senior RTA may need to review."
"""

from __future__ import annotations

import json
from pathlib import Path

from .alert_engine import AlertResult

_DATA_DIR = Path(__file__).parent.parent / "data"


# ---------------------------------------------------------------------------
# LOB → Google Chat channel mapping
# ---------------------------------------------------------------------------

def _load_channel_map() -> dict[str, str]:
    """
    Build a flat lob_name → channel_name lookup from lob_channel_map.json.
    Aliases are expanded so lookups work regardless of how the LOB is labelled
    in the Verint snapshot.
    """
    path = _DATA_DIR / "lob_channel_map.json"
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)

    mapping: dict[str, str] = {}
    for entry in data["routing"]:
        channel = entry["chat_channel"]
        mapping[entry["lob"].strip().lower()] = channel
        for alias in entry.get("lob_aliases", []):
            mapping[alias.strip().lower()] = channel

    return mapping


_CHANNEL_MAP: dict[str, str] = _load_channel_map()
_FALLBACK_CHANNEL = "RTA Escalation TLB"


def lob_channel(lob: str) -> str:
    """Return the Google Chat channel name for a given LOB string."""
    return _CHANNEL_MAP.get(lob.strip().lower(), _FALLBACK_CHANNEL)


# ---------------------------------------------------------------------------
# Duration formatting
# ---------------------------------------------------------------------------

def format_duration(seconds: int) -> str:
    """Format a duration in seconds as MM:SS."""
    m, s = divmod(abs(seconds), 60)
    return f"{m:02d}:{s:02d}"


# ---------------------------------------------------------------------------
# Alert message drafting
# ---------------------------------------------------------------------------

def draft_alert_message(result: AlertResult) -> str:
    """
    Produce the text the RTA would type (or the bot would post) into the
    LOB Google Chat channel.
    """
    agent_name = result.agent.agent_name
    status = result.agent.actual_status
    duration = format_duration(result.agent.duration_seconds)
    lob = result.agent.lob
    scheduled = result.agent.scheduled_activity
    cycle = result.escalation_cycle

    if cycle == 0:
        return (
            f"{lob} alert: {agent_name} — {status} {duration} "
            f"(scheduled: {scheduled}). Please check."
        )
    if cycle == 1:
        return (
            f"@supervisor {lob} follow-up: {agent_name} — still in "
            f"{status} {duration}. Second consecutive cycle. "
            f"Intervention needed."
        )
    # cycle >= 2
    return (
        f"@operations_manager ESCALATION {lob}: {agent_name} — "
        f"{status} {duration}. {cycle + 1} consecutive cycles. "
        f"Senior RTA may need to review."
    )


# ---------------------------------------------------------------------------
# Recommended action text
# ---------------------------------------------------------------------------

def recommended_action(result: AlertResult) -> str:
    """
    One-line action recommendation shown in the CommandCard.

    Mirrors the escalation ladder documented in the ABD:
      cycle 0 → supervisor channel
      cycle 1 → tag OM
      cycle 2+ → senior RTA + EOD findings
    """
    cycle = result.escalation_cycle

    if cycle == 0:
        return (
            "Review and send alert to LOB channel. "
            "Suppress if a known exception applies."
        )
    if cycle == 1:
        return (
            "Persistent violation (2nd cycle): tag supervisor in "
            "follow-up. Prepare OM tag if unresolved next cycle."
        )
    return (
        "Escalate to Operations Manager. Document in EOD findings "
        "for senior RTA review."
    )
