"""Tests for verint_pipeline.run_pipeline (browser-free end-to-end)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from verint_pipeline import run_pipeline  # noqa: E402

CAPTURE = {
    "captured_at": "2026-06-03T19:22:17-08:00",
    "source_url": "https://wfo.a87.verintcloudservices.com",
    "view": "Zillow — All Current",
    "lob": "Zillow",
    "geo": "Philippines",
    "cycle": 1,
    "persistence_map": {},
    "rows": [
        {"name": "Avery, Sam", "scheduled_activity": "Zillow_Email",
         "out_of_adherence": "0:11:07", "actual_activity": "Zillow_Break 2",
         "time_in_activity": "0:11:07", "days_adherence": "78%"},        # medium
        {"name": "Bennett, Robin", "scheduled_activity": "Zillow_Email",
         "out_of_adherence": "0:24:30", "actual_activity": "Zillow_Lunch",
         "time_in_activity": "0:24:30", "days_adherence": "64%"},        # high
        {"name": "Dalton, Lee", "scheduled_activity": "Zillow_Email",
         "out_of_adherence": "", "actual_activity": "Zillow_Email",
         "time_in_activity": "1:02:00", "days_adherence": "99%"},        # in adherence
    ],
}


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.result = run_pipeline(CAPTURE)

    def test_counts(self):
        c = self.result["counts"]
        self.assertEqual(c["rows"], 3)
        self.assertEqual(c["in_adherence"], 1)
        self.assertEqual(c["alerts"], 2)  # Chen is in adherence -> skipped

    def test_severities(self):
        sev = {a["agent_name"]: a["severity"] for a in self.result["alerts"]}
        self.assertEqual(sev["Avery, Sam"], "medium")
        self.assertEqual(sev["Bennett, Robin"], "high")
        self.assertNotIn("Dalton, Lee", sev)

    def test_cards_are_live_provenance(self):
        self.assertEqual(len(self.result["cards"]), 2)
        for card in self.result["cards"]:
            self.assertEqual(card["dataClass"], "evidence-backed")
            self.assertEqual(card["source"]["dataClass"], "evidence-backed")
            self.assertTrue(card["id"].startswith("live-c1-"))
            self.assertIn("Live Verint browser capture", card["source"]["label"])
            self.assertTrue(card["draftMessage"])

    def test_draft_messages_present(self):
        for a in self.result["alerts"]:
            self.assertTrue(a["draft_message"])
            self.assertIn(a["agent_name"], a["draft_message"])

    def test_zillow_routes_to_fallback_channel(self):
        # Zillow is not in the CIBC channel map -> documented fallback (expected).
        for a in self.result["alerts"]:
            self.assertTrue(a["channel_is_fallback"])

    def test_data_class_override(self):
        result = run_pipeline(CAPTURE, data_class="simulated")
        self.assertTrue(all(c["dataClass"] == "simulated" for c in result["cards"]))


if __name__ == "__main__":
    unittest.main()
