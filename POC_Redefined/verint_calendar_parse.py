#!/usr/bin/env python3
"""
verint_calendar_parse.py
------------------------
Turn a netcap capture of the Verint WFM Calendar into structured schedule data
and adherence alerts — the RELIABLE path (parses the calendar's own JSON API
instead of vision-reading the SVG Gantt).

Reads a `runs/netcap_*/` directory and joins three captured endpoints:
  * /api/wfm/main/v2/calendar-filter   -> resourceData[]: per-employee
        actualSchedule.events[] (scheduled blocks) and
        adherence.violations[]  (Verint's own OOA verdict: planned vs actual).
  * /api/wfm/main/v1/work-resources    -> employee id -> name.
  * /api/wfm/main/v1/activities        -> activityId -> activity name.

Each adherence violation (planned activity != actual, with a real actual) is
mapped to an AgentRow and run through the existing triage -> card -> draft
pipeline (D6: consume Verint's verdict; reuse the engine unchanged).

No network, no LLM. Deterministic and unit-testable.
"""

from __future__ import annotations

import argparse
import glob
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _engine_bridge import AgentRow  # noqa: E402
from verint_triage import triage  # noqa: E402
from engine.card_builder import build_card  # noqa: E402
from engine.alert_formatter import lob_channel  # noqa: E402

# Verint uses "Deleted Timeline" for segments with no recorded actual — not a
# real worked activity, so not a meaningful adherence alert for the demo.
NO_ACTUAL = {"Deleted Timeline", "", None}


# ---------------------------------------------------------------------------
# Load + join captured endpoints
# ---------------------------------------------------------------------------

def _find(responses: Path, needle: str) -> list[Path]:
    return sorted(responses.glob(f"*{needle}*.json"))


def _iso_seconds(start: str, end: str) -> int:
    a = datetime.fromisoformat(start.replace("Z", "+00:00"))
    b = datetime.fromisoformat(end.replace("Z", "+00:00"))
    return int((b - a).total_seconds())


def load_netcap(netcap_dir: str | Path) -> dict:
    """Load + join the calendar-filter, work-resources, and activities files."""
    responses = Path(netcap_dir) / "responses"
    if not responses.is_dir():
        raise FileNotFoundError(f"No responses/ under {netcap_dir}")

    # employee id -> "Last, First"
    names: dict[int, str] = {}
    for f in _find(responses, "work_resources"):
        for r in json.loads(f.read_text()).get("data", []):
            n = r.get("attributes", {}).get("name", {})
            names[int(r["id"])] = f"{n.get('last', '')}, {n.get('first', '')}".strip(", ")

    # activityId -> name
    activities: dict[int, str] = {}
    for f in _find(responses, "activities"):
        for r in json.loads(f.read_text()).get("data", []):
            activities[int(r["id"])] = r.get("attributes", {}).get("name", "")

    # resourceData (merge all calendar-filter responses; later ones win per id)
    resources: dict[int, dict] = {}
    for f in _find(responses, "calendar_filter"):
        attrs = json.loads(f.read_text()).get("data", {}).get("attributes", {})
        for r in attrs.get("resourceData", []):
            resources[int(r["id"])] = r

    return {"names": names, "activities": activities, "resources": resources}


# ---------------------------------------------------------------------------
# Transform -> schedule + adherence rows
# ---------------------------------------------------------------------------

def schedule_by_employee(joined: dict) -> dict[str, list[dict]]:
    """employee name -> list of {activity, start, end, minutes} scheduled blocks."""
    out: dict[str, list[dict]] = {}
    for eid, r in joined["resources"].items():
        events = r.get("actualSchedule", {}).get("events", [])
        if not events:
            continue
        name = joined["names"].get(eid, str(eid))
        out[name] = [{
            "activity": joined["activities"].get(e.get("activityId"), f"act#{e.get('activityId')}"),
            "start": e.get("startTime", "")[11:16],
            "end": e.get("endTime", "")[11:16],
            "minutes": e.get("durationMinutes"),
        } for e in events]
    return out


