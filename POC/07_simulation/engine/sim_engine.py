#!/usr/bin/env python3
"""
sim_engine.py
-------------
CLI entry point for the CIBC RTA POC Simulation Engine.

Loads synthetic Verint snapshots, runs the alert rules engine across one or
two 15-minute cycles, and writes structured output for review and demo use.

Usage
-----
  # Run 2-cycle simulation (default), output to simulation/output/
  python engine/sim_engine.py

  # Single-cycle (T+0 only)
  python engine/sim_engine.py --cycles 1

  # 2-cycle + copy sim_cards.json into the React demo UI's src/data/
  python engine/sim_engine.py --output ui

Output files
------------
  POC/07_simulation/output/sim_result.json   — full multi-cycle result
  POC/07_simulation/output/sim_cards.json    — CommandCard[] for latest cycle
  POC/07_simulation/output/sim_report.md     — human-readable markdown report

  With --output ui:
  POC/04_demo_ui/command-center-demo/src/data/sim_cards.json
    (also written; React app can import this to show simulated cards)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Ensure the engine package is importable regardless of working directory.
sys.path.insert(0, str(Path(__file__).parent.parent))

from engine.cycle_simulator import run_simulation  # noqa: E402

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_SIM_DIR = Path(__file__).parent.parent
_DATA_DIR = _SIM_DIR / "data"
_OUTPUT_DIR = _SIM_DIR / "output"
_UI_DATA_DIR = (
    _SIM_DIR.parent
    / "04_demo_ui"
    / "command-center-demo"
    / "src"
    / "data"
)

_SNAPSHOT_FILES = [
    _DATA_DIR / "sim_snapshot_t0.json",
    _DATA_DIR / "sim_snapshot_t15.json",
]
_SNAPSHOT_TIMES = [
    "2026-04-29T13:00:00-06:00",
    "2026-04-29T13:15:00-06:00",
]


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def _load_snapshot(path: Path) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _write_output(result: dict, copy_to_ui: bool = False) -> None:
    _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    result_path = _OUTPUT_DIR / "sim_result.json"
    with open(result_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)
    print(f"  ✓ Full result    → {result_path}")

    cards_path = _OUTPUT_DIR / "sim_cards.json"
    with open(cards_path, "w", encoding="utf-8") as fh:
        json.dump(result["current_cards"], fh, indent=2)
    print(f"  ✓ UI cards       → {cards_path}")

    report_path = _OUTPUT_DIR / "sim_report.md"
    with open(report_path, "w", encoding="utf-8") as fh:
        fh.write(_generate_report(result))
    print(f"  ✓ Report         → {report_path}")

    if copy_to_ui:
        ui_path = _UI_DATA_DIR / "sim_cards.json"
        with open(ui_path, "w", encoding="utf-8") as fh:
            json.dump(result["current_cards"], fh, indent=2)
        print(f"  ✓ Copied to UI   → {ui_path}")


# ---------------------------------------------------------------------------
# Report generator
# ---------------------------------------------------------------------------

def _generate_report(result: dict) -> str:
    lines = [
        "# CIBC RTA Simulation Report",
        "",
        f"**Shift date:** {result['shift_date']}  ",
        f"**RTA:** {result['rta']}  ",
        f"**GEO:** {result['geo']}  ",
        f"**Cycles simulated:** {result['cycles_run']}  ",
        f"**Total alerts fired:** {result['total_alerts_fired']}  ",
        f"**Total escalations:** {result['total_escalations']}  ",
        "",
        "---",
        "",
        "## Cycle Summary",
        "",
        "| Cycle | Snapshot Time | Agents | Alerts | Escalations | New Flags | Cleared |",
        "|-------|--------------|--------|--------|-------------|-----------|---------|",
    ]

    for c in result["cycle_summary"]:
        lines.append(
            f"| {c['cycle']} | {c['snapshot_time']} | {c['agent_count']} "
            f"| {c['alerts_fired']} | {c['escalations']} "
            f"| {c.get('new_flags', '-')} | {c.get('cleared_since_last', '-')} |"
        )

    lines += [
        "",
        "---",
        "",
        "## Cards Generated (Current Cycle)",
        "",
    ]

    for card in result["current_cards"]:
        agent = card.get("agent", {})
        lines += [
            f"### [{card['severity'].upper()}] {card['title']}",
            f"**Agent:** {agent.get('name')}  ",
            f"**LOB:** {card.get('lob')}  ",
            f"**Status:** {agent.get('currentStatus')}  "
            f"**Duration in status:** {agent.get('currentStatus')}",
            f"**Card status:** {card['status']}  ",
            f"**Confidence:** {card.get('confidence', 'N/A')}  ",
            "",
            f"**Draft message:**",
            f"> {card.get('draftMessage', '')}",
            "",
        ]

    lines += [
        "---",
        "",
        "## Source Adapter Note",
        "",
        "This simulation used **synthetic Verint snapshots** as the data source adapter.",
        "The rules engine, alert formatter, and card builder are **production-equivalent**.",
        "To connect to a live data source, replace the adapter only:",
        "",
        "| Adapter | How it works |",
        "|---------|-------------|",
        "| **Verint REST API** | Poll `/agents` endpoint every 15 min; map response to AgentRow |",
        "| **Vision Agent / OCR** | Capture Citrix screen → Cloud Vision OCR → parse table → AgentRow |",
        "| **Google Apps Script** | Export Verint-linked Sheet rows → JSON → AgentRow |",
        "| **Webhook / Event push** | Receive Verint event → normalize → AgentRow |",
        "",
        "The rules engine, persistence tracker, card builder, and alert formatter",
        "**do not change** regardless of which adapter is used.",
        "",
    ]

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="CIBC RTA POC Simulation Engine",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--cycles",
        type=int,
        default=2,
        choices=[1, 2],
        help="Number of 15-minute cycles to simulate (default: 2)",
    )
    parser.add_argument(
        "--output",
        choices=["local", "ui"],
        default="local",
        help=(
            "Output mode: 'local' writes to simulation/output/ only; "
            "'ui' also copies sim_cards.json into the React demo app "
            "(default: local)"
        ),
    )
    args = parser.parse_args()

    n = min(args.cycles, len(_SNAPSHOT_FILES))
    snapshots = [_load_snapshot(_SNAPSHOT_FILES[i]) for i in range(n)]
    times = _SNAPSHOT_TIMES[:n]

    print()
    print("CIBC RTA Simulation Engine")
    print(f"  Cycles:        {n}")
    print(f"  Agents/cycle:  {len(snapshots[0]['agents'])}")
    print(f"  Rules source:  POC/01_evidence_pack/rules/alert_thresholds.json")
    print(f"  Input adapter: synthetic (swap for API / OCR / Webhook / GScript)")
    print()

    result = run_simulation(snapshots, times)

    print("Simulation complete:")
    for c in result["cycle_summary"]:
        cleared = c.get("cleared_since_last", 0)
        new = c.get("new_flags", c["alerts_fired"])
        print(
            f"  Cycle {c['cycle']} ({c['snapshot_time']}): "
            f"{c['alerts_fired']} alerts  |  "
            f"{c['escalations']} escalations  |  "
            f"{new} new flags  |  "
            f"{cleared} cleared"
        )
    print()

    print("Writing output:")
    _write_output(result, copy_to_ui=(args.output == "ui"))
    print()

    if result["current_cards"]:
        print("Cards generated (current cycle):")
        for card in result["current_cards"]:
            agent_name = card.get("agent", {}).get("name", "Unknown")
            lob = card.get("lob", "?")
            sev = card["severity"].upper()
            msg = card.get("draftMessage", "")[:90]
            print(f"  [{sev:8s}] {card['title']} — {agent_name} ({lob})")
            print(f"             {msg}...")
        print()

    print("Done.")
    if args.output == "ui":
        print(
            "  React app: cd POC/04_demo_ui/command-center-demo && npm run dev"
        )
    else:
        print(f"  Review:    open {_OUTPUT_DIR / 'sim_report.md'}")


if __name__ == "__main__":
    main()
