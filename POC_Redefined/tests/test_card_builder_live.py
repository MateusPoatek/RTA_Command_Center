"""
Tests for the live-provenance params added to engine.card_builder.build_card.

Verifies (a) the live path emits honest live labels and (b) the default call is
unchanged (simulated) — the byte-identical guarantee at the unit level.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _engine_bridge import AgentRow  # noqa: E402  (puts engine on sys.path)
from engine.card_builder import build_card  # noqa: E402
from verint_triage import triage  # noqa: E402

SNAPSHOT_TIME = "2026-06-03T19:22:17-08:00"

LIVE_LABEL = "Live Verint browser adapter | cycle 1 | rule: verint_ooa_zillow_break_2"
LIVE_DETAIL = (
    "DOM extraction from wfo.a87.verintcloudservices.com -> verint_normalize -> "
    "verint_triage. Adapter swappable for Verint REST/OCR/webhook."
)
LIVE_ARTIFACT = "live-capture 2026-06-03T19:22:17-08:00"


def _live_result():
    row = AgentRow(
        agent_id="0928bf2a2318",
        agent_name="Avery, Sam",
        lob="Zillow",
        geo="Philippines",
        actual_status="Zillow_Break 2",
        scheduled_activity="Zillow_Email",
        duration_seconds=667,
        adherence_pct=78.0,
    )
    return triage([row])[0]


class LiveCardTests(unittest.TestCase):
    def setUp(self):
        self.card = build_card(
            _live_result(),
            SNAPSHOT_TIME,
            cycle=1,
            data_class="evidence-backed",
            source_label=LIVE_LABEL,
            source_detail=LIVE_DETAIL,
            source_artifact=LIVE_ARTIFACT,
            card_id_prefix="live",
        )

    def test_card_data_class_is_live_honest(self):
        self.assertEqual(self.card["dataClass"], "evidence-backed")
        self.assertEqual(self.card["source"]["dataClass"], "evidence-backed")

    def test_source_provenance_overridden(self):
        self.assertEqual(self.card["source"]["label"], LIVE_LABEL)
        self.assertEqual(self.card["source"]["detail"], LIVE_DETAIL)
        self.assertEqual(self.card["source"]["artifact"], LIVE_ARTIFACT)

    def test_card_id_prefix(self):
        self.assertTrue(self.card["id"].startswith("live-c1-0928bf2a2318-"))

    def test_audit_events_carry_live_data_class(self):
        self.assertTrue(self.card["auditEvents"])
        for ev in self.card["auditEvents"]:
            self.assertEqual(ev["dataClass"], "evidence-backed")

    def test_card_still_has_draft_message_and_actions(self):
        # The card/format layer is reused unchanged on the live path.
        self.assertTrue(self.card["draftMessage"])
        self.assertIn("availableActions", self.card)


class DefaultStillSimulatedTests(unittest.TestCase):
    """A default call (no provenance kwargs) must be unchanged: simulated."""

    def setUp(self):
        self.card = build_card(_live_result(), SNAPSHOT_TIME, cycle=1)

    def test_defaults_to_simulated(self):
        self.assertEqual(self.card["dataClass"], "simulated")
        self.assertEqual(self.card["source"]["dataClass"], "simulated")

    def test_default_id_prefix_sim(self):
        self.assertTrue(self.card["id"].startswith("sim-c1-"))

    def test_default_source_label_is_simulation_engine(self):
        self.assertEqual(
            self.card["source"]["label"],
            "Simulation engine | cycle 1 | rule: verint_ooa_zillow_break_2",
        )

    def test_default_audit_data_class_simulated(self):
        for ev in self.card["auditEvents"]:
            self.assertEqual(ev["dataClass"], "simulated")


if __name__ == "__main__":
    unittest.main()
