"""report_runner.py — CLI orchestrator for GTT × Verint reconciliation reports.

Usage (with live GTT + Verint fixture):
    python report_runner.py \
        --functional-area FA_CIBC \
        --sites "GT - Guatemala - Pradera East" \
        --date 2026-06-16 \
        --verint-fixture fixtures/verint_capture_sample.json \
        --out runs/reports/

Writes:
    runs/reports/reconciliation_2026-06-16.json   — full report (AI-readable)
    runs/reports/reconciliation_2026-06-16.csv    — flat CSV for XLSX import / audit

Without --verint-fixture, Verint rows default to an empty list (GTT-only report).
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path


def _load_verint_fixture(path: str) -> list:
    """Load a verint_capture_sample.json fixture and normalize to AgentRow objects."""
    import json as _json

    with open(path) as f:
        data = _json.load(f)

    # Support both a single capture dict or a list
    captures = data if isinstance(data, list) else [data]

    from verint_normalize import to_agent_rows

    rows = []
    for capture in captures:
        lob = capture.get("lob", "Unknown")
        geo = capture.get("geo", "Unknown")
        raw_rows = capture.get("rows", [])
        rows.extend(to_agent_rows(raw_rows, lob, geo))
    return rows


def _write_csv(report_dict: dict, out_path: Path) -> None:
    discrepancies = report_dict.get("discrepancies", [])
    if not discrepancies:
        return

    fieldnames = list(discrepancies[0].keys())
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(discrepancies)


def main() -> None:
    ap = argparse.ArgumentParser(description="GTT × Verint reconciliation report runner")
    ap.add_argument("--functional-area", default="FA_CIBC", help="GTT functional area code")
    ap.add_argument("--sites", default="GT - Guatemala - Pradera East",
                    help="Pipe-semicolon-separated site names")
    ap.add_argument("--date", required=True, help="Report date YYYY-MM-DD")
    ap.add_argument("--tz", default="America/Toronto")
    ap.add_argument("--tz-label", default="Eastern Time (America/Toronto)")
    ap.add_argument("--key", default=None, help="GCP SA key path (default: GTT_JSON/...)")
    ap.add_argument("--verint-fixture", default=None,
                    help="Path to verint_capture_sample.json (uses empty list if omitted)")
    ap.add_argument("--out", default="runs/reports", help="Output directory")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    verbose = not args.quiet

    # --- 1. Fetch GTT data ---
    if verbose:
        print(f"[runner] Fetching GTT data for {args.functional_area} / {args.date} ...")
    from gtt_adapter import fetch_gtt
    gtt_rows = fetch_gtt(
        functional_area=args.functional_area,
        sites=args.sites,
        date=args.date,
        key_path=args.key,
        tz=args.tz,
        tz_label=args.tz_label,
        verbose=verbose,
    )
    if verbose:
        print(f"[runner] GTT: {len(gtt_rows)} rows")

    # --- 2. Load Verint data ---
    verint_rows: list = []
    if args.verint_fixture:
        if verbose:
            print(f"[runner] Loading Verint fixture: {args.verint_fixture}")
        verint_rows = _load_verint_fixture(args.verint_fixture)
        if verbose:
            print(f"[runner] Verint: {len(verint_rows)} rows")
    else:
        if verbose:
            print("[runner] No --verint-fixture provided; proceeding with GTT-only report.")

    # --- 3. Reconcile ---
    if verbose:
        print("[runner] Reconciling ...")
    from gtt_verint_reconciler import reconcile
    report = reconcile(
        gtt_rows=gtt_rows,
        verint_rows=verint_rows,
        functional_area=args.functional_area,
        date=args.date,
    )

    # --- 4. Generate intelligence bullets ---
    from report_intelligence import generate
    report.intelligence = generate(report)

    if verbose:
        print(f"[runner] Discrepancies: {report.discrepancy_count} / {len(report.discrepancies)} rows")
        for bullet in report.intelligence:
            print(f"  • {bullet}")

    # --- 5. Write outputs ---
    report_dict = report.to_dict()

    json_path = out_dir / f"reconciliation_{args.date}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report_dict, f, indent=2, ensure_ascii=False, default=str)
    if verbose:
        print(f"[runner] ✓ JSON  → {json_path}")

    csv_path = out_dir / f"reconciliation_{args.date}.csv"
    _write_csv(report_dict, csv_path)
    if verbose:
        print(f"[runner] ✓ CSV   → {csv_path}")

    print(f"[runner] Done. {report.gtt_total} GTT | {report.verint_total} Verint | "
          f"{report.matched} matched | {report.discrepancy_count} discrepancies.")


if __name__ == "__main__":
    main()
