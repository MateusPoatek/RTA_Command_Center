"""local_api.py — Local HTTP API server for the Command Center "Report" button.

Exposes:
  POST /generate-report
    Body (JSON): {
      date: "YYYY-MM-DD",
      functional_area: "FA_Epic Games",
      sites: "SV - Antiguo Cuscatlan - Torre Emblema",
      tz: "America/Toronto",
      tz_label: "Eastern Time (America/Toronto)",
      verint_rows: [{ name, scheduled_activity, out_of_adherence,
                       actual_activity, time_in_activity, days_adherence }, ...]
    }
  Returns 200: { ok: true, date, gtt_total, verint_total, matched, discrepancy_count }
  Returns 4xx/5xx: { ok: false, error: "..." }

  POST /gtt-events
    Body (JSON): { functional_area, sites, date, tz, tz_label }
    Returns 200: { ok: true, total_rows, events: [{ workdayId, employee, supervisor, event, at }] }
      — clock_in/clock_out only, `at` = epoch ms UTC. Used by RTA_Board_V2.

  POST /snapshot
    Body (JSON): { account, ... } — RTA_Board_V2's received roster + GTT + computed numbers,
    written to runs/snapshots/<ACCOUNT>_latest.json (+ timestamped copy) for diagnosis.

  POST /dispatch-alert
    Body (JSON): { account: "EPIC", message: "..." }
      — OR —
             { account: "EPIC", card: { header: {...}, sections: [...] } }
    Proxies to the account's Google Chat webhook — kept server-side so the
    webhook URL (a bearer credential in its query string) never ships in the
    frontend bundle. Configured via env var GCHAT_WEBHOOK_<ACCOUNT>, e.g.
    GCHAT_WEBHOOK_EPIC. Returns { ok: false, error: "..." } if that account
    has no webhook configured (not a 500 — just means dispatch stays simulated).
    `card` is a Google Chat Cards v2 "card" object (no cardId — generated
    here) — sent as { cardsV2: [{ cardId, card }] }. `message` is sent as
    plain { text: message }. Exactly one of the two must be present.
  Returns 200: { ok: true }
  Returns 4xx/5xx: { ok: false, error: "..." }

Run with:
  .venv-browser/bin/python local_api.py
  (or: .venv-browser/bin/uvicorn local_api:app --port 5050)

The Vite dev server proxies /api/* -> http://localhost:5050/* so the React app
calls /api/generate-report (same origin, no CORS).
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from pathlib import Path

import requests
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

# .env has no loader wired up historically, which meant every session had to
# re-`export GCHAT_WEBHOOK_EPIC=...` by hand or dispatch would silently fall
# back to "not configured" — the actual cause of more than one "the webhook
# stopped working" report when it hadn't. setdefault() so a real shell export
# still wins over the file.
_env_path = BASE_DIR / ".env"
if _env_path.exists():
    for _line in _env_path.read_text().splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _key, _, _value = _line.partition("=")
        os.environ.setdefault(_key.strip(), _value.strip())

# Surfaced at startup (not just buried in the report JSON) because a missing
# rapidfuzz silently disables fuzzy name matching with no exception raised —
# the report just under-matches and looks like a real attendance problem.
# Also a reminder that this process must be RESTARTED to pick up any change
# to gtt_adapter.py / gtt_verint_reconciler.py — their `from X import Y`
# happens inside generate_report() per-request, but Python only reads a
# module's source once per process (sys.modules caches it), so editing those
# files while this server keeps running has no effect until restart.
try:
    import rapidfuzz  # noqa: F401
    print(f"[local-api] rapidfuzz available (v{rapidfuzz.__version__}) — fuzzy name matching enabled")
except ImportError:
    print("[local-api] WARNING: rapidfuzz NOT installed — fuzzy name matching disabled, "
          "join relies on exact surname match only. `pip install rapidfuzz` and restart.")


async def generate_report(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "invalid JSON body"}, status_code=400)

    date: str = body.get("date", "")
    if not date:
        return JSONResponse({"ok": False, "error": "date is required"}, status_code=400)

    # Which account this report belongs to — required for the output filename
    # so two accounts generating on the same date don't overwrite each other
    # (the old date-only naming was a real cross-account data-mixing bug).
    account: str = (body.get("account") or "UNKNOWN").strip().upper()
    functional_area: str = body.get("functional_area", "FA_Epic Games")
    sites: str = body.get("sites", "SV - Antiguo Cuscatlan - Torre Emblema")
    tz: str = body.get("tz", "America/Toronto")
    tz_label: str = body.get("tz_label", "Eastern Time (America/Toronto)")
    verint_rows: list = body.get("verint_rows", [])
    # "verint_only" is for accounts where GTT isn't available yet (e.g. a
    # branch on a different time-tracking system) — skips the GTT fetch
    # entirely instead of failing/blocking the report.
    source: str = body.get("source", "gtt_verint")
    # A blank functional area can never return GTT rows — a stale per-account
    # config (e.g. EPIC_PH, which has no GTT) otherwise produced "gtt_verint"
    # reports with gtt_total 0 that read as everyone-unclocked.
    if not functional_area.strip():
        source = "verint_only"

    # Write Verint rows to a temp fixture file in the format report_runner expects.
    fixture = {
        "captured_at": date + "T00:00:00+00:00",
        "source_url": "https://wfo.a87.verintcloudservices.com",
        "view": "Extension live capture",
        "lob": functional_area,
        "geo": "El Salvador",
        "rows": verint_rows,
    }

    fixture_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, dir=BASE_DIR
        ) as f:
            json.dump(fixture, f)
            fixture_path = f.name

        from gtt_adapter import fetch_gtt
        from gtt_verint_reconciler import reconcile
        from report_intelligence import generate, generate_points_of_attention
        from report_runner import _load_verint_fixture, _write_csv

        if source == "verint_only":
            print(f"[local-api] source=verint_only — skipping GTT fetch for {functional_area} / {date}")
            gtt_rows = []
        else:
            print(f"[local-api] Fetching GTT for {functional_area} / {date} …")
            gtt_rows = fetch_gtt(
                functional_area=functional_area,
                sites=sites,
                date=date,
                key_path=None,
                tz=tz,
                tz_label=tz_label,
                verbose=True,
            )
            print(f"[local-api] GTT: {len(gtt_rows)} rows")

        if verint_rows:
            verint_agent_rows = _load_verint_fixture(fixture_path)
            print(f"[local-api] Verint roster: {len(verint_agent_rows)} agents")
        else:
            verint_agent_rows = []
            print("[local-api] No Verint roster — GTT-only report")

        report = reconcile(
            gtt_rows=gtt_rows,
            verint_rows=verint_agent_rows,
            functional_area=functional_area,
            date=date,
            source=source,
        )
        report.intelligence = generate(report)
        report.points_of_attention = generate_points_of_attention(report)

        out_dir = BASE_DIR / "runs" / "reports"
        out_dir.mkdir(parents=True, exist_ok=True)

        report_dict = report.to_dict()
        json_path = out_dir / f"reconciliation_{account}_{date}.json"
        csv_path = out_dir / f"reconciliation_{account}_{date}.csv"

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(report_dict, f, indent=2, ensure_ascii=False, default=str)
        _write_csv(report_dict, csv_path)

        print(f"[local-api] ✓ wrote {json_path.name}")
        return JSONResponse({
            "ok": True,
            "date": date,
            "gtt_total": report.gtt_total,
            "verint_total": report.verint_total,
            "matched": report.matched,
            "discrepancy_count": report.discrepancy_count,
        })

    except Exception as exc:
        print(f"[local-api] ERROR: {exc}", file=sys.stderr)
        import traceback; traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)
    finally:
        if fixture_path and os.path.exists(fixture_path):
            os.unlink(fixture_path)


async def dispatch_alert(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "invalid JSON body"}, status_code=400)

    account: str = (body.get("account") or "").strip().upper()
    message: str = body.get("message") or ""
    card: dict | None = body.get("card")
    if not account or not (message or card):
        return JSONResponse({"ok": False, "error": "account and (message or card) are required"}, status_code=400)

    webhook_url = os.environ.get(f"GCHAT_WEBHOOK_{account}")
    if not webhook_url:
        return JSONResponse(
            {"ok": False, "error": f"no GCHAT_WEBHOOK_{account} configured — dispatch stays simulated"},
            status_code=400,
        )

    if card:
        import uuid
        payload = {"cardsV2": [{"cardId": str(uuid.uuid4()), "card": card}]}
    else:
        payload = {"text": message}

    # Google Chat's webhook endpoint has been observed to intermittently return
    # 502/503 on an otherwise-valid request (same transient-rejection pattern
    # seen on the GTT auth endpoint — see gtt_adapter._mint_token) — a retry
    # on the identical request has reliably succeeded. Only retry 5xx: a 4xx
    # means the request/webhook itself is wrong and won't fix itself.
    last_exc: Exception | None = None
    for attempt in range(4):
        try:
            resp = requests.post(webhook_url, json=payload, timeout=10)
            resp.raise_for_status()
            last_exc = None
            break
        except requests.HTTPError as exc:
            last_exc = exc
            if exc.response is not None and exc.response.status_code < 500:
                break
            time.sleep(1)
        except Exception as exc:
            last_exc = exc
            time.sleep(1)

    if last_exc is not None:
        print(f"[local-api] dispatch-alert ERROR: {last_exc}", file=sys.stderr)
        return JSONResponse({"ok": False, "error": str(last_exc)}, status_code=502)

    return JSONResponse({"ok": True})


async def gtt_events(request: Request) -> JSONResponse:
    """Raw GTT clock events for one account/day — RTA Board V2 joins them itself.
    Body: { functional_area, sites, date, tz, tz_label }. Returns
    { ok, total_rows, events: [{ workdayId, employee, supervisor, event, at }] }
    with `at` in epoch ms (from the UTC columns). Email/IP are never returned."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "invalid JSON body"}, status_code=400)
    functional_area = (body.get("functional_area") or "").strip()
    date = body.get("date") or ""
    if not functional_area or not date:
        return JSONResponse({"ok": False, "error": "functional_area and date are required"}, status_code=400)
    try:
        import calendar
        from gtt_adapter import fetch_gtt
        rows = fetch_gtt(
            functional_area=functional_area,
            sites=body.get("sites", ""),
            date=date,
            tz=body.get("tz", "America/Toronto"),
            tz_label=body.get("tz_label", "Eastern Time (America/Toronto)"),
        )
        events = [
            {"workdayId": r.workday_id, "employee": r.employee, "supervisor": r.supervisor,
             "event": r.event_type, "at": calendar.timegm(r.event_dt_utc.timetuple()) * 1000}
            for r in rows
            if r.event_type in ("clock_in", "clock_out") and r.event_dt_utc
        ]
        return JSONResponse({"ok": True, "total_rows": len(rows), "events": events})
    except Exception as exc:
        print(f"[local-api] gtt-events ERROR: {exc}", file=sys.stderr)
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=502)


