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
from pathlib import Path

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))


async def generate_report(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "invalid JSON body"}, status_code=400)

    date: str = body.get("date", "")
    if not date:
        return JSONResponse({"ok": False, "error": "date is required"}, status_code=400)

    functional_area: str = body.get("functional_area", "FA_Epic Games")
    sites: str = body.get("sites", "SV - Antiguo Cuscatlan - Torre Emblema")
    tz: str = body.get("tz", "America/Toronto")
    tz_label: str = body.get("tz_label", "Eastern Time (America/Toronto)")
    verint_rows: list = body.get("verint_rows", [])

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
        from report_intelligence import generate
        from report_runner import _load_verint_fixture, _write_csv

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
        )
        report.intelligence = generate(report)

        out_dir = BASE_DIR / "runs" / "reports"
        out_dir.mkdir(parents=True, exist_ok=True)

        report_dict = report.to_dict()
        json_path = out_dir / f"reconciliation_{date}.json"
        csv_path = out_dir / f"reconciliation_{date}.csv"

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


routes = [Route("/generate-report", generate_report, methods=["POST"])]

app = Starlette(
    routes=routes,
    middleware=[
        Middleware(
            CORSMiddleware,
            allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
            allow_methods=["POST", "OPTIONS"],
            allow_headers=["Content-Type"],
        )
    ],
)

if __name__ == "__main__":
    import uvicorn
    print("[local-api] Starting on http://localhost:5050")
    uvicorn.run(app, host="127.0.0.1", port=5050, log_level="info")
