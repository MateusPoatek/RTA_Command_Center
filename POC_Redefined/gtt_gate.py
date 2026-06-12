#!/usr/bin/env python3
"""gtt_gate.py — the GTT "gate" probe (prove the primitive before building).

Mirrors the Verint gate discipline: make ONE authenticated, READ-ONLY call to the
GTT Post-Mortem Report API, confirm auth + the response shape + that clock_in/
clock_out + workdayId are present — before building the capture adapter.

The API (from "CR Function - GTT Post Morten Report.docx"):
  POST https://gttpostmortemreport-...europe-west1.run.app
  Auth: Bearer IDENTITY token minted from a GCP service account (audience = URL).
  Body: timezoneLabel, functionalArea, sites ("|;|"-sep), startDate, endDate,
        timezone  (dates "YYYY-MM-DD HH:MM:SS").
  Response: rows (array-of-arrays) of clock events incl. workdayId, email,
            employee, aux (clock_in/clock_out), start/end times, etc.

PII: the response contains employee names/emails/workdayIds. This probe prints
ONLY a masked summary (counts, columns, distinct aux, id formats) — never raw
personal values. Nothing is written to disk.

SECURITY: the service-account key is a PRIVATE KEY. Pass its path via
GOOGLE_APPLICATION_CREDENTIALS (preferred, outside the repo) or --key. Never
commit it (GTT_JSON/ is gitignored).

Usage:
  ../.venv-browser/bin/python gtt_gate.py \
      --key "GTT_JSON/ti-is-prod-eu-w1-82ce0c6f2e03.json" \
      --date 2026-06-03 \
      --functional-area "FA_CIBC" \
      --sites "GT - Guatemala - Pradera East" \
      --tz "America/Toronto" --tz-label "Eastern Time (America/Toronto)"
"""
import argparse
import json
import sys

URL = "https://gttpostmortemreport-1040489670153.europe-west1.run.app"


def mask(v):
    s = "" if v is None else str(v)
    if "@" in s and "." in s:
        return "EMAIL"
    if s.isdigit():
        return f"num[{len(s)}]"
    return f"text[{len(s)}]" if s else "empty"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default="GTT_JSON/ti-is-prod-eu-w1-82ce0c6f2e03.json",
                    help="path to the SA key (or set GOOGLE_APPLICATION_CREDENTIALS)")
    ap.add_argument("--date", default="2026-06-03", help="single day YYYY-MM-DD")
    ap.add_argument("--functional-area", default="FA_CIBC")
    ap.add_argument("--sites", default="GT - Guatemala - Pradera East")
    ap.add_argument("--tz", default="America/Toronto")
    ap.add_argument("--tz-label", default="Eastern Time (America/Toronto)")
    args = ap.parse_args()

    try:
        import requests
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
    except ImportError as e:
        sys.exit(f"missing dep: {e}. Install: pip install google-auth requests")

    # --- mint an identity token for the Cloud Run service (audience = URL) ---
    import os
    key_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or args.key
    try:
        creds = service_account.IDTokenCredentials.from_service_account_file(
            key_path, target_audience=URL)
        creds.refresh(Request())
    except Exception as e:
        sys.exit(f"auth/token mint failed ({key_path}): {e}")
    token = creds.token
    print(f"[gtt-gate] minted identity token for SA: {creds.service_account_email}")

    body = {
        "timezoneLabel": args.tz_label,
        "functionalArea": args.functional_area,
        "sites": args.sites,
        "startDate": f"{args.date} 00:00:00",
        "endDate": f"{args.date} 23:59:59",
        "timezone": args.tz,
    }
    print(f"[gtt-gate] POST {URL}")
    print(f"[gtt-gate] body: functionalArea={body['functionalArea']!r} sites={body['sites']!r} "
          f"date={args.date} tz={args.tz}")

    try:
        r = requests.post(URL, headers={"Authorization": f"Bearer {token}",
                                        "Content-Type": "application/json"},
                          json=body, timeout=90)
    except Exception as e:
        sys.exit(f"request failed: {e}")

    print(f"[gtt-gate] HTTP {r.status_code}")
    if r.status_code == 401 or r.status_code == 403:
        print("  -> AUTH/IAM issue: this SA likely lacks run.invoker on the service "
              "(doc names a different SA). Body:", r.text[:300])
        return
    if r.status_code != 200:
        print("  -> non-200 (likely a param issue — try a different functionalArea/"
              "timezoneLabel). Body:", r.text[:400])
        return

    # --- 200: summarise the shape WITHOUT printing PII ---
    try:
        data = r.json()
    except Exception:
        print("  -> 200 but non-JSON body head:", r.text[:200]); return
    rows = data if isinstance(data, list) else data.get("data") or data.get("rows") or []
    print(f"  -> 200 OK · {len(rows)} rows")
    if not rows:
        print("  (empty — params valid but no events for that day/site, or wrong "
              "functionalArea. Try another --date or --functional-area.)")
        return
    first = rows[0]
    print(f"  columns per row: {len(first) if isinstance(first, (list, dict)) else 'scalar'}")
    # Masked first-row shape (positions, no values)
    if isinstance(first, list):
        print("  row[0] shape:", [mask(v) for v in first])
        # aux is column index 7 per the doc (clock_in/clock_out)
        aux_idx = 7
        auxvals = sorted({str(rw[aux_idx]) for rw in rows
                          if isinstance(rw, list) and len(rw) > aux_idx})
        print(f"  distinct aux (col {aux_idx}): {auxvals}")
        wd_idx = 2  # workdayId per the doc
        wd = [str(rw[wd_idx]) for rw in rows if isinstance(rw, list) and len(rw) > wd_idx]
        print(f"  workdayId: {len(wd)} values, char-lengths={sorted({len(x) for x in wd})}, "
              f"all-numeric={all(x.isdigit() for x in wd)}")
    elif isinstance(first, dict):
        print("  row[0] keys:", list(first.keys()))
    print("[gtt-gate] ✓ GTT API reachable + authenticated + shape confirmed (PII masked).")


if __name__ == "__main__":
    main()
