"""Unit tests for verint_normalize. Runs under pytest or `python -m unittest`."""

import os
import sys
import unittest

# Bootstrap import path (so this runs under plain unittest, not just pytest).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from verint_normalize import (  # noqa: E402
    parse_duration,
    parse_pct,
    stable_agent_id,
    to_agent_row,
    to_agent_rows,
)

# A row exactly as seen live: Avery, Sam out of adherence 0:11:07.
LIVE_ROW = {
    "name": "Avery, Sam",
    "scheduled_activity": "Zillow_Email",
    "out_of_adherence": "0:11:07",
    "actual_activity": "Zillow_Break 2",
    "time_in_activity": "0:11:07",
    "days_adherence": "78%",
}


class ParseDurationTests(unittest.TestCase):
    def test_h_mm_ss(self):
        self.assertEqual(parse_duration("0:11:07"), 667)

    def test_mm_ss(self):
        self.assertEqual(parse_duration("11:07"), 667)

    def test_full_hours(self):
        self.assertEqual(parse_duration("1:02:03"), 3723)

    def test_zero(self):
        self.assertEqual(parse_duration("0:00"), 0)

    def test_blank_and_none(self):
        self.assertEqual(parse_duration(""), 0)
        self.assertEqual(parse_duration("   "), 0)
        self.assertEqual(parse_duration(None), 0)

    def test_whitespace_padding(self):
        self.assertEqual(parse_duration("  0:11:07 "), 667)

    def test_bare_seconds(self):
        self.assertEqual(parse_duration("45"), 45)

    def test_unparseable_raises(self):
        with self.assertRaises(ValueError):
            parse_duration("abc")
        with self.assertRaises(ValueError):
            parse_duration("1:2:3:4")


class ParsePctTests(unittest.TestCase):
    def test_with_sign(self):
        self.assertEqual(parse_pct("78%"), 78.0)

    def test_without_sign(self):
        self.assertEqual(parse_pct("100"), 100.0)

    def test_whitespace(self):
        self.assertEqual(parse_pct(" 78 % "), 78.0)

    def test_blank_and_none(self):
        self.assertEqual(parse_pct(""), 0.0)
        self.assertEqual(parse_pct(None), 0.0)

    def test_unparseable_raises(self):
        with self.assertRaises(ValueError):
            parse_pct("N/A")


class StableAgentIdTests(unittest.TestCase):
    def test_deterministic(self):
        a = stable_agent_id("Avery, Sam", "Zillow", "Philippines")
        b = stable_agent_id("Avery, Sam", "Zillow", "Philippines")
        self.assertEqual(a, b)
        self.assertEqual(len(a), 12)

    def test_case_and_space_insensitive(self):
        self.assertEqual(
            stable_agent_id("Avery, Sam", "Zillow", "PH"),
            stable_agent_id("  avery, sam ", " zillow ", "ph"),
        )

    def test_differs_by_lob(self):
        self.assertNotEqual(
            stable_agent_id("Avery, Sam", "Zillow", "PH"),
            stable_agent_id("Avery, Sam", "TikTok", "PH"),
        )


class ToAgentRowTests(unittest.TestCase):
    def test_maps_live_row(self):
        row = to_agent_row(LIVE_ROW, lob="Zillow", geo="Philippines")
        self.assertEqual(row.agent_name, "Avery, Sam")
        self.assertEqual(row.lob, "Zillow")
        self.assertEqual(row.geo, "Philippines")
        # Activity names are verbatim (no canonical remap — D6).
        self.assertEqual(row.actual_status, "Zillow_Break 2")
        self.assertEqual(row.scheduled_activity, "Zillow_Email")
        # duration_seconds is the Verint OOA duration.
        self.assertEqual(row.duration_seconds, 667)
        self.assertEqual(row.adherence_pct, 78.0)
        self.assertTrue(row.agent_id)

    def test_in_adherence_row_has_zero_duration(self):
        in_adh = dict(LIVE_ROW, out_of_adherence="")
        row = to_agent_row(in_adh, lob="Zillow", geo="PH")
        self.assertEqual(row.duration_seconds, 0)

    def test_missing_name_raises(self):
        with self.assertRaises(ValueError):
            to_agent_row(dict(LIVE_ROW, name=""), lob="Zillow", geo="PH")

    def test_batch(self):
        rows = to_agent_rows([LIVE_ROW, LIVE_ROW], lob="Zillow", geo="PH")
        self.assertEqual(len(rows), 2)


if __name__ == "__main__":
    unittest.main()
