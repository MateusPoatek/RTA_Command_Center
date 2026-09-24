"""
cycle_simulator.py
------------------
Runs multiple 15-minute simulation cycles and tracks violation persistence
across cycles.

Persistence tracking implements the CIBC RTA escalation ladder documented in
the ABD for Real-Time Adherence Monitoring & Alerting:
  Cycle 1 (first flag)    → alert supervisor channel
  Cycle 2 (same agent)    → tag operations manager
  Cycle 3+ (same agent)   → escalate to senior RTA; include in EOD findings

The persistence_map is a dict[agent_id → consecutive_cycle_count] that
accumulates across cycles. Agents whose status resolves drop out of the map
automatically, so their next violation starts fresh at cycle 1.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .alert_engine import AgentRow, AlertResult, evaluate_agents, load_thresholds
from .card_builder import build_card


# ---------------------------------------------------------------------------
# Persistence state
# ---------------------------------------------------------------------------

@dataclass
class CycleState:
    """
    Tracks violation persistence across consecutive 15-minute cycles.

    persistence_map: agent_id → number of *completed* cycles this agent
    has been continuously flagged. This value is passed to evaluate_agents()
    as the escalation seed for the next cycle.
    """

    cycle: int = 0
    persistence_map: dict[str, int] = field(default_factory=dict)

    def update(self, flagged_agent_ids: set[str]) -> None:
        """
        Rebuild the persistence map after each cycle.

        Agents present in flagged_agent_ids have their count incremented.
        Agents NOT in flagged_agent_ids (resolved) are dropped from the map.
        """
        new_map: dict[str, int] = {}
        for agent_id in flagged_agent_ids:
            new_map[agent_id] = self.persistence_map.get(agent_id, 0) + 1
        self.persistence_map = new_map
        self.cycle += 1


# ---------------------------------------------------------------------------
# Multi-cycle runner
# ---------------------------------------------------------------------------

def run_simulation(
    snapshots: list[dict],
    snapshot_times: list[str],
) -> dict:
    """
    Execute a multi-cycle simulation and return a structured result dict.

    Parameters
    ----------
    snapshots:
        List of raw snapshot dicts (one per cycle), each with an "agents"
        list. Loaded from sim_snapshot_t0.json, sim_snapshot_t15.json, etc.
    snapshot_times:
        ISO-8601 timestamps corresponding to each snapshot.

    Returns
    -------
    dict with keys:
      simulation_id      — from the first snapshot
      shift_date         — from the first snapshot
      rta                — from the first snapshot
      geo                — from the first snapshot
      cycles_run         — number of cycles executed
      total_alerts_fired — sum across all cycles
      total_escalations  — alerts with escalation_cycle > 0
      cycle_summary      — per-cycle stats (without card bodies)
      all_cycles         — full cycle data including cards
      current_cards      — CommandCard[] from the final cycle (for the UI)
    """
    thresholds = load_thresholds()
    state = CycleState()
    all_cycles: list[dict] = []

    for snapshot, ts in zip(snapshots, snapshot_times):
        cycle_num = state.cycle + 1

        # Build AgentRow list, ignoring the _scenario annotation field.
        agents: list[AgentRow] = []
        for raw in snapshot["agents"]:
            agents.append(
                AgentRow(
                    agent_id=raw["agent_id"],
                    agent_name=raw["agent_name"],
                    lob=raw["lob"],
                    geo=raw["geo"],
                    actual_status=raw["actual_status"],
                    scheduled_activity=raw["scheduled_activity"],
                    duration_seconds=raw["duration_seconds"],
                    adherence_pct=raw["adherence_pct"],
                    coaching_sessions_this_week=raw.get(
                        "coaching_sessions_this_week", 0
                    ),
                    huddles_this_week=raw.get("huddles_this_week", 0),
                    open_tickets=raw.get("open_tickets", 0),
                    _scenario=raw.get("_scenario", ""),
                )
            )

        results: list[AlertResult] = evaluate_agents(
            agents, thresholds, state.persistence_map
        )
        cards = [build_card(r, ts, cycle_num) for r in results]

        flagged_ids = {r.agent.agent_id for r in results}
        state.update(flagged_ids)

        all_cycles.append(
            {
                "cycle": cycle_num,
                "snapshot_time": ts,
                "agent_count": len(agents),
                "alerts_fired": len(results),
                "escalations": sum(
                    1 for r in results if r.escalation_cycle > 0
                ),
                "cleared_since_last": (
                    len(
                        set(
                            all_cycles[-1].get("_flagged_ids", set())
                        )
                        - flagged_ids
                    )
                    if all_cycles
                    else 0
                ),
                "new_flags": (
                    len(
                        flagged_ids
                        - set(all_cycles[-1].get("_flagged_ids", set()))
                    )
                    if all_cycles
                    else len(flagged_ids)
                ),
                "persistence_map_snapshot": dict(state.persistence_map),
                "cards": cards,
                # Internal tracking field, excluded from cycle_summary output.
                "_flagged_ids": flagged_ids,
            }
        )

    current_cards = all_cycles[-1]["cards"] if all_cycles else []

    return {
        "simulation_id": snapshots[0].get("simulation_id", "sim-001"),
        "shift_date": snapshots[0].get("shift_date"),
        "rta": snapshots[0].get("rta"),
        "geo": snapshots[0].get("geo"),
        "cycles_run": len(all_cycles),
        "total_alerts_fired": sum(c["alerts_fired"] for c in all_cycles),
        "total_escalations": sum(c["escalations"] for c in all_cycles),
        "cycle_summary": [
            {k: v for k, v in c.items() if not k.startswith("_") and k != "cards"}
            for c in all_cycles
        ],
        "all_cycles": [
            {k: v for k, v in c.items() if not k.startswith("_")}
            for c in all_cycles
        ],
        "current_cards": current_cards,
    }
