"""
card_builder.py
---------------
Assembles CommandCard JSON objects from AlertResult + AlertFormatter data,
matching the CommandCard TypeScript interface defined in:
  POC/04_demo_ui/command-center-demo/src/domain/types.ts

Every field name and every allowed value mirrors the TypeScript union types
exactly, so the output JSON can be imported directly into the React demo UI
without transformation.

Key design note:
  The `source.detail` field carries the adapter provenance message — it
  explicitly names the synthetic adapter and lists the real adapters that
  would replace it in production. This is the core of the demo narrative.
"""

from __future__ import annotations

from .alert_engine import AlertResult
from .alert_formatter import draft_alert_message, lob_channel, recommended_action


# ---------------------------------------------------------------------------
# Field mapping helpers
# ---------------------------------------------------------------------------

def _escalation_cycle_to_status(cycle: int) -> str:
    """Map persistence cycle → CardStatus value."""
    if cycle == 0:
        return "needs-review"
    if cycle == 1:
        return "classified"
    return "escalated"


def _escalation_cycle_to_available_actions(cycle: int) -> list[str]:
    """CardAction[] available to the RTA based on escalation depth."""
    if cycle == 0:
        return [
            "approve-send",
            "edit-message",
            "suppress",
            "add-to-handoff",
            "ask-ai-why",
            "teach-ai-correct-rule",
        ]
    if cycle == 1:
        return [
            "approve-send",
            "escalate-om",
            "edit-message",
            "suppress",
            "add-to-handoff",
        ]
    return ["escalate-om", "add-to-handoff", "mark-resolved"]


def _escalation_cycle_to_target_channels(cycle: int) -> list[str]:
    """TargetChannel[] appropriate for the escalation depth."""
    if cycle == 0:
        return ["google-chat-lob", "supervisor", "audit-only"]
    if cycle == 1:
        return ["google-chat-lob", "supervisor", "om", "handoff"]
    return ["om", "senior-rta", "handoff", "audit-only"]


def _confidence(rule_type: str) -> float:
    """
    Confidence score for the card.

    Time-limit rules are higher-confidence because duration is an objective
    measurement. Schedule-mismatch rules carry more uncertainty because
    the scheduled activity context is not always visible in the Verint
    grid without additional LOB tab / filter context (as noted in the
    OCR baseline findings).
    """
    return 0.91 if rule_type == "time_limit_exceeded" else 0.74


def _card_type(escalation_cycle: int) -> str:
    """CardType: first occurrence is 'alert'; persistence upgrades to 'escalation'."""
    return "alert" if escalation_cycle == 0 else "escalation"


def _card_title(result: AlertResult) -> str:
    status = result.agent.actual_status
    if result.rule_type == "time_limit_exceeded":
        label = result.threshold_label or "threshold"
        return f"{status} over {label}"
    return f"Out-of-adherence: {status}"


def _card_summary(result: AlertResult) -> str:
    agent = result.agent
    m, s = divmod(agent.duration_seconds, 60)
    duration_str = f"{m}:{s:02d}"

    if result.rule_type == "time_limit_exceeded":
        return (
            f"{agent.agent_name} ({agent.lob}) — {agent.actual_status} "
            f"for {duration_str} (threshold: {result.threshold_label})."
        )
    return (
        f"{agent.agent_name} ({agent.lob}) — scheduled "
        f"{agent.scheduled_activity} but currently in {agent.actual_status}."
    )


# ---------------------------------------------------------------------------
# CommandCard builder
# ---------------------------------------------------------------------------

