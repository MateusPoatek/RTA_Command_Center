#!/usr/bin/env python3
"""
verint_browser_use_demo.py
--------------------------
Extraction-ONLY computer-use agent for live Verint. Proves an AI can navigate
the real Verint web app and pull structured data off the actual screen.

Principle (non-negotiable): the agent NAVIGATES and EXTRACTS. It never authors
alerts and never mutates Verint. The downstream rules/cards/alerts are the
existing deterministic system.

Targets (--target):
  calendar   (default) Forecasting & Scheduling -> Calendar -> Calendar
             (#wsm[ws]=wfmcal) — the schedule/attendance Gantt. Extracts each
             employee's scheduled shift + activities (breaks/lunch/events).
  adherence  Tracking -> ADHERENCE -> Quick View — the real-time text grid.
             Extracts the OOA rows and (optionally) runs the OOA pipeline.

Modes (positional):
  login      Open Chromium with a PERSISTENT profile so you log into Verint by
             hand (no credentials in code); the session is saved for `extract`.
  extract    Run the browser-use agent (read-only) and emit a capture JSON.

Guardrails: read-only (D4) — never Edit/Delete/Insert/Create/Save/Send/Move a
schedule block or use Mass Schedule Editor; navigation domain-locked to
*.verintcloudservices.com (D5). No screenshots persisted; no secrets logged.

Env: .venv-browser (Python 3.12) with browser-use, playwright, langchain-anthropic
and `playwright install chromium`. LLM defaults to FuelIX (export FUELIX_API_KEY).

Examples:
  python verint_browser_use_demo.py login
  export FUELIX_API_KEY=ak-...
  python verint_browser_use_demo.py extract --target calendar --account "CIBC" --geo Guatemala
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parent))

BASE_URL = "https://wfo.a87.verintcloudservices.com"
CALENDAR_URL = f"{BASE_URL}/wfo/ui/#wsm%5Bws%5D=wfmcal"
ADHERENCE_URL = BASE_URL  # navigate via menu to Tracking -> ADHERENCE
DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_PROVIDER = "fuelix"
DEFAULT_FUELIX_BASE_URL = "https://api.fuelix.ai/v1"
DEFAULT_PROFILE = str(Path.home() / ".verint_demo_profile")
ALLOWED_DOMAINS = ["*.verintcloudservices.com"]


# ---------------------------------------------------------------------------
# Structured extraction schemas (force JSON, not prose)
# ---------------------------------------------------------------------------

class CalendarSegment(BaseModel):
    """One scheduled activity block within an employee's day on the calendar."""
    activity: str = Field(description="Activity name, e.g. 'BLEN - Blended', 'LNCH - Lunch unpaid', 'BRKP - Break Paid'")
    start: str = Field(default="", description="Start time as shown, e.g. '10:00 AM'")
    end: str = Field(default="", description="End time as shown, e.g. '7:15 PM'")


class CalendarRow(BaseModel):
    """One employee row on the schedule/attendance calendar."""
    employee_name: str = Field(description="Employee name exactly as shown, e.g. 'Aceituno, Sharon'")
    date: str = Field(default="", description="The schedule date shown, e.g. '06/01/2026'")
    scheduled_shift: str = Field(
        default="",
        description="The shift assignment, e.g. 'BLEN - Blended 10:00 AM-7:15 PM' or 'Off'.",
    )
    segments: list[CalendarSegment] = Field(
        default_factory=list,
        description="Activity blocks within the shift (breaks, lunch, meetings, events).",
    )


class CalendarCapture(BaseModel):
    rows: list[CalendarRow] = Field(default_factory=list)
    grid_found: bool = Field(default=True, description="False if the calendar / filter could not be located.")
    note: str = Field(default="", description="Short note on what was seen (no PII dumps).")


