"""Unit tests for gtt_adapter row parsing. Runs under pytest or `python -m unittest`."""

import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from gtt_adapter import _parse_row  # noqa: E402

# Shape of the 22-column sample row in "CR Function - GTT Post Morten Report.docx"
# (personal fields replaced with synthetic values).
DOCX_ROW = [
    "SV - Santa Tecla - Plaza Merliot", "agent@example.com", "10000001",
    "Luis Ramos Diaz", "Ana Morales", "CC-700-GOPS",
    "First American - Database Solutions & Mortgage Solutions", "clock_in",
    "2024-11-01", "05:45:15", "2024-11-01", "05:45:15", "00:00:00", "10.0.0.1",
    "Start of the shift 10000001", "pending", "Central America (America/El_Salvador)",
    "2024-11-01", "11:45:15", "2024-11-01", "11:45:15", 1730461515782,
]


class ParseRowTests(unittest.TestCase):
    def test_utc_comes_from_start_utc_columns(self):
        row = _parse_row(DOCX_ROW)
        self.assertEqual(row.event_dt_utc, datetime(2024, 11, 1, 11, 45, 15))
        self.assertEqual(row.event_dt_eastern, datetime(2024, 11, 1, 5, 45, 15))
        self.assertEqual(row.event_type, "clock_in")
        self.assertEqual(row.workday_id, "10000001")


if __name__ == "__main__":
    unittest.main()
