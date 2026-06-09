"""Unit tests for verint_triage. Runs under pytest or `python -m unittest`."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _engine_bridge import AgentRow  # noqa: E402
from verint_triage import severity_from_ooa, triage  # noqa: E402


def make_row(agent_id="a1", name="Avery, Sam", ooa_seconds=667,
             actual="Zillow_Break 2", scheduled="Zillow_Email"):
    return AgentRow(
        agent_id=agent_id,
        agent_name=name,
        lob="Zillow",
        geo="Philippines",
        actual_status=actual,
        scheduled_activity=scheduled,
        duration_seconds=ooa_seconds,
        adherence_pct=78.0,
    )


class SeverityTests(unittest.TestCase):
    def test_escalation_overrides_duration(self):
        self.assertEqual(severity_from_ooa(10, escalation_cycle=2), "critical")
        self.assertEqual(severity_from_ooa(10, escalation_cycle=1), "high")

    def test_duration_ladder_first_cycle(self):
        self.assertEqual(severity_from_ooa(25 * 60, 0), "high")     # >= 20m
        self.assertEqual(severity_from_ooa(667, 0), "medium")       # >= 5m
        self.assertEqual(severity_from_ooa(100, 0), "low")          # < 5m

    def test_breakpoints_inclusive(self):
        self.assertEqual(severity_from_ooa(5 * 60, 0), "medium")
        self.assertEqual(severity_from_ooa(20 * 60, 0), "high")


class TriageTests(unittest.TestCase):
    def test_flags_out_of_adherence_row(self):
        results = triage([make_row(ooa_seconds=667)])
        self.assertEqual(len(results), 1)
        r = results[0]
        self.assertEqual(r.rule_type, "scheduled_activity_mismatch")
        self.assertEqual(r.rule_id, "verint_ooa_zillow_break_2")
        self.assertEqual(r.threshold_label, "Verint OOA")
        self.assertIsNone(r.threshold_seconds)
        self.assertEqual(r.severity, "medium")
        self.assertEqual(r.escalation_cycle, 0)

    def test_skips_in_adherence_row(self):
        self.assertEqual(triage([make_row(ooa_seconds=0)]), [])

    def test_min_threshold_floor(self):
        # With a 5-min floor, a 100s OOA is not raised.
        self.assertEqual(triage([make_row(ooa_seconds=100)], min_ooa_seconds=300), [])
        self.assertEqual(len(triage([make_row(ooa_seconds=400)], min_ooa_seconds=300)), 1)

    def test_persistence_drives_escalation(self):
        row = make_row(agent_id="x9", ooa_seconds=667)
        first = triage([row], persistence_map={})
        self.assertEqual(first[0].severity, "medium")
        self.assertEqual(first[0].escalation_cycle, 0)

        second = triage([row], persistence_map={"x9": 1})
        self.assertEqual(second[0].severity, "high")
        self.assertEqual(second[0].escalation_cycle, 1)

        third = triage([row], persistence_map={"x9": 2})
        self.assertEqual(third[0].severity, "critical")

    def test_mixed_batch(self):
        rows = [
            make_row(agent_id="in", ooa_seconds=0),     # in adherence -> skip
            make_row(agent_id="out", ooa_seconds=1500),  # 25m -> high
        ]
        results = triage(rows)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].agent.agent_id, "out")
        self.assertEqual(results[0].severity, "high")

    def test_result_is_engine_alertresult(self):
        # The AlertResult we produce must be the engine's class so build_card
        # accepts it later (same class via _engine_bridge).
        from engine.alert_engine import AlertResult as EngineAlertResult
        results = triage([make_row()])
        self.assertIsInstance(results[0], EngineAlertResult)


if __name__ == "__main__":
    unittest.main()