class AdherenceRow(BaseModel):
    """One row of the ADHERENCE -> Quick View grid, verbatim text."""
    name: str = Field(description="Agent name, e.g. 'Avery, Sam'")
    scheduled_activity: str = Field(description="Scheduled Activity column, verbatim")
    out_of_adherence: str = Field(default="", description="OOA duration like '0:11:07' (empty if in adherence)")
    actual_activity: str = Field(description="Actual Activity column, verbatim")
    time_in_activity: str = Field(default="", description="Time In Activity column")
    days_adherence: str = Field(default="", description="Day's Adherence column, e.g. '78%'")


class AdherenceCapture(BaseModel):
    rows: list[AdherenceRow] = Field(default_factory=list)
    grid_found: bool = Field(default=True)
    note: str = Field(default="")


# ---------------------------------------------------------------------------
# Task prompts (read-only, extraction-only)
# ---------------------------------------------------------------------------

_READONLY = (
    "You are a READ-ONLY data-extraction agent. You may navigate and read only. "
    "ABSOLUTELY DO NOT click or trigger: Edit, Delete, Insert, Create, Save, "
    "Purge, 'Send Message', Mass Schedule Editor, or drag/move any schedule "
    "block. This is a live production workforce system; never modify anything."
)


def build_calendar_task(url: str, account: str) -> str:
    account_step = (
        f'3. (OPTIONAL filter — do not get stuck on it.) To narrow to {account}: '
        f'open the Employee filter (funnel icon) -> "Organization" tab, type '
        f'"{account}". For each matching node, FIRST single-click the node so it '
        f'highlights/selects, THEN click the button that moves it into "Selected '
        f'Organizations". IMPORTANT: between the two lists there is a vertical '
        f'column of arrow buttons — the correct one is the THIRD button from the '
        f'top (it loads the schedules / moves the org with its descendants). Do '
        f'NOT use the FIRST/top ▸▸ button — that one does not load the schedules. '
        f'After the node(s) appear in "Selected Organizations", click Run, then '
        f'Apply. CRITICAL FALLBACK: if the filter will not apply after 2 '
        f'attempts, Cancel the dialog and just extract the employees already '
        f'visible. NEVER return grid_found=false while employees are visible.'
        if account else
        "3. Read the employees already listed."
    )
    return f"""
{_READONLY}

Goal: extract the schedule/attendance calendar for the target account.

Steps:
1. Go to {url}. If you see a login screen, stop and report grid_found=false
   (do not attempt to log in).
2. Wait for the Calendar (Forecasting & Scheduling -> Calendar) to load. It is a
   Gantt: employees down the left, a time-of-day axis across the top, and colored
   blocks for scheduled shifts and activities (breaks, lunch, meetings).
{account_step}
4. Capture the employees on the CURRENT (first) page only — up to ~25 rows. Do
   NOT page through all pages. For each employee row capture:
   - employee_name (verbatim, e.g. "Aceituno, Sharon")
   - date (the day shown)
   - scheduled_shift (shift assignment text, e.g. "BLEN - Blended 10:00 AM-7:15 PM", or "Off")
   - segments: activity blocks (activity name + start/end times). Read a block's
     tooltip/label if visible; capture what is legible and do NOT invent times.
     If exact times are unreadable, still record the activity name with empty times.
5. Set grid_found=true and return the rows you captured. Only return
   grid_found=false if NO employees are visible at all. Do not summarize or
   compose alerts.
""".strip()


def build_adherence_task(url: str, view: str) -> str:
    return f"""
{_READONLY}

Goal: extract the real-time adherence grid for one line of business.

Steps:
1. You should be logged in at {url}. If you see a login screen, stop and report
   grid_found=false.
2. Navigate: top menu -> Tracking -> ADHERENCE -> Quick View.
3. In the left "View:" dropdown, select the saved view named exactly: "{view}".
4. Read the grid columns: Name | Scheduled Activity | Out Of Adherence |
   Actual Activity | Time In Activity | Day's Adherence.
5. For EVERY visible row capture those six fields verbatim ("Out Of Adherence" is
   a duration like 0:11:07, empty if in adherence).
6. Return the structured rows. Do not summarize or compose alerts. If the grid
   cannot be found, return grid_found=false with an empty rows list.
""".strip()