def adherence_rows(joined: dict, lob: str, geo: str, include_no_actual: bool = False) -> list[AgentRow]:
    """Map Verint adherence violations -> AgentRow (one per real violation).

    duration_seconds carries the violation duration (Verint's OOA verdict);
    actual_status / scheduled_activity are the actual vs planned activity names.
    """
    rows: list[AgentRow] = []
    for eid, r in joined["resources"].items():
        name = joined["names"].get(eid, str(eid))
        for v in r.get("adherence", {}).get("violations", []):
            actual = (v.get("actualEventData") or [{}])[0].get("label")
            if not include_no_actual and actual in NO_ACTUAL:
                continue
            try:
                dur = _iso_seconds(v["startTime"], v["endTime"])
            except Exception:
                continue
            rows.append(AgentRow(
                agent_id=str(v.get("employeeId", eid)),   # real Verint id
                agent_name=name,
                lob=lob,
                geo=geo,
                actual_status=actual or "Unknown",
                scheduled_activity=v.get("plannedActivityName", "Unknown"),
                duration_seconds=max(dur, 0),
                adherence_pct=0.0,
            ))
    return rows


# ---------------------------------------------------------------------------
# Full pipeline: netcap -> cards
# ---------------------------------------------------------------------------

def run(netcap_dir: str | Path, lob: str, geo: str, snapshot_time: str) -> dict:
    joined = load_netcap(netcap_dir)
    sched = schedule_by_employee(joined)
    rows = adherence_rows(joined, lob, geo)
    alerts = triage(rows)  # Verint already flagged these -> all become alerts

    cards, summaries = [], []
    for a in alerts:
        card = build_card(
            a, snapshot_time=snapshot_time, cycle=1,
            data_class="evidence-backed",
            source_label=f"Live Verint calendar API | LOB {lob} | rule: {a.rule_id}",
            source_detail=("Parsed from /api/wfm/main/v2/calendar-filter "
                           "(resourceData.adherence.violations) captured live; "
                           "names/activities joined from work-resources/activities."),
            source_artifact=f"netcap {Path(netcap_dir).name} | employee {a.agent.agent_id}",
            card_id_prefix="live",
        )
        cards.append(card)
        ch = lob_channel(a.agent.lob)
        summaries.append({
            "agent_name": a.agent.agent_name, "severity": a.severity,
            "scheduled_activity": a.agent.scheduled_activity,
            "actual_status": a.agent.actual_status,
            "ooa_seconds": a.agent.duration_seconds, "channel": ch,
            "draft_message": card["draftMessage"], "card_id": card["id"],
        })

    return {
        "lob": lob, "geo": geo, "snapshot_time": snapshot_time,
        "counts": {"employees_scheduled": len(sched),
                   "violations": len(rows), "alerts": len(alerts)},
        "schedule": sched, "cards": cards, "alerts": summaries,
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--netcap", default="", help="Path to a runs/netcap_* dir (default: latest).")
    p.add_argument("--lob", default="EPIC")
    p.add_argument("--geo", default="Global")
    p.add_argument("--snapshot-time", default="2025-05-12T00:00:00Z")
    p.add_argument("--out", default="")
    args = p.parse_args(argv)

    netcap = args.netcap
    if not netcap:
        dirs = sorted(glob.glob(str(Path(__file__).resolve().parent / "runs" / "netcap_*")))
        if not dirs:
            raise SystemExit("No netcap dirs found; run: verint_browser_use_demo.py netcap")
        netcap = dirs[-1]

    result = run(netcap, args.lob, args.geo, args.snapshot_time)
    c = result["counts"]
    print(f"\n--- Verint calendar parse: {netcap} ---")
    print(f"  {c['employees_scheduled']} employees scheduled | "
          f"{c['violations']} real violations -> {c['alerts']} alerts\n")
    for s in sorted(result["alerts"], key=lambda x: -x["ooa_seconds"])[:20]:
        m, _ = divmod(s["ooa_seconds"], 60)
        print(f"  [{s['severity'].upper():8}] {s['agent_name']:<32} "
              f"sched {s['scheduled_activity'][:24]:<24} -> actual {s['actual_status'][:22]:<22} {m}m")

    out = Path(args.out) if args.out else Path(netcap) / "parsed"
    out.mkdir(parents=True, exist_ok=True)
    (out / "cards.json").write_text(json.dumps(result["cards"], indent=2, ensure_ascii=False))
    (out / "alerts.json").write_text(json.dumps(result["alerts"], indent=2, ensure_ascii=False))
    (out / "schedule.json").write_text(json.dumps(result["schedule"], indent=2, ensure_ascii=False))
    print(f"\n  Artifacts -> {out}/cards.json, alerts.json, schedule.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