async def snapshot(request: Request) -> JSONResponse:
    """RTA Board V2 posts what it received after each new extension capture, so it can be
    read back for diagnosis. Writes runs/snapshots/<ACCOUNT>_latest.json plus a timestamped
    copy. runs/ is gitignored — these files contain agent names; never commit them."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "invalid JSON body"}, status_code=400)
    account = "".join(c for c in str(body.get("account", "")).upper() if c.isalnum() or c == "_")
    if not account:
        return JSONResponse({"ok": False, "error": "account is required"}, status_code=400)
    out_dir = BASE_DIR / "runs" / "snapshots"
    out_dir.mkdir(parents=True, exist_ok=True)
    text = json.dumps(body, indent=1, ensure_ascii=False, default=str)
    stamp = time.strftime("%Y%m%dT%H%M%S")
    for name in (f"{account}_latest.json", f"{account}_{stamp}.json"):
        (out_dir / name).write_text(text, encoding="utf-8")
    return JSONResponse({"ok": True, "file": f"runs/snapshots/{account}_{stamp}.json"})


routes = [
    Route("/generate-report", generate_report, methods=["POST"]),
    Route("/dispatch-alert", dispatch_alert, methods=["POST"]),
    Route("/gtt-events", gtt_events, methods=["POST"]),
    Route("/snapshot", snapshot, methods=["POST"]),
]

app = Starlette(
    routes=routes,
    middleware=[
        Middleware(
            CORSMiddleware,
            allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
            allow_methods=["POST", "OPTIONS"],
            allow_headers=["Content-Type"],
        )
    ],
)

if __name__ == "__main__":
    import uvicorn
    print("[local-api] Starting on http://localhost:5050")
    uvicorn.run(app, host="127.0.0.1", port=5050, log_level="info")