# ---------------------------------------------------------------------------
# login mode — interactive, plain Playwright persistent context
# ---------------------------------------------------------------------------

async def run_login(url: str, profile_dir: str) -> None:
    from playwright.async_api import async_playwright

    Path(profile_dir).mkdir(parents=True, exist_ok=True)
    print(f"Opening Chromium with persistent profile: {profile_dir}")
    print("Log into Verint in the window, then return here and press Enter to "
          "save the session and close.\n")
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(profile_dir, headless=False)
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(url)
        await asyncio.get_event_loop().run_in_executor(None, input, "Press Enter when logged in... ")
        await ctx.close()
    print("Session saved to profile.")


# ---------------------------------------------------------------------------
# netcap mode — record the JSON/XML the calendar SPA fetches (no LLM, no SVG)
# ---------------------------------------------------------------------------

async def run_netcap(args) -> None:
    """Capture the network responses the WFM Calendar uses to render its (SVG)
    Gantt. The SVG is drawn from underlying data — record that data directly.

    Interactive + pure Playwright: the user logs in and applies the filter; we
    collect responses, then save the JSON/XML (and schedule-ish) ones for
    analysis. This is far more reliable than vision-reading the SVG.
    """
    import re as _re
    from datetime import datetime
    from playwright.async_api import async_playwright

    stamp = datetime.now().astimezone().isoformat(timespec="seconds")
    out_dir = Path(args.out) / ("netcap_" + _re.sub(r"[^0-9A-Za-z]+", "", stamp))
    bodies = out_dir / "responses"
    bodies.mkdir(parents=True, exist_ok=True)

    _KEYWORDS = ("schedule", "calendar", "wfm", "activit", "roster", "shift",
                 "employee", "agent", "adherence")

    Path(args.profile).mkdir(parents=True, exist_ok=True)
    responses = []
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            args.profile, headless=False, executable_path=args.executable_path)
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        page.on("response", lambda r: responses.append(r))
        await page.goto(CALENDAR_URL)
        print("\n" + "=" * 72)
        print("Chromium (yellow 'Test' stripe) is open at the Verint calendar.")
        print("1) Log in THERE.  2) Apply the EPIC_TISV filter so the calendar")
        print("   shows EPIC employees.  Network traffic is being recorded.")
        print("Then return here and press Enter to save the captured responses.")
        print("=" * 72)
        await asyncio.get_event_loop().run_in_executor(
            None, input, "Press Enter once the EPIC calendar is on screen... ")
        await asyncio.sleep(2)  # let late XHRs land

        manifest = []
        idx = 0
        for r in responses:
            try:
                url = r.url
                if "verintcloudservices.com" not in url:
                    continue
                ct = ((await r.header_value("content-type")) or "").lower()
                is_data = ("json" in ct) or ("xml" in ct)
                is_kw = any(k in url.lower() for k in _KEYWORDS)
                if not (is_data or is_kw):
                    continue
                body = await r.body()
                if not body:
                    continue
                idx += 1
                tail = _re.sub(r"[^0-9A-Za-z]+", "_", url.split("verintcloudservices.com", 1)[-1])[:70]
                ext = "json" if "json" in ct else ("xml" if "xml" in ct else "txt")
                (bodies / f"{idx:03d}_{tail}.{ext}").write_bytes(body)
                manifest.append({"i": idx, "url": url, "status": r.status,
                                 "content_type": ct, "bytes": len(body),
                                 "file": f"{idx:03d}_{tail}.{ext}"})
            except Exception as exc:
                manifest.append({"error": str(exc)[:120], "url": getattr(r, "url", "?")})
        await ctx.close()

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    data = [m for m in manifest if "bytes" in m]
    print(f"\nCaptured {len(data)} data responses -> {out_dir}")
    for m in sorted(data, key=lambda x: -x["bytes"])[:15]:
        print(f"  {m['bytes']:>9}B  {m['content_type'][:22]:<22} {m['url'][:95]}")
    print(f"\nManifest: {out_dir / 'manifest.json'}")


