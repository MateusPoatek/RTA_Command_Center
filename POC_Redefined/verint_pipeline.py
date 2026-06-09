#!/usr/bin/env python3
"""
verint_pipeline.py
------------------
End-to-end glue for the live computer-use path, browser-free.

    raw capture (JSON)  ->  normalize  ->  triage (Verint OOA verdict, D6)
        ->  build live-provenance cards  ->  draft LOB-chat messages
        ->  JSON artifacts + provenance log

The browser agent (a later step) only has to emit the raw capture JSON in the
shape this module consumes (see fixtures/verint_capture_sample.json). Everything
downstream is deterministic, testable Python and is exercised here without a
browser.

Capture JSON shape:
    {
      "captured_at": "<ISO-8601>",
      "source_url": "https://wfo.a87.verintcloudservices.com",
      "lob": "Zillow", "geo": "Philippines",
      "cycle": 1, "persistence_map": { "<agent_id>": <prev_cycles> },
      "rows": [ { name, scheduled_activity, out_of_adherence,
                  actual_activity, time_in_activity, days_adherence }, ... ]
    }

Guardrails honored: read-only (we never call Verint here), no screenshots, no
secrets in output — only structured provenance.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# verint_normalize / verint_triage live next to this file; _engine_bridge (which
# they import) puts the engine package on sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from verint_normalize import to_agent_rows  # noqa: E402
from verint_triage import triage  # noqa: E402
from engine.card_builder import build_card  # noqa: E402
from engine.alert_formatter import lob_channel  # noqa: E402

# What lob_channel returns for an unmapped LOB (the CIBC channel map does not
# contain this tenant's clients, e.g. Zillow — expected, see plan reconciliation).
_FALLBACK_CHANNEL = lob_channel("__no_such_lob__")

DEFAULT_DATA_CLASS = "evidence-backed"  # honest label for real live DOM (D2)


# ---------------------------------------------------------------------------
# Provenance for live cards
# ---------------------------------------------------------------------------

def _source_label(lob: str, cycle: int, rule_id: str) -> str:
    return f"Live Verint browser capture | LOB {lob} | cycle {cycle} | rule: {rule_id}"


def _source_detail(source_url: str) -> str:
    return (
        f"DOM extraction from {source_url} (Tracking -> ADHERENCE -> Quick View) "
        "-> verint_normalize -> verint_triage (consumes Verint's own Out-Of-"
        "Adherence verdict). Adapter swappable for Verint REST/OCR/webhook; "
        "the triage, card, and dispatch layers are unchanged."
    )


def _source_artifact(captured_at: str, agent_id: str) -> str:
    return f"live-capture {captured_at} | agent_id {agent_id}"


# ---------------------------------------------------------------------------
# Core pipeline
# ---------------------------------------------------------------------------

def run_pipeline(capture: dict, data_class: str = DEFAULT_DATA_CLASS) -> dict:
    """
    Run capture -> normalize -> triage -> cards -> drafts.

    Returns a result dict: {captured_at, lob, geo, cycle, counts, cards,
    alerts, log}. Pure (no file writes); see write_artifacts() for output.
    """
    captured_at = capture.get("captured_at", "")
    source_url = capture.get("source_url", "")
    lob = capture["lob"]
    geo = capture["geo"]
    cycle = int(capture.get("cycle", 1))
    persistence_map = capture.get("persistence_map") or {}
    raw_rows = capture.get("rows", [])

    log: list[str] = []
    log.append(f"Loaded raw capture: {len(raw_rows)} rows | view={capture.get('view', '?')}")
    log.append(f"Source: {source_url or '(none)'} | captured_at={captured_at or '(none)'}")

    # Normalize -------------------------------------------------------------
    rows = to_agent_rows(raw_rows, lob=lob, geo=geo)
    in_adherence = sum(1 for r in rows if r.duration_seconds <= 0)
    log.append(
        f"Normalized {len(rows)} rows | LOB={lob} GEO={geo} | "
        f"{len(rows) - in_adherence} out-of-adherence, {in_adherence} in-adherence"
    )

    # Triage (consume Verint's verdict) ------------------------------------
    alerts = triage(rows, persistence_map=persistence_map)
    sev_counts: dict[str, int] = {}
    for a in alerts:
        sev_counts[a.severity] = sev_counts.get(a.severity, 0) + 1
    log.append(
        f"Triaged: {len(alerts)} alert(s) of {len(rows)} agents "
        f"({', '.join(f'{k}:{v}' for k, v in sorted(sev_counts.items())) or 'none'})"
    )

    # Cards + draft messages ------------------------------------------------
    cards: list[dict] = []
    alert_summaries: list[dict] = []
    for a in alerts:
        card = build_card(
            a,
            snapshot_time=captured_at,
            cycle=cycle,
            data_class=data_class,
            source_label=_source_label(lob, cycle, a.rule_id),
            source_detail=_source_detail(source_url),
            source_artifact=_source_artifact(captured_at, a.agent.agent_id),
            card_id_prefix="live",
        )
        cards.append(card)

        channel = lob_channel(a.agent.lob)
        alert_summaries.append({
            "agent_name": a.agent.agent_name,
            "agent_id": a.agent.agent_id,
            "lob": a.agent.lob,
            "geo": a.agent.geo,
            "severity": a.severity,
            "rule_id": a.rule_id,
            "ooa_seconds": a.agent.duration_seconds,
            "scheduled_activity": a.agent.scheduled_activity,
            "actual_status": a.agent.actual_status,
            "channel": channel,
            "channel_is_fallback": channel == _FALLBACK_CHANNEL,
            "draft_message": card["draftMessage"],
            "card_id": card["id"],
        })

    log.append(
        f"Built {len(cards)} live card(s) (dataClass={data_class}) and draft messages"
    )

    # Routing note (expected fallback for non-CIBC tenants) ----------------
    fallbacks = sum(1 for s in alert_summaries if s["channel_is_fallback"])
    if fallbacks:
        log.append(
            f"NOTE: {fallbacks}/{len(alert_summaries)} alert(s) routed to fallback "
            f"channel '{_FALLBACK_CHANNEL}' — LOB '{lob}' is not in the CIBC channel "
            "map (expected for this tenant; routing is client-config)."
        )

    return {
        "captured_at": captured_at,
        "source_url": source_url,
        "lob": lob,
        "geo": geo,
        "cycle": cycle,
        "counts": {
            "rows": len(rows),
            "in_adherence": in_adherence,
            "alerts": len(alerts),
            "by_severity": sev_counts,
        },
        "cards": cards,
        "alerts": alert_summaries,
        "log": log,
    }


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------

def _run_id(captured_at: str) -> str:
    """A filesystem-safe run id derived from the capture timestamp."""
    safe = re.sub(r"[^0-9A-Za-z]+", "", captured_at) or "run"
    return safe


def write_artifacts(result: dict, out_root: Path) -> Path:
    """Write cards.json, alerts.json, and run.log under out_root/<run_id>/."""
    run_dir = out_root / _run_id(result["captured_at"])
    run_dir.mkdir(parents=True, exist_ok=True)

    (run_dir / "cards.json").write_text(
        json.dumps(result["cards"], indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (run_dir / "alerts.json").write_text(
        json.dumps(result["alerts"], indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (run_dir / "run.log").write_text("\n".join(result["log"]) + "\n", encoding="utf-8")
    return run_dir


def _print_summary(result: dict, run_dir: Path | None) -> None:
    print("\n--- Verint live-capture pipeline ---")
    for line in result["log"]:
        print(f"  {line}")
    print()
    for s in result["alerts"]:
        fb = " (fallback)" if s["channel_is_fallback"] else ""
        print(f"  [{s['severity'].upper():8}] {s['agent_name']} ({s['lob']}) "
              f"-> {s['channel']}{fb}")
        print(f"            {s['draft_message']}")
    if run_dir is not None:
        print(f"\n  Artifacts: {run_dir}/cards.json, alerts.json, run.log")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture", required=True,
                        help="Path to a raw capture JSON file.")
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent / "runs"),
                        help="Output root for run artifacts (default: POC_Redefined/runs).")
    parser.add_argument("--data-class", default=DEFAULT_DATA_CLASS,
                        help="dataClass label for live cards (default: evidence-backed).")
    parser.add_argument("--no-write", action="store_true",
                        help="Print only; do not write artifacts.")
    args = parser.parse_args(argv)

    capture = json.loads(Path(args.capture).read_text(encoding="utf-8"))
    result = run_pipeline(capture, data_class=args.data_class)

    run_dir = None if args.no_write else write_artifacts(result, Path(args.out))
    _print_summary(result, run_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