def build_card(
    result: AlertResult,
    snapshot_time: str,
    cycle: int,
    *,
    data_class: str = "simulated",
    source_label: str | None = None,
    source_detail: str | None = None,
    source_artifact: str | None = None,
    card_id_prefix: str = "sim",
) -> dict:
    """
    Build a single CommandCard dict from an AlertResult.

    Parameters
    ----------
    result:
        AlertResult produced by alert_engine.evaluate_agents() (simulation) or
        verint_triage.triage() (live path — same AlertResult class).
    snapshot_time:
        ISO-8601 timestamp of the snapshot this result was derived from.
    cycle:
        Simulation cycle number (1-indexed).

    Keyword-only provenance overrides (default to the simulated values, so
    existing callers get byte-identical output):
    data_class:
        Value for the card-level / source / auditEvents `dataClass`. Live cards
        pass e.g. "evidence-backed".
    source_label / source_detail / source_artifact:
        Override the `source.*` provenance strings. None -> simulated defaults.
    card_id_prefix:
        Prefix for the card id (default "sim"; live path passes "live").

    Returns
    -------
    dict matching the CommandCard interface in types.ts.
    """
    agent = result.agent
    card_id = f"{card_id_prefix}-c{cycle}-{agent.agent_id}-{result.rule_id}"

    agent_profile = {
        "name": agent.agent_name,
        "id": agent.agent_id,
        "lob": agent.lob,
        "geo": agent.geo,
        "currentStatus": agent.actual_status,
        "scheduledActivity": agent.scheduled_activity,
        "adherenceInPercent": round(agent.adherence_pct, 1),
        "adherenceOutPercent": round(100.0 - agent.adherence_pct, 1),
        "coachingSessionsThisWeek": agent.coaching_sessions_this_week,
        "huddlesThisWeek": agent.huddles_this_week,
        "openTickets": agent.open_tickets,
        "recommendedAction": recommended_action(result),
        "schedulePreview": [
            f"Today: {agent.scheduled_activity}",
            "Tomorrow: BLEN - Blended",
            "Next week: schedule TBD",
        ],
    }

    audit_events = [
        {
            "id": f"audit-{card_id}-created",
            "timestamp": snapshot_time,
            "actor": "ai",
            "action": "Card created by simulation engine",
            "detail": (
                f"Rule: {result.rule_id} | "
                f"Duration: {agent.duration_seconds}s | "
                f"Cycle: {cycle}"
            ),
            "dataClass": data_class,
        }
    ]

    if result.escalation_cycle > 0:
        audit_events.append(
            {
                "id": f"audit-{card_id}-persist",
                "timestamp": snapshot_time,
                "actor": "system",
                "action": f"Persistence detected: cycle {result.escalation_cycle + 1}",
                "detail": (
                    "Same violation present in consecutive 15-minute cycle. "
                    "Escalation path triggered per ABD rules."
                ),
                "dataClass": data_class,
            }
        )

    t_offset = (cycle - 1) * 15

    source_label_final = source_label if source_label is not None else (
        f"Simulation engine | cycle {cycle} | rule: {result.rule_id}"
    )
    source_detail_final = source_detail if source_detail is not None else (
        f"Input adapter: synthetic Verint snapshot "
        f"(sim_snapshot_t{t_offset}.json). "
        "In production, swap this adapter for: "
        "Verint REST API / Vision Agent OCR + Cloud Vision / "
        "Google Apps Script export / Verint webhook. "
        "The rules engine and card builder remain unchanged."
    )
    source_artifact_final = source_artifact if source_artifact is not None else (
        f"POC/07_simulation/data/sim_snapshot_t{t_offset}.json"
    )

    return {
        "id": card_id,
        "lane": "real-time-adherence",
        "type": _card_type(result.escalation_cycle),
        "title": _card_title(result),
        "summary": _card_summary(result),
        "owner": "shared",
        "status": _escalation_cycle_to_status(result.escalation_cycle),
        "severity": result.severity,
        "dataClass": data_class,
        "source": {
            "dataClass": data_class,
            "label": source_label_final,
            "detail": source_detail_final,
            "artifact": source_artifact_final,
        },
        "confidence": _confidence(result.rule_type),
        "lob": agent.lob,
        "geo": agent.geo,
        "agent": agent_profile,
        "rule": {
            "id": result.rule_id,
            "description": _card_title(result),
            "threshold": result.threshold_label,
        },
        "recommendedAction": recommended_action(result),
        "availableActions": _escalation_cycle_to_available_actions(
            result.escalation_cycle
        ),
        "targetChannels": _escalation_cycle_to_target_channels(
            result.escalation_cycle
        ),
        "selectedChannel": "google-chat-lob",
        "draftMessage": draft_alert_message(result),
        "auditEvents": audit_events,
    }