# ---------------------------------------------------------------------------
# observe mode — flight recorder: measure Verint's refresh "heartbeat"
# (response + WebSocket timeline, metadata-only). No LLM. Read-only.
# ---------------------------------------------------------------------------

async def run_observe(args) -> None:
    """Record a timestamped timeline of what Verint fetches over a fixed window,
    so we can MEASURE the calendar refresh cadence and detect WebSocket streams.

    Writes runs/observe_<ts>/timeline.jsonl with METADATA ONLY (ts, kind,
    endpoint, status, bytes, resourceData_count) — never names or payloads.
    Answers: does the calendar re-fetch on a timer? how often? any WebSocket?
    """
    import re as _re
    from datetime import datetime
    from urllib.parse import urlparse
    from playwright.async_api import async_playwright

    stamp = datetime.now().astimezone().isoformat(timespec="seconds")
    out_dir = Path(args.out) / ("observe_" + _re.sub(r"[^0-9A-Za-z]+", "", stamp))
    out_dir.mkdir(parents=True, exist_ok=True)
    timeline_path = out_dir / "timeline.jsonl"

    def now():
        return datetime.now().astimezone().isoformat(timespec="milliseconds")

    timeline: list[dict] = []
    counts = {"xhr": 0, "ws_open": 0, "ws_frame": 0, "calendar_filter": 0}

    def record(ev: dict):
        timeline.append(ev)

    async def handle_response(r, ts):
        try:
            url = r.url
            if "verintcloudservices.com" not in url:
                return
            ct = ((await r.header_value("content-type")) or "").lower()
            path = urlparse(url).path
            is_api = ("/api/" in path) or ("json" in ct) or ("xml" in ct)
            if not is_api:
                return
            clen = await r.header_value("content-length")
            ev = {"ts": ts, "kind": "xhr", "endpoint": path,
                  "status": r.status, "bytes": int(clen) if clen and clen.isdigit() else None}
            if "/v2/calendar-filter" in path:
                counts["calendar_filter"] += 1
                try:
                    import json as _json
                    obj = _json.loads(await r.body())
                    rd = obj.get("data", {}).get("attributes", {}).get("resourceData", [])
                    ev["resourceData_count"] = len(rd)
                except Exception:
                    ev["resourceData_count"] = None
                print(f"  [{ts[11:19]}] ♥ calendar-filter  ← {ev.get('resourceData_count')} resources")
            counts["xhr"] += 1
            record(ev)
        except Exception:
            pass

    def on_response(r):
        asyncio.create_task(handle_response(r, now()))

    def on_websocket(ws):
        ts = now()
        counts["ws_open"] += 1
        record({"ts": ts, "kind": "ws-open", "endpoint": ws.url})
        print(f"  [{ts[11:19]}] ⚡ WebSocket opened: {ws.url[:80]}")
        ws.on("framereceived", lambda payload: (
            counts.__setitem__("ws_frame", counts["ws_frame"] + 1),
            record({"ts": now(), "kind": "ws-frame", "dir": "in",
                    "bytes": len(payload) if payload else 0})))
        ws.on("framesent", lambda payload: (
            counts.__setitem__("ws_frame", counts["ws_frame"] + 1),
            record({"ts": now(), "kind": "ws-frame", "dir": "out",
                    "bytes": len(payload) if payload else 0})))

    Path(args.profile).mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            args.profile, headless=False, executable_path=args.executable_path)
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        page.on("response", on_response)
        page.on("websocket", on_websocket)
        await page.goto(CALENDAR_URL)
        print("\n" + "=" * 72)
        print("FLIGHT RECORDER. Log into Verint, apply the EPIC_TISV filter so the")
        print("calendar shows employees. Then press Enter to start the observation")
        print(f"window (~{args.observe_seconds}s). LEAVE THE CALENDAR OPEN and watch the")
        print("heartbeat below (page through / re-apply filter mid-window to compare).")
        print("Recording METADATA ONLY (timestamps/endpoints/counts) — no names/payloads.")
        print("=" * 72)
        from datetime import datetime as _dt
        await asyncio.get_event_loop().run_in_executor(
            None, input, "Press Enter to begin the observation window... ")
        obs_start = _dt.now().astimezone()
        print(f"\nObserving for {args.observe_seconds}s — heartbeat:")
        await asyncio.sleep(args.observe_seconds)
        obs_end = _dt.now().astimezone()
        await ctx.close()

    timeline_path.write_text(
        "\n".join(json.dumps(e) for e in timeline) + "\n", encoding="utf-8")

    # Summary: characterize the calendar-filter refresh behavior.
    # Verint fires calendar-filter in pairs (~1s apart) per user action, so we
    # collapse near-duplicates before measuring gaps, and only count the timed
    # window (post-Enter). A long trailing idle gap => interaction-driven refresh.
    cf = [_dt.fromisoformat(e["ts"]) for e in timeline
          if e.get("endpoint", "").endswith("/v2/calendar-filter")]
    cf = [t for t in cf if t >= obs_start]
    distinct = []
    for t in cf:
        if not distinct or (t - distinct[-1]).total_seconds() > 3:
            distinct.append(t)
    gaps = [round((b - a).total_seconds()) for a, b in zip(distinct, distinct[1:])]
    trailing_idle = round((obs_end - distinct[-1]).total_seconds()) if distinct else None

    print("\n=== observation summary ===")
    print(f"  events: {len(timeline)} | calendar-filter calls: {counts['calendar_filter']} "
          f"(~{len(distinct)} distinct refreshes in-window) | "
          f"ws-open: {counts['ws_open']} | ws-frames: {counts['ws_frame']}")
    if gaps:
        print(f"  distinct-refresh gaps (s): {gaps}  (these track USER actions, not a fixed timer)")
    if trailing_idle is not None:
        print(f"  idle gap after last refresh: {trailing_idle}s of the {args.observe_seconds}s window")
        if trailing_idle > 120:
            print("  → during idle the calendar did NOT re-fetch → refresh is "
                  "INTERACTION-DRIVEN, not an idle timer. (Add a gentle re-trigger "
                  "for idle freshness.)")
    if counts["ws_open"] == 0:
        print("  → no WebSocket: the extension's fetch/XHR hook is sufficient.")
    else:
        print("  ⚡ WebSocket seen — the extension may need a WS tap for refreshes.")
    print(f"\n  timeline -> {timeline_path}")


# ---------------------------------------------------------------------------
# LLM provider
# ---------------------------------------------------------------------------

def build_llm(args):
    """fuelix -> ChatOpenAI@FuelIX (FUELIX_API_KEY); anthropic -> ChatAnthropic."""
    if args.provider == "fuelix":
        from browser_use import ChatOpenAI
        key = os.environ.get("FUELIX_API_KEY")
        if not key:
            raise SystemExit("Set FUELIX_API_KEY for --provider fuelix (export FUELIX_API_KEY=ak-...).")
        return ChatOpenAI(model=args.model, base_url=args.fuelix_base_url, api_key=key)
    from browser_use import ChatAnthropic
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("Set ANTHROPIC_API_KEY for --provider anthropic.")
    return ChatAnthropic(model=args.model)


# ---------------------------------------------------------------------------
# extract mode
# ---------------------------------------------------------------------------

def chromium_executable() -> str | None:
    """Path to the Playwright-bundled Chromium ('Google Chrome for Testing').

    Pinned explicitly so browser-use never auto-detects and launches the user's
    default browser (e.g. Brave). Call from a SYNC context (no running asyncio
    loop) — we resolve it in main() before asyncio.run().
    """
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            return p.chromium.executable_path
    except Exception:
        return None


def _target_url_task_schema(args):
    if args.target == "calendar":
        return CALENDAR_URL, build_calendar_task(CALENDAR_URL, args.account), CalendarCapture
    return ADHERENCE_URL, build_adherence_task(ADHERENCE_URL, args.view), AdherenceCapture


def _structured_from_history(history, schema):
    structured = history.structured_output
    if structured is None:
        raw = history.final_result()
        structured = schema.model_validate_json(raw) if raw else schema(grid_found=False)
    return structured


async def run_live(args):
    """Login + extract in ONE continuous browser session.

    Verint uses session cookies that do not survive a browser restart, so the
    manual login and the agent extraction must share a single keep-alive session.
    The user logs into the automation Chromium (yellow 'Test' stripe), then the
    agent runs against that authenticated session.
    """
    from browser_use import Agent, BrowserSession, BrowserProfile

    url, task, schema = _target_url_task_schema(args)
    llm = build_llm(args)  # validate FUELIX_API_KEY up front
    profile = BrowserProfile(
        user_data_dir=args.profile,
        headless=False,                   # must be visible for manual login
        allowed_domains=ALLOWED_DOMAINS,
        executable_path=args.executable_path,  # pin Chromium; never auto-detect Brave
        enable_default_extensions=False,
        keep_alive=True,
    )
    session = BrowserSession(browser_profile=profile)
    await session.start()
    try:
        try:
            await session.navigate_to(url)
        except Exception:
            pass  # the agent will navigate anyway
        print("\n" + "=" * 72)
        print("A Chromium window (yellow 'Test' stripe) is open at Verint.")
        print("Log in THERE (not Brave/Safari). Apply the EPIC filter so the")
        print("calendar shows EPIC employees, then return here.")
        print("=" * 72)
        await asyncio.get_event_loop().run_in_executor(
            None, input, "Press Enter when the calendar is showing employees... ")

        agent = Agent(
            task=task, llm=llm, browser_session=session,
            output_model_schema=schema, use_vision=True,
            extend_system_message=_READONLY,
        )
        print(f"Extracting: target={args.target} account={args.account or '(loaded)'} "
              f"| provider={args.provider} model={args.model} (max_steps={args.max_steps})")
        history = await agent.run(max_steps=args.max_steps)
        return _structured_from_history(history, schema)
    finally:
        for closer in ("kill", "stop", "close"):
            fn = getattr(session, closer, None)
            if fn:
                try:
                    res = fn()
                    if asyncio.iscoroutine(res):
                        await res
                    break
                except Exception:
                    continue


async def run_extract(args):
    from browser_use import Agent, BrowserProfile

    url, task, schema = _target_url_task_schema(args)

    profile = BrowserProfile(
        user_data_dir=args.profile,
        headless=args.headless,
        allowed_domains=ALLOWED_DOMAINS,
        executable_path=args.executable_path,  # pin Chromium; never auto-detect Brave
        enable_default_extensions=False,  # skip slow first-launch extension downloads
        keep_alive=False,
    )
    agent = Agent(
        task=task,
        llm=build_llm(args),
        browser_profile=profile,
        output_model_schema=schema,
        use_vision=True,
        extend_system_message=_READONLY,
    )
    print(f"Extracting: target={args.target} account={args.account or '(loaded)'} "
          f"geo={args.geo} | provider={args.provider} model={args.model} "
          f"(headless={args.headless}, max_steps={args.max_steps})")
    history = await agent.run(max_steps=args.max_steps)

    structured = history.structured_output
    if structured is None:
        raw = history.final_result()
        structured = schema.model_validate_json(raw) if raw else schema(grid_found=False)
    return structured


# ---------------------------------------------------------------------------
# Capture assembly + output
# ---------------------------------------------------------------------------

def assemble_capture(structured, args) -> dict:
    return {
        "captured_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source_url": CALENDAR_URL if args.target == "calendar" else ADHERENCE_URL,
        "target": args.target,
        "account": args.account,
        "view": args.view,
        "lob": args.lob or args.account,
        "geo": args.geo,
        "cycle": args.cycle,
        "persistence_map": {},
        "grid_found": structured.grid_found,
        "note": structured.note,
        "rows": [r.model_dump() for r in structured.rows],
    }


def _print_calendar(capture: dict) -> None:
    print(f"\n--- Calendar extraction: {len(capture['rows'])} employees "
          f"(grid_found={capture['grid_found']}) ---")
    for r in capture["rows"][:25]:
        segs = "; ".join(f"{s['activity']} {s['start']}-{s['end']}".strip()
                         for s in r.get("segments", []))
        print(f"  {r['employee_name']:<32} {r.get('scheduled_shift', '')}")
        if segs:
            print(f"      {segs}")
    if len(capture["rows"]) > 25:
        print(f"  ... (+{len(capture['rows']) - 25} more)")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=["login", "extract", "live", "netcap", "observe"],
                        help="live = agent extract in one session; "
                             "netcap = record the calendar's JSON/XML feed; "
                             "observe = flight recorder for the refresh heartbeat (response+WebSocket timeline).")
    parser.add_argument("--target", choices=["calendar", "adherence"], default="calendar")
    parser.add_argument("--account", default="", help="Organization/account to filter to (calendar).")
    parser.add_argument("--view", default="", help="Saved View name (adherence).")
    parser.add_argument("--lob", default="", help="LOB label to inject (defaults to --account).")
    parser.add_argument("--geo", default="", help="GEO to inject.")
    parser.add_argument("--cycle", type=int, default=1)
    parser.add_argument("--profile", default=os.environ.get("VERINT_PROFILE", DEFAULT_PROFILE))
    parser.add_argument("--model", default=os.environ.get("BROWSER_USE_MODEL", DEFAULT_MODEL))
    parser.add_argument("--provider", choices=["fuelix", "anthropic"],
                        default=os.environ.get("BROWSER_USE_PROVIDER", DEFAULT_PROVIDER),
                        help="LLM provider (default fuelix — uses FUELIX_API_KEY).")
    parser.add_argument("--fuelix-base-url", default=os.environ.get("FUELIX_BASE_URL", DEFAULT_FUELIX_BASE_URL))
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--max-steps", type=int, default=40,
                        help="Cap on agent steps (bounds time/token cost).")
    parser.add_argument("--observe-seconds", type=int, default=900,
                        help="observe mode: length of the observation window (default 900 = 15 min).")
    parser.add_argument("--run-pipeline", action="store_true",
                        help="(adherence only) feed the OOA pipeline to produce cards.")
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent / "runs"))
    args = parser.parse_args(argv)
    args.executable_path = chromium_executable()  # pin Chromium (resolve in sync context)
    if args.mode != "login" and not args.executable_path:
        print("WARNING: could not resolve bundled Chromium path; browser-use may "
              "auto-detect a browser. Run: ../.venv-browser/bin/python -m playwright install chromium")

    if args.mode == "login":
        asyncio.run(run_login(CALENDAR_URL if args.target == "calendar" else ADHERENCE_URL, args.profile))
        return 0

    if args.mode == "netcap":
        asyncio.run(run_netcap(args))
        return 0

    if args.mode == "observe":
        asyncio.run(run_observe(args))
        return 0

    structured = asyncio.run(run_live(args) if args.mode == "live" else run_extract(args))
    capture = assemble_capture(structured, args)

    from verint_pipeline import _run_id
    run_dir = Path(args.out) / _run_id(capture["captured_at"])
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "capture.json").write_text(json.dumps(capture, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nCaptured {len(capture['rows'])} rows (grid_found={capture['grid_found']}) "
          f"-> {run_dir / 'capture.json'}")

    if args.target == "calendar":
        _print_calendar(capture)
        return 0

    # adherence
    if not capture["rows"]:
        print("No rows extracted.")
        return 0
    if args.run_pipeline:
        from verint_pipeline import run_pipeline, write_artifacts, _print_summary
        result = run_pipeline(capture)
        _print_summary(result, write_artifacts(result, Path(args.out)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
