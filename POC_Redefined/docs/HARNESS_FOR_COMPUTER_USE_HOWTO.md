# Harness for Computer Use — HOWTO
## Vision Agent Build Guide: From Simulation Snapshots to Live Verint Data

> **Audience:** Engineers taking the RTA Command Center from PoC to production.
>
> **Prerequisite reading:** `ARCHITECTURE.md`, `SOLUTION.md`, `SCOPE.md`, `NEXT_STEPS.md`
>
> **Single objective of this guide:** Replace the synthetic Verint snapshots
> (`POC/07_simulation/data/sim_snapshot_t0.json`) with real data, without
> changing any downstream code.

---

## Section 0 — How to Read This Guide

### 0.1 What the harness is

The harness is an **input adapter**. It sits at the boundary between Verint/Citrix
and the existing Intelligence Service and has exactly one job: produce a
`List[AgentRow]` every 15 minutes.

Everything downstream — the alert rule engine, the card builder, the draft message
formatter, the Command Center UI — is already built, tested, and unchanged by
this work. The harness does not touch those systems.

```
┌─────────────────────────────────────────────────────────────────┐
│ CIBC Boundary                                                   │
│   Verint WFM (agent adherence grid)                             │
└──────────────────────┬──────────────────────────────────────────┘
                       │  pixel stream (Track A)
                       │  REST API call (Track B)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ HARNESS — this guide                                            │
│                                                                 │
│  Capture Layer   ──►  Extraction Layer  ──►  Normalisation      │
│  (screen/API)         (engine/parser)         (→ AgentRow)      │
└──────────────────────┬──────────────────────────────────────────┘
                       │  List[AgentRow]
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ EXISTING SYSTEM — unchanged                                     │
│                                                                 │
│  alert_engine.py  ──►  card_builder.py  ──►  Command Center     │
│  evaluate_agents()     build_card()          HITL + dispatch    │
└─────────────────────────────────────────────────────────────────┘
```

### 0.2 Two tracks

| Track | Approach | When to use | API credentials needed? |
|---|---|---|---|
| **Track A** | Computer use — screenshot the Citrix window, use a vision model to extract structured rows | Default starting point; no CIBC IT access required | No (only your LLM provider key) |
| **Track B** | Verint REST API — call the adherence endpoint directly | Preferred production path once CIBC IT provisions read-only credentials | Yes (Verint API credential from CIBC IT) |

Both tracks produce identical `List[AgentRow]` output. The rest of the system
cannot tell which track is running.

### 0.3 What changes per account

When onboarding a new account, only two configuration files change:

1. `harness_config.json` — account identifier, LOB list, geography, adapter choice, model endpoint
2. `lob_routing_seed.json` — LOB names mapped to geo, used to inject LOB context in Track A

No Python code changes. No model retraining. No changes to the alert rules or
card builder.

---

## Section 1 — Prerequisites and Environment

### 1.1 Platform requirements

The harness daemon runs on the **RTA's Windows machine** — the same machine
where Citrix Receiver is installed and Verint is visible on screen.

| Component | Requirement | Notes |
|---|---|---|
| Operating system | Windows 10 or 11 (64-bit) | Citrix Receiver runs on the RTA's Windows workstation |
| Python | 3.11 or later | Install from python.org; add to PATH |
| Citrix Receiver | Any version currently in use at the site | Harness reads from it; does not write to it |
| Verint WFM | Accessible via Citrix session | Track A reads the screen; Track B reads the API |
| Network | Outbound HTTPS to your LLM provider endpoint | Required for Track A; Track B requires HTTPS to Verint API |

### 1.2 Python dependencies

Create a `requirements.txt` in the harness project root:

```
# Screen capture and window control (Windows-only)
mss==9.0.1
pywin32==306
pyautogui==0.9.54

# Configuration and environment
python-dotenv==1.0.1
pydantic==2.7.1

# HTTP clients
requests==2.32.3
httpx==0.27.0          # async-friendly; preferred for webhook mode in Track B

# Scheduling
schedule==1.2.2

# Test utilities
pytest==8.2.0
pytest-mock==3.14.0
```

Install:
```bash
pip install -r requirements.txt
```

For Track A — Microsoft UFO² option only:
```bash
pip install ufo
```

### 1.3 Environment variables

Store all secrets in a `.env` file in the harness project root.
**Never commit `.env` to version control.**

```dotenv
# ── Adapter selection ──────────────────────────────────────────────────────
# Options: ufo2 | claude_cu | openai_cua | azure_vision | verint_api
HARNESS_ADAPTER=ufo2

# ── LLM provider (Track A vision engines) ─────────────────────────────────
# Azure OpenAI (recommended for Telus enterprise stack)
AZURE_OPENAI_KEY=your_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4o

# FuelIX (Telus internal LLM gateway — OpenAI-compatible)
FUELIX_API_KEY=your_key_here
FUELIX_BASE_URL=https://api.fuelix.telus.com/v1

# Anthropic (Claude Computer Use)
ANTHROPIC_API_KEY=your_key_here

# OpenAI (CUA model)
OPENAI_API_KEY=your_key_here

# ── Verint REST API (Track B only) ────────────────────────────────────────
VERINT_API_URL=https://verint.cibc-internal.example.com
VERINT_CLIENT_ID=your_client_id
VERINT_CLIENT_SECRET=your_client_secret

# ── Paths ─────────────────────────────────────────────────────────────────
LOB_CONFIG_PATH=./config/harness_config.json
ALERT_RULES_PATH=../../POC/01_evidence_pack/rules/alert_thresholds.json
LOB_ROUTING_PATH=../../POC/01_evidence_pack/rules/lob_routing_seed.json
CHANNEL_MAP_PATH=../../POC/07_simulation/data/lob_channel_map.json

# ── Capture settings ──────────────────────────────────────────────────────
CAPTURE_INTERVAL_SECONDS=30
CYCLE_INTERVAL_SECONDS=900
SCREENSHOT_RETENTION_SECONDS=60
```

### 1.4 Configuration file

Create `config/harness_config.json` — this is the only file that changes
per account. Do not check it into version control (add to `.gitignore`).

```json
{
  "_comment": "CIBC Guatemala — production harness configuration",
  "account": "cibc_guatemala",
  "geo": "Guatemala",
  "adapter": "ufo2",
  "model": {
    "provider": "azure_openai",
    "endpoint_env": "AZURE_OPENAI_ENDPOINT",
    "api_key_env": "AZURE_OPENAI_KEY",
    "deployment": "gpt-4o"
  },
  "lobs": [
    "Cards",
    "Costco",
    "Costco Disputes",
    "Telephone Banking",
    "Fraud ITR",
    "Fraud AAF"
  ],
  "lob_tab_order": [
    "Cards",
    "Costco",
    "Costco Disputes",
    "Telephone Banking",
    "Fraud ITR",
    "Fraud AAF"
  ],
  "citrix": {
    "window_title_contains": "Verint",
    "process_name": "wfica32.exe",
    "tab_load_wait_seconds": 1.5,
    "full_desktop_mode": false
  },
  "cycle_interval_seconds": 900,
  "capture_interval_seconds": 30,
  "screenshot_retention_seconds": 60,
  "audit_log_path": "./logs/harness_audit.jsonl"
}
```

**Citrix process names by version:**

| Citrix version | `process_name` value |
|---|---|
| Citrix Workspace (current) | `wfica32.exe` |
| Citrix Receiver (legacy) | `concentr.exe` or `wfica32.exe` |
| Citrix Virtual Apps | `wfica32.exe` |
| If unsure | Open Task Manager → find the Verint window → note process name |

---

## Section 2 — The AgentRow Contract

### 2.1 Why this is the only interface that matters

The harness connects to the existing Intelligence Service through a single
Python dataclass defined in
`POC/07_simulation/engine/alert_engine.py`:

```python
@dataclass
class AgentRow:
    agent_id: str                       # unique per agent
    agent_name: str                     # as displayed in Verint
    lob: str                            # Line of Business — injected from config, NOT from OCR
    geo: str                            # "Guatemala" or "Philippines"
    actual_status: str                  # Verint status code (e.g. "COAC - Coaching")
    scheduled_activity: str             # What the schedule says (e.g. "BLEN - Blended")
    duration_seconds: int               # How long in current status (integer seconds)
    adherence_pct: float                # Adherence percentage (0.0–100.0)
    coaching_sessions_this_week: int = 0
    huddles_this_week: int = 0
    open_tickets: int = 0
```

If the harness produces a correctly-populated `List[AgentRow]`, the entire
downstream system works unchanged — rules fire, cards are built, messages are
drafted, the Command Center displays the Priority Feed.

### 2.2 Field-by-field reference

| Field | Type | Source | Notes | If missing |
|---|---|---|---|---|
| `agent_id` | `str` | Generated | Use `hashlib.md5(f"{agent_name}:{lob}:{geo}".encode()).hexdigest()[:12]`; stable across shifts | Cannot be absent — generate it |
| `agent_name` | `str` | Verint column 2 | Exactly as it appears in the grid (e.g. "Diego Salazar"); used in alert message text | Create `exception` card; skip alert evaluation |
| `lob` | `str` | Config / tab context | **Never from OCR** — always injected from `harness_config.json → lob_tab_order[current_tab]` | Create `exception` card |
| `geo` | `str` | Config | Always `"Guatemala"` or `"Philippines"` — from `harness_config.json → geo` | Default to config value; never absent |
| `actual_status` | `str` | Verint column 3 | Must match strings in `alert_thresholds.json` exactly (e.g. `"COAC - Coaching"`, not `"COAC"`) | Create `exception` card |
| `scheduled_activity` | `str` | Verint column 5 | Most fragile field — only visible if schedule column is in the Verint filter. If absent, use `"Unknown"` | Use `"Unknown"` — some rules still fire; OOA rules may be suppressed |
| `duration_seconds` | `int` | Verint column 4 | Grid shows `MM:SS` — convert: `minutes * 60 + seconds`. Never negative | Default to 0; rule won't fire (threshold not crossed) |
| `adherence_pct` | `float` | Verint column 6 | Strip `%` sign, convert to float. Range 0.0–100.0 | Default to `100.0`; flag in audit log |
| `coaching_sessions_this_week` | `int` | Verint detail / API | Not always visible in main grid. Default 0 if absent | Default to `0` |
| `huddles_this_week` | `int` | Verint detail / API | Same as above | Default to `0` |
| `open_tickets` | `int` | ServiceNow via Integration Agent (future) | Not from Verint — always 0 in Track A until Integration Agent is built | Default to `0` |

### 2.3 Critical mapping: Verint status codes

The `actual_status` field must match the strings in
`POC/01_evidence_pack/rules/alert_thresholds.json` exactly.
The most common mismatch is abbreviation vs. full label:

| What Verint may display | What the rules engine expects | Fix |
|---|---|---|
| `COAC` | `COAC - Coaching` | Normalise via `aux_definitions.json` |
| `INBD` | `INBD - Inbound` | Same |
| `BRKP` | `BRKP - Break Paid` | Same |
| `LNCH` | `LNCH - Lunch unpaid` | Same |
| `MEET` | `MEET - Meeting` | Same |

Load `POC/01_evidence_pack/rules/aux_definitions.json` at startup and use it
as a normalisation lookup before passing `actual_status` to `evaluate_agents()`.

### 2.4 What happens when fields are incomplete

```python
# harness/normaliser.py — exception card logic

def build_exception_card(raw_row: dict, reason: str, lob: str, geo: str) -> dict:
    """
    When a row cannot be normalised to a valid AgentRow, produce an
    exception CommandCard for the RTA to review manually.
    The card type is "exception" and confidence is 0.0.
    """
    return {
        "id": f"exc-{hashlib.md5(str(raw_row).encode()).hexdigest()[:8]}",
        "lane": "real-time-adherence",
        "type": "exception",
        "title": f"OCR parse failure — {lob}",
        "summary": f"Harness could not extract a complete agent row. Reason: {reason}",
        "owner": "ai",
        "status": "needs-review",
        "severity": "low",
        "dataClass": "simulated",
        "source": {"dataClass": "simulated", "label": "Harness exception", "detail": reason},
        "confidence": 0.0,
        "lob": lob,
        "geo": geo,
        "recommendedAction": "Review the raw capture log and correct manually.",
        "availableActions": ["suppress", "mark-resolved"],
        "targetChannels": ["audit-only"],
        "auditEvents": [],
    }
```

---

## Section 3 — Track A: Computer Use

Track A captures the Verint screen inside Citrix and uses a vision engine to
extract structured agent rows. No Verint API credentials are required.

### 3.1 Project structure

```
harness/
├── __init__.py
├── daemon.py                  # Entry point — runs capture/cycle loop
├── capture/
│   ├── __init__.py
│   ├── window_finder.py       # Find and lock the Citrix window handle
│   ├── screen_capture.py      # Take screenshots of the Citrix window
│   └── tab_navigator.py       # Cycle through Verint LOB tabs
├── extractors/
│   ├── __init__.py
│   ├── base.py                # ScreenExtractor Protocol
│   ├── ufo2_extractor.py      # Track A Option 1 — Microsoft UFO²
│   ├── claude_cu_extractor.py # Track A Option 2 — Claude Computer Use
│   ├── openai_cua_extractor.py# Track A Option 3 — OpenAI CUA
│   └── azure_vision_extractor.py  # Track A Option 4 — Azure Computer Vision
├── normaliser.py              # Raw dicts → AgentRow + exception handling
├── registry.py                # Adapter factory (config-driven)
├── audit.py                   # Append-only audit log writer
└── config.py                  # Loads harness_config.json + .env
```

### 3.2 Screen capture daemon

#### Step 1 — Find the Citrix window

```python
# harness/capture/window_finder.py

import win32gui
import win32con
import logging

logger = logging.getLogger(__name__)


def find_citrix_window(config: dict) -> int | None:
    """
    Find the Citrix Receiver window that contains the Verint WFM UI.

    Strategy:
      1. Try to find by window title substring (most reliable).
      2. Fall back to process name enumeration if title match fails.

    Returns the window handle (HWND) or None if not found.
    """
    title_fragment = config["citrix"]["window_title_contains"]
    handles = []

    def _enum_callback(hwnd: int, _: object) -> None:
        if win32gui.IsWindowVisible(hwnd):
            title = win32gui.GetWindowText(hwnd)
            if title_fragment.lower() in title.lower():
                handles.append(hwnd)

    win32gui.EnumWindows(_enum_callback, None)

    if not handles:
        logger.warning(
            "Citrix window not found. Title fragment: '%s'. "
            "Verify Citrix is open and Verint is visible.",
            title_fragment,
        )
        return None

    if len(handles) > 1:
        logger.info(
            "Multiple matching windows found (%d). Using first: HWND=%d",
            len(handles),
            handles[0],
        )

    return handles[0]


def is_window_alive(hwnd: int) -> bool:
    """Return True if the window handle is still valid."""
    try:
        return bool(win32gui.IsWindow(hwnd) and win32gui.IsWindowVisible(hwnd))
    except Exception:
        return False
```

#### Step 2 — Capture the window region

```python
# harness/capture/screen_capture.py

import mss
import mss.tools
import win32gui
import tempfile
import os
import time
import logging
from pathlib import Path
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def capture_window(hwnd: int, retention_seconds: int = 60) -> str | None:
    """
    Capture the content area of the given window.

    Returns the path to a temporary PNG file.
    The caller MUST delete this file after extraction is complete.
    Files older than `retention_seconds` are never retained.

    Returns None if the capture fails.
    """
    try:
        # Get window bounding rectangle in screen coordinates
        rect = win32gui.GetWindowRect(hwnd)
        left, top, right, bottom = rect
        width = right - left
        height = bottom - top

        if width < 100 or height < 100:
            logger.warning(
                "Window rect too small (%dx%d) — Citrix may be minimised.",
                width, height,
            )
            return None

        monitor = {"left": left, "top": top, "width": width, "height": height}

        # Create a temp file with a timestamp so age checks work
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
        tmp_path = Path(tempfile.gettempdir()) / f"harness_capture_{ts}.png"

        with mss.mss() as sct:
            screenshot = sct.grab(monitor)
            mss.tools.to_png(screenshot.rgb, screenshot.size, output=str(tmp_path))

        logger.debug("Captured %dx%d px → %s", width, height, tmp_path)
        return str(tmp_path)

    except Exception as exc:
        logger.error("Screen capture failed: %s", exc)
        return None


def delete_transient_capture(path: str) -> None:
    """
    Delete a capture file immediately after extraction.
    Called by the harness regardless of extraction outcome.
    Enforces the transient-frame security policy.
    """
    try:
        if path and os.path.exists(path):
            os.unlink(path)
            logger.debug("Transient capture deleted: %s", path)
    except Exception as exc:
        logger.warning("Could not delete capture file %s: %s", path, exc)
```

#### Step 3 — LOB tab navigator

```python
# harness/capture/tab_navigator.py

import time
import win32gui
import win32con
import pyautogui
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class TabState:
    lob_name: str
    tab_index: int
    window_hwnd: int


def navigate_to_tab(
    hwnd: int,
    tab_index: int,
    lob_name: str,
    tab_load_wait: float,
    use_ufo: bool = False,
) -> bool:
    """
    Activate the Citrix window and click the Verint LOB tab at position `tab_index`.

    Two navigation strategies:
      - UFO²-based (use_ufo=True): pass a natural-language instruction to UFO²
        to click the tab by its accessible name. More resilient to window moves.
      - pyautogui-based (use_ufo=False): click the tab's approximate screen
        coordinates. Fragile if the window is resized; use as fallback only.

    Returns True if navigation appears to have succeeded.
    """
    # Bring the Citrix window to the foreground
    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
    win32gui.SetForegroundWindow(hwnd)
    time.sleep(0.3)

    if use_ufo:
        return _navigate_with_ufo(lob_name)
    else:
        return _navigate_with_keyboard(tab_index, tab_load_wait)


def _navigate_with_keyboard(tab_index: int, wait: float) -> bool:
    """
    Use Ctrl+Tab to cycle to the correct tab index.
    Works when Verint tab order is stable and known from config.
    """
    # Verint starts on tab 0 after window focus; cycle to target index
    # Use Ctrl+Home first to reset to tab 0, then Ctrl+Tab N times
    pyautogui.hotkey("ctrl", "Home")
    time.sleep(0.2)
    for _ in range(tab_index):
        pyautogui.hotkey("ctrl", "Tab")
        time.sleep(0.1)
    time.sleep(wait)
    return True


def _navigate_with_ufo(lob_name: str) -> bool:
    """
    Delegate tab navigation to UFO². UFO uses UIA or vision to find the
    tab by its accessible name (the LOB label shown in the tab header).

    Requires UFO² to be running as a subprocess or service.
    """
    try:
        import subprocess, json
        cmd = [
            "python", "-m", "ufo",
            "--task", "verint_tab_navigate",
            "-r", f"Click the tab labelled '{lob_name}' in the Verint WFM window",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if result.returncode == 0:
            return True
        logger.warning("UFO² tab navigation failed: %s", result.stderr)
        return False
    except Exception as exc:
        logger.error("UFO² subprocess error: %s", exc)
        return False
```

#### Step 4 — Capture scheduler (the daemon loop)

```python
# harness/daemon.py

"""
harness/daemon.py
-----------------
Entry point for the Vision Agent harness.

Runs two nested loops:
  Outer loop (every 15 minutes = 1 RTA cycle):
    Iterates over all configured LOBs in tab order.
    For each LOB: navigate tab → capture → extract → normalise → evaluate → build cards.
    Posts the cycle's CommandCards to the Command Center via WebSocket or file queue.

  Inner loop (every 30 seconds = 1 capture interval):
    Captures the current Verint window state.
    Used by Track A engines to accumulate evidence before the cycle evaluation.

Usage:
    python -m harness.daemon --config config/harness_config.json
"""

import argparse
import logging
import signal
import sys
import time
from pathlib import Path

from .config import load_config
from .registry import build_adapter
from .audit import AuditLog

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("harness.daemon")


def run(config: dict) -> None:
    adapter = build_adapter(config)
    audit = AuditLog(config["audit_log_path"])
    lobs = config["lob_tab_order"]
    geo = config["geo"]
    cycle_interval = config["cycle_interval_seconds"]

    logger.info(
        "Harness started. Account: %s | Adapter: %s | LOBs: %s",
        config["account"],
        config["adapter"],
        lobs,
    )
    audit.write("harness_start", {"account": config["account"], "adapter": config["adapter"]})

    # Register SIGINT handler for graceful shutdown
    running = [True]
    def _shutdown(sig, frame):
        logger.info("Shutdown signal received.")
        running[0] = False
    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    while running[0]:
        cycle_start = time.time()
        all_rows = []

        for lob in lobs:
            if not running[0]:
                break
            try:
                rows = adapter.get_agent_rows(lob=lob, geo=geo)
                all_rows.extend(rows)
                audit.write(
                    "lob_cycle_complete",
                    {"lob": lob, "row_count": len(rows)},
                )
                logger.info("LOB %s: %d rows extracted.", lob, len(rows))
            except Exception as exc:
                logger.error("Error extracting LOB %s: %s", lob, exc)
                audit.write("lob_cycle_error", {"lob": lob, "error": str(exc)})

        # Feed all rows into the existing Intelligence Service
        if all_rows:
            _evaluate_and_emit(all_rows, audit, config)

        # Sleep until next cycle
        elapsed = time.time() - cycle_start
        sleep_for = max(0.0, cycle_interval - elapsed)
        logger.info(
            "Cycle complete. %d total rows. Next cycle in %.0fs.",
            len(all_rows), sleep_for,
        )
        time.sleep(sleep_for)


def _evaluate_and_emit(all_rows, audit, config):
    """
    Pass the collected AgentRow list through the existing Intelligence Service
    and write the resulting CommandCards to the output queue.
    """
    import sys, json
    sys.path.insert(0, str(Path(__file__).parent.parent.parent / "POC" / "07_simulation"))

    from engine.alert_engine import load_thresholds, evaluate_agents
    from engine.card_builder import build_card
    from datetime import datetime, timezone

    thresholds = load_thresholds()
    results = evaluate_agents(all_rows, thresholds)

    snapshot_time = datetime.now(timezone.utc).isoformat()
    cards = [build_card(r, snapshot_time, cycle=1) for r in results]

    # Write to output queue (file-based for PoC; WebSocket in production)
    output_path = Path(config.get("output_cards_path", "/tmp/harness_cards.json"))
    output_path.write_text(json.dumps(cards, indent=2))

    audit.write("cards_emitted", {"count": len(cards)})
    logger.info("Emitted %d cards → %s", len(cards), output_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()

    config = load_config(args.config)
    run(config)
```

### 3.3 Computer use engine options

All four options implement the same `ScreenExtractor` protocol:

```python
# harness/extractors/base.py

from typing import Protocol, runtime_checkable


@runtime_checkable
class ScreenExtractor(Protocol):
    """
    Contract for all Track A extraction engines.

    Input:  path to a temporary PNG screenshot + LOB context strings
    Output: list of raw row dicts (before AgentRow normalisation)

    Implementations must:
      - Delete or not retain the screenshot file (delete_after=True by default)
      - Return an empty list on failure (never raise — log and return [])
      - Include 'agent_name', 'actual_status', 'duration_mmss' in every returned dict
    """

    def extract_agent_rows(
        self,
        screenshot_path: str,
        lob_context: str,
        geo_context: str,
    ) -> list[dict]:
        ...
```

#### Option 1 — Microsoft UFO² (recommended for Windows)

UFO² is the strongest choice for Windows environments. It attempts to read the
**Windows UI Automation (UIA) accessibility tree** of the Verint window before
falling back to screenshot + GPT-4V vision. In Citrix seamless mode (where Verint
appears as a floating window on the Windows desktop), UIA often exposes the grid
data as structured text with zero OCR errors.

**Install:**
```bash
pip install ufo
```

**Configure UFO² for Verint (create `config/ufo/agents.yaml`):**
```yaml
HOST_AGENT:
  VISUAL_MODE: true
  API_TYPE: "aoai"                               # or "openai" for FuelIX
  API_BASE: "https://your-resource.openai.azure.com"
  API_KEY: ""                                    # loaded from env at runtime
  API_VERSION: "2024-02-15-preview"
  API_MODEL: "gpt-4o"

APP_AGENT:
  VISUAL_MODE: true
  API_TYPE: "aoai"
  API_BASE: "https://your-resource.openai.azure.com"
  API_KEY: ""
  API_VERSION: "2024-02-15-preview"
  API_MODEL: "gpt-4o"
```

**Create the Verint AppAgent knowledge file (`config/ufo/verint_knowledge.yaml`):**
```yaml
app_name: Verint WFM Real-Time Adherence
description: >
  Verint WFM is a workforce management system. The Real-Time Adherence grid
  shows one row per agent. The grid has 6 columns:
  1. Status icon (coloured circle — ignore)
  2. Agent Name (text)
  3. Actual Status (Verint AUX code, e.g. "COAC - Coaching")
  4. Duration in current status (MM:SS format)
  5. Scheduled Activity (what the schedule says, e.g. "BLEN - Blended")
  6. Adherence percentage (e.g. "87.3%")
extraction_task: >
  Return a JSON array where each element represents one visible agent row.
  Fields: agent_name, actual_status, duration_mmss, scheduled_activity,
  adherence_pct (number or null). Return the JSON array only, no other text.
```

**Extractor implementation:**
```python
# harness/extractors/ufo2_extractor.py

import subprocess
import json
import logging
import os
from .base import ScreenExtractor

logger = logging.getLogger(__name__)


class UFO2Extractor:
    """
    Track A Option 1 — Microsoft UFO² Desktop AgentOS.

    UFO² uses the following detection order:
      1. Windows UI Automation (UIA) tree — fast, structured, no vision cost
      2. Screenshot + GPT-4V vision — fallback when UIA returns empty

    In Citrix seamless mode (Verint windows floating on Windows desktop),
    UIA typically succeeds and no screenshot is needed. In full-desktop mode
    (one large remote desktop window), UIA sees only the Citrix container and
    UFO² falls back to vision automatically.
    """

    def __init__(self, config: dict):
        self._knowledge_path = config.get(
            "ufo_knowledge_path", "config/ufo/verint_knowledge.yaml"
        )
        self._api_key = os.environ.get(config["model"]["api_key_env"], "")

    def extract_agent_rows(
        self,
        screenshot_path: str,
        lob_context: str,
        geo_context: str,
    ) -> list[dict]:
        task_request = (
            f"Read the Verint WFM Real-Time Adherence grid for LOB '{lob_context}' "
            f"({geo_context}). Return a JSON array of agent rows with fields: "
            f"agent_name, actual_status, duration_mmss, scheduled_activity, adherence_pct."
        )
        try:
            result = subprocess.run(
                [
                    "python", "-m", "ufo",
                    "--task", f"extract_{lob_context.lower().replace(' ', '_')}",
                    "-r", task_request,
                ],
                capture_output=True,
                text=True,
                timeout=30,
                env={**os.environ, "AZURE_OPENAI_KEY": self._api_key},
            )
            if result.returncode != 0:
                logger.warning("UFO² returned non-zero exit: %s", result.stderr)
                return []

            return _parse_json_response(result.stdout, lob_context)

        except subprocess.TimeoutExpired:
            logger.error("UFO² timed out for LOB %s", lob_context)
            return []
        except Exception as exc:
            logger.error("UFO² error: %s", exc)
            return []


def _parse_json_response(text: str, lob_context: str) -> list[dict]:
    """Extract a JSON array from a text response that may contain extra output."""
    import re
    # Find the first '[' ... ']' block in the response
    match = re.search(r"\[.*?\]", text, re.DOTALL)
    if not match:
        logger.warning("No JSON array found in UFO² response for LOB %s", lob_context)
        return []
    try:
        return json.loads(match.group())
    except json.JSONDecodeError as exc:
        logger.warning("JSON parse error in UFO² response: %s", exc)
        return []
```

#### Option 2 — Claude Computer Use

Claude Computer Use (GA since March 2026) accepts a screenshot as a base64
image and returns structured extraction results. It runs as a pure API call —
no local installation beyond `requests`.

```python
# harness/extractors/claude_cu_extractor.py

import base64
import json
import logging
import os
import re
import requests

logger = logging.getLogger(__name__)

_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
_TOOL_VERSION = "computer_use_20250124"
_MODEL = "claude-opus-4-5"          # or "claude-sonnet-4-5" for lower cost


class ClaudeComputerUseExtractor:
    """
    Track A Option 2 — Anthropic Claude Computer Use API.

    Sends the screenshot as a base64 image with the extraction prompt.
    Claude reads the screen and returns a JSON array of agent rows.

    Can be routed through FuelIX if the Anthropic endpoint is available there.
    """

    def __init__(self, config: dict):
        self._api_key = os.environ.get(config["model"]["api_key_env"], "")
        self._base_url = os.environ.get("ANTHROPIC_BASE_URL", _ANTHROPIC_URL)

    def extract_agent_rows(
        self,
        screenshot_path: str,
        lob_context: str,
        geo_context: str,
    ) -> list[dict]:
        try:
            with open(screenshot_path, "rb") as f:
                image_b64 = base64.standard_b64encode(f.read()).decode("utf-8")

            prompt = _build_extraction_prompt(lob_context, geo_context)

            payload = {
                "model": _MODEL,
                "max_tokens": 2048,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": image_b64,
                                },
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
            }

            response = requests.post(
                self._base_url,
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=payload,
                timeout=30,
            )
            response.raise_for_status()
            text = response.json()["content"][0]["text"]
            return _parse_json_response(text, lob_context)

        except Exception as exc:
            logger.error("Claude CU extraction failed for LOB %s: %s", lob_context, exc)
            return []


def _parse_json_response(text: str, lob_context: str) -> list[dict]:
    match = re.search(r"\[.*?\]", text, re.DOTALL)
    if not match:
        logger.warning("No JSON array in Claude CU response for LOB %s", lob_context)
        return []
    try:
        return json.loads(match.group())
    except json.JSONDecodeError as exc:
        logger.warning("JSON parse error: %s", exc)
        return []
```

#### Option 3 — OpenAI Computer Use Agent (CUA)

OpenAI CUA uses `gpt-4o` via the `/v1/responses` endpoint. This endpoint is
OpenAI-compatible and can be routed through FuelIX using the same client
already wired in `src/services/fuelixClient.ts`.

```python
# harness/extractors/openai_cua_extractor.py

import base64
import json
import logging
import os
import re
import requests

logger = logging.getLogger(__name__)


class OpenAICUAExtractor:
    """
    Track A Option 3 — OpenAI GPT-4o vision via /v1/chat/completions.

    Uses the same OpenAI-compatible API format as the FuelIX client.
    Set base_url to the FuelIX endpoint to route through Telus infrastructure.
    """

    def __init__(self, config: dict):
        model_cfg = config["model"]
        self._api_key = os.environ.get(model_cfg["api_key_env"], "")
        self._base_url = os.environ.get(
            model_cfg.get("base_url_env", "FUELIX_BASE_URL"),
            "https://api.openai.com/v1",
        )
        self._model = model_cfg.get("deployment", "gpt-4o")

    def extract_agent_rows(
        self,
        screenshot_path: str,
        lob_context: str,
        geo_context: str,
    ) -> list[dict]:
        try:
            with open(screenshot_path, "rb") as f:
                image_b64 = base64.standard_b64encode(f.read()).decode("utf-8")

            prompt = _build_extraction_prompt(lob_context, geo_context)

            payload = {
                "model": self._model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
                "max_tokens": 2048,
                "temperature": 0,
            }

            response = requests.post(
                f"{self._base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=30,
            )
            response.raise_for_status()
            text = response.json()["choices"][0]["message"]["content"]
            return _parse_json_response(text, lob_context)

        except Exception as exc:
            logger.error("OpenAI CUA extraction failed for LOB %s: %s", lob_context, exc)
            return []


def _parse_json_response(text: str, lob_context: str) -> list[dict]:
    match = re.search(r"\[.*?\]", text, re.DOTALL)
    if not match:
        return []
    try:
        return json.loads(match.group())
    except json.JSONDecodeError:
        return []
```

#### Option 4 — Azure Computer Vision (lightweight fallback)

When an LLM API is unavailable or for cost reduction after confidence has been
validated, Azure Computer Vision Layout Analysis provides deterministic
bounding-box OCR. This is the closest equivalent to the OCR baseline tested
in `POC/05_results/ocr_baseline/`.

```python
# harness/extractors/azure_vision_extractor.py

import base64
import json
import logging
import os
import re
import requests
import time

logger = logging.getLogger(__name__)


class AzureVisionExtractor:
    """
    Track A Option 4 — Azure Computer Vision Document Intelligence.

    Uses the Layout Analysis endpoint which returns words with bounding boxes,
    enabling table row reconstruction (fixes the fragile plain-OCR approach
    documented in evidence_pack_findings.md).

    Performance notes from evidence pack baseline:
      - Status match:   8/8  (100%) — reliable
      - Name match:     6/8  (75%)  — reliable
      - Duration match: 6/8  (75%)  — reliable
      - LOB match:      0/8  (0%)   — always inject from config, never from OCR
    """

    def __init__(self, config: dict):
        self._endpoint = os.environ.get("AZURE_CV_ENDPOINT", "")
        self._key = os.environ.get("AZURE_CV_KEY", "")

    def extract_agent_rows(
        self,
        screenshot_path: str,
        lob_context: str,
        geo_context: str,
    ) -> list[dict]:
        try:
            with open(screenshot_path, "rb") as f:
                image_bytes = f.read()

            # Submit analysis request
            analyze_url = (
                f"{self._endpoint}/computervision/documentintelligence"
                f"/documentModels/prebuilt-layout:analyze?api-version=2024-02-29-preview"
            )
            submit_resp = requests.post(
                analyze_url,
                headers={
                    "Ocp-Apim-Subscription-Key": self._key,
                    "Content-Type": "image/png",
                },
                data=image_bytes,
                timeout=10,
            )
            submit_resp.raise_for_status()
            operation_url = submit_resp.headers["Operation-Location"]

            # Poll for result
            for _ in range(20):
                time.sleep(2)
                poll_resp = requests.get(
                    operation_url,
                    headers={"Ocp-Apim-Subscription-Key": self._key},
                    timeout=10,
                )
                poll_resp.raise_for_status()
                result = poll_resp.json()
                if result["status"] == "succeeded":
                    return _parse_layout_result(result, lob_context)
                if result["status"] == "failed":
                    logger.error("Azure CV analysis failed for LOB %s", lob_context)
                    return []

            logger.warning("Azure CV timed out for LOB %s", lob_context)
            return []

        except Exception as exc:
            logger.error("Azure Vision extraction error: %s", exc)
            return []


def _parse_layout_result(result: dict, lob_context: str) -> list[dict]:
    """
    Parse the Azure Layout Analysis bounding-box output into agent row dicts.
    Uses table detection if available; falls back to line-by-line heuristics.
    """
    rows = []
    try:
        # Prefer table structures (Azure DI detects Verint grid as a table)
        for page in result.get("analyzeResult", {}).get("pages", []):
            for table in result.get("analyzeResult", {}).get("tables", []):
                row_data = _extract_table_rows(table)
                rows.extend(row_data)
    except Exception as exc:
        logger.warning("Table parsing failed, using line fallback: %s", exc)
    return rows


def _extract_table_rows(table: dict) -> list[dict]:
    """
    Map Azure table cells to agent row dicts.
    Column order: [icon, name, status, duration, scheduled_activity, adherence_pct]
    """
    # Group cells by row index
    from collections import defaultdict
    cells_by_row: dict[int, dict[int, str]] = defaultdict(dict)
    for cell in table.get("cells", []):
        row_idx = cell["rowIndex"]
        col_idx = cell["columnIndex"]
        cells_by_row[row_idx][col_idx] = cell.get("content", "").strip()

    rows = []
    for row_idx, cols in sorted(cells_by_row.items()):
        if row_idx == 0:
            continue  # Skip header row
        row = {
            "agent_name": cols.get(1, ""),
            "actual_status": cols.get(2, ""),
            "duration_mmss": cols.get(3, ""),
            "scheduled_activity": cols.get(4, ""),
            "adherence_pct": _parse_pct(cols.get(5, "")),
        }
        if row["agent_name"] and row["actual_status"]:
            rows.append(row)
    return rows


def _parse_pct(raw: str) -> float | None:
    try:
        return float(raw.replace("%", "").strip())
    except ValueError:
        return None
```

### 3.4 The extraction prompt (production version)

This prompt is used by Options 2 and 3 (Claude CU and OpenAI CUA). It is
grounded in the exact Verint column structure observed during the April 28
shadowing session at CIBC Guatemala.

```python
# harness/extractors/_shared.py

def _build_extraction_prompt(lob_context: str, geo_context: str) -> str:
    return f"""You are reading a screenshot of the Verint WFM Real-Time Adherence grid.

The grid shows one row per agent. The columns, from left to right, are:
  Column 1: Status icon (coloured circle — ignore this column entirely)
  Column 2: Agent Name (full name as text, e.g. "Diego Salazar")
  Column 3: Actual Status (Verint AUX code, e.g. "COAC - Coaching", "INBD - Inbound")
  Column 4: Duration in current status (MM:SS format, e.g. "32:14" or "09:32")
  Column 5: Scheduled Activity (what the schedule says, e.g. "BLEN - Blended")
  Column 6: Adherence percentage (e.g. "87.3%" — may be absent in some views)

Context for this screenshot:
  Line of Business (LOB): {lob_context}
  Geography: {geo_context}

Instructions:
  - Read every visible agent row in the grid.
  - Do NOT include header rows.
  - Do NOT include rows where the agent name cell is empty.
  - If a column value is not visible, use null for numbers and an empty string for text.

Return ONLY a JSON array. No explanation, no markdown fences, no extra text.
Each element must have exactly these keys:
  "agent_name": string (exact text from column 2)
  "actual_status": string (exact text from column 3)
  "duration_mmss": string (MM:SS format from column 4, e.g. "32:14")
  "scheduled_activity": string (exact text from column 5, or "" if not visible)
  "adherence_pct": number or null (numeric value from column 6, strip the % sign)

Example output:
[
  {{"agent_name": "Diego Salazar", "actual_status": "COAC - Coaching", "duration_mmss": "32:14", "scheduled_activity": "BLEN - Blended", "adherence_pct": 72.0}},
  {{"agent_name": "Gabriela Luna", "actual_status": "INBD - Inbound", "duration_mmss": "11:23", "scheduled_activity": "BLEN - Blended", "adherence_pct": 71.0}}
]"""
```

### 3.5 Normalisation — raw dicts → AgentRow

```python
# harness/normaliser.py

"""
normaliser.py
-------------
Converts raw extraction dicts (from any ScreenExtractor implementation)
into AgentRow objects that the Intelligence Service can evaluate.

Responsibilities:
  - Duration string (MM:SS) → integer seconds
  - LOB injection from tab context (never from OCR)
  - agent_id generation (deterministic hash)
  - AUX code normalisation (abbreviation → full label)
  - Exception card creation for unparseable rows
  - Audit log entry per row processed
"""

from __future__ import annotations

import hashlib
import json
import logging
import sys
from pathlib import Path
from typing import TYPE_CHECKING

logger = logging.getLogger(__name__)

# Import AgentRow from the existing simulation engine
_ENGINE_PATH = Path(__file__).parent.parent.parent / "POC" / "07_simulation"
sys.path.insert(0, str(_ENGINE_PATH))
from engine.alert_engine import AgentRow


def load_aux_definitions(rules_path: str) -> dict[str, str]:
    """
    Load aux_definitions.json and build an abbreviation → full label map.
    Used to normalise partial Verint status codes before rule evaluation.
    e.g. "COAC" → "COAC - Coaching"
    """
    path = Path(rules_path).parent / "aux_definitions.json"
    if not path.exists():
        logger.warning("aux_definitions.json not found at %s — skipping normalisation", path)
        return {}
    with open(path) as f:
        data = json.load(f)
    # Build lookup: abbrev → full_label (e.g. "COAC" → "COAC - Coaching")
    mapping = {}
    for entry in data if isinstance(data, list) else data.get("statuses", []):
        label = entry.get("label", "")
        abbrev = label.split(" - ")[0].strip() if " - " in label else label.strip()
        if abbrev:
            mapping[abbrev.upper()] = label
    return mapping


def mmss_to_seconds(mmss: str) -> int:
    """
    Convert "MM:SS" duration string to integer seconds.

    Handles:
      "32:14" → 1934
      "9:32"  → 572
      "0:45"  → 45
      ""      → 0
      garbage → 0 (logged as warning)
    """
    if not mmss or not isinstance(mmss, str):
        return 0
    parts = mmss.strip().split(":")
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        if len(parts) == 3:
            # HH:MM:SS format (rare but possible for very long statuses)
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except ValueError:
        logger.warning("Could not parse duration '%s' — defaulting to 0", mmss)
    return 0


def make_agent_id(agent_name: str, lob: str, geo: str) -> str:
    """
    Generate a deterministic, stable agent ID from identity fields.
    Same agent always gets the same ID across shifts and cycles.
    """
    raw = f"{agent_name.strip().lower()}:{lob.strip().lower()}:{geo.strip().lower()}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def normalise_status(raw_status: str, aux_map: dict[str, str]) -> str:
    """
    Normalise a Verint status code to the full label expected by alert_thresholds.json.
    e.g. "COAC" → "COAC - Coaching"
    If the raw status already matches a full label or is unknown, return as-is.
    """
    if not raw_status:
        return ""
    stripped = raw_status.strip()
    # Already a full label
    if " - " in stripped:
        return stripped
    # Try abbreviation lookup
    upper = stripped.upper()
    if upper in aux_map:
        return aux_map[upper]
    return stripped


def raw_rows_to_agent_rows(
    raw_rows: list[dict],
    lob: str,
    geo: str,
    aux_map: dict[str, str],
) -> tuple[list[AgentRow], list[dict]]:
    """
    Convert a list of raw extraction dicts into AgentRow objects.

    Returns:
      agent_rows: successfully normalised rows, ready for evaluate_agents()
      exception_cards: CommandCard dicts for rows that could not be normalised
    """
    agent_rows: list[AgentRow] = []
    exception_cards: list[dict] = []

    for raw in raw_rows:
        agent_name = raw.get("agent_name", "").strip()
        actual_status_raw = raw.get("actual_status", "").strip()
        duration_mmss = raw.get("duration_mmss", "")
        scheduled_activity = raw.get("scheduled_activity", "").strip() or "Unknown"
        adherence_raw = raw.get("adherence_pct")

        # Validate required fields
        if not agent_name:
            exception_cards.append(
                build_exception_card(raw, "agent_name is missing", lob, geo)
            )
            continue
        if not actual_status_raw:
            exception_cards.append(
                build_exception_card(raw, "actual_status is missing", lob, geo)
            )
            continue

        actual_status = normalise_status(actual_status_raw, aux_map)
        duration_seconds = mmss_to_seconds(duration_mmss)

        try:
            adherence_pct = float(adherence_raw) if adherence_raw is not None else 100.0
        except (TypeError, ValueError):
            adherence_pct = 100.0
            logger.warning("Could not parse adherence_pct '%s' for %s — defaulting to 100.0", adherence_raw, agent_name)

        agent_rows.append(
            AgentRow(
                agent_id=make_agent_id(agent_name, lob, geo),
                agent_name=agent_name,
                lob=lob,
                geo=geo,
                actual_status=actual_status,
                scheduled_activity=scheduled_activity,
                duration_seconds=duration_seconds,
                adherence_pct=adherence_pct,
            )
        )

    return agent_rows, exception_cards


def build_exception_card(raw_row: dict, reason: str, lob: str, geo: str) -> dict:
    """
    When a row cannot be normalised, return an exception CommandCard so the
    RTA can review it manually. Confidence is always 0.0 on exception cards.
    """
    import hashlib
    card_id = "exc-" + hashlib.md5(str(raw_row).encode()).hexdigest()[:8]
    return {
        "id": card_id,
        "lane": "real-time-adherence",
        "processId": "adherence",
        "type": "exception",
        "title": f"Parse failure — {lob}",
        "summary": f"Harness could not extract a complete agent row. Reason: {reason}. Raw data: {raw_row}",
        "owner": "ai",
        "status": "needs-review",
        "severity": "low",
        "dataClass": "simulated",
        "source": {
            "dataClass": "simulated",
            "label": "Harness exception",
            "detail": reason,
        },
        "confidence": 0.0,
        "lob": lob,
        "geo": geo,
        "recommendedAction": "Review the capture log. Suppress if the agent row is a header or blank.",
        "availableActions": ["suppress", "mark-resolved"],
        "targetChannels": ["audit-only"],
        "auditEvents": [],
    }
```

---

## Section 4 — Track B: Verint REST API

Track B is the permanent production target. It eliminates screen capture,
OCR, and the LOB classification problem entirely by reading Verint data
directly from the API.

### 4.1 Prerequisite: obtain API credentials

Request the following from CIBC IT (contact: the team responsible for the
Verint WFM instance at the Guatemala site — confirm whether CIBC or Telus
owns this instance):

- **Read-only** API credential (client ID + secret, or API key)
- The Verint WFM base URL (e.g. `https://verint.internal.cibc.com`)
- Confirmation of Verint version (WFM 15.x or Workforce Engagement/WE)
- Whether the schedule integration is active (determines if `scheduledActivity` is available)

**No write access is requested or needed.** The harness only reads adherence
and status data.

### 4.2 Endpoint reference

Verint exposes real-time adherence data via two possible endpoint structures,
depending on version:

| Verint version | Endpoint | Auth method |
|---|---|---|
| WFM 15.x | `GET /api/v1/realtime/adherence` | OAuth 2.0 client credentials (`/oauth/token`) |
| Workforce Engagement (WE) | `GET /wfm/api/v2/adherence/realtime` | OAuth 2.0 or API key header |
| WEM Cloud | `GET /wem/v1/realtime-adherence` | API key header |

Test with curl first (replace with your actual base URL and token):
```bash
# Step 1: get OAuth token (WFM 15.x / WE)
curl -X POST https://verint.internal.cibc.com/oauth/token \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"

# Step 2: query adherence data
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://verint.internal.cibc.com/api/v1/realtime/adherence?groupId=CIBC_GT"
```

### 4.3 Field mapping to AgentRow

Verint field names vary by version and client configuration. The table below
covers the most common variants. **Verify against the actual API response**
from your Postman or curl test before writing the mapping.

| AgentRow field | WFM 15.x API field | WE API field | Notes |
|---|---|---|---|
| `agent_id` | `agentId` or `employeeId` | `agentKey` | Use as-is; stable across shifts |
| `agent_name` | `agentName` or `displayName` | `agentDisplayName` | Trim whitespace |
| `lob` | `groupName` or `teamName` | `organizationalUnitName` | **Available natively — no injection needed** |
| `geo` | Not in API | Not in API | Inject from `harness_config.json → geo` |
| `actual_status` | `currentActivityCode` | `realTimeStatusCode` | May be abbreviated; normalise via `aux_definitions.json` |
| `scheduled_activity` | `scheduledActivityCode` | `scheduleActivityCode` | Only present if schedule integration is active |
| `duration_seconds` | `durationInCurrentActivity` (seconds) | `currentStateDurationSeconds` | Already in seconds — no conversion needed |
| `adherence_pct` | `adherencePercent` (float) | `scheduleAdherencePercentage` | Already a float |

### 4.4 REST adapter implementation

```python
# harness/adapters/verint_rest_adapter.py

"""
VerintRESTAdapter — Track B implementation.
Calls the Verint WFM REST API to produce List[AgentRow].
No screen capture. No OCR. No vision model.
"""

import json
import logging
import os
import sys
import time
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

_ENGINE_PATH = Path(__file__).parent.parent.parent / "POC" / "07_simulation"
sys.path.insert(0, str(_ENGINE_PATH))
from engine.alert_engine import AgentRow

from ..normaliser import make_agent_id, normalise_status


class VerintRESTAdapter:
    """
    Track B — reads agent adherence data directly from the Verint REST API.

    Authentication: OAuth 2.0 client credentials flow.
    Token is cached and refreshed automatically when it expires.
    """

    def __init__(self, config: dict):
        self._base_url = os.environ.get("VERINT_API_URL", "").rstrip("/")
        self._client_id = os.environ.get("VERINT_CLIENT_ID", "")
        self._client_secret = os.environ.get("VERINT_CLIENT_SECRET", "")
        self._geo = config["geo"]
        self._token: str | None = None
        self._token_expiry: float = 0.0
        self._field_map = config.get("verint_field_map", _DEFAULT_FIELD_MAP)
        self._session = _build_retry_session()

    # ── Public interface (matches VerintAdapter protocol) ─────────────────

    def get_agent_rows(self, lob: str, geo: str) -> list[AgentRow]:
        """Fetch all agents for a given LOB and convert to AgentRow objects."""
        token = self._get_token()
        if not token:
            logger.error("Cannot fetch data — token acquisition failed.")
            return []

        url = f"{self._base_url}{self._field_map['adherence_endpoint']}"
        params = {self._field_map["lob_filter_param"]: lob}

        try:
            resp = self._session.get(
                url,
                headers={"Authorization": f"Bearer {token}"},
                params=params,
                timeout=15,
            )
            resp.raise_for_status()
            agents_raw = resp.json()
            if isinstance(agents_raw, dict):
                # Some versions wrap the list in a key
                agents_raw = agents_raw.get("agents", agents_raw.get("data", []))
            return [self._map_to_agent_row(a, lob, geo) for a in agents_raw]

        except requests.HTTPError as exc:
            logger.error("Verint API HTTP error for LOB %s: %s", lob, exc)
            return []
        except Exception as exc:
            logger.error("Verint API unexpected error for LOB %s: %s", lob, exc)
            return []

    # ── Token management ──────────────────────────────────────────────────

    def _get_token(self) -> str | None:
        if self._token and time.time() < self._token_expiry - 60:
            return self._token
        return self._refresh_token()

    def _refresh_token(self) -> str | None:
        try:
            resp = self._session.post(
                f"{self._base_url}/oauth/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                },
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            self._token = data["access_token"]
            self._token_expiry = time.time() + data.get("expires_in", 3600)
            logger.info("Verint API token refreshed. Expires in %ds.", data.get("expires_in", 3600))
            return self._token
        except Exception as exc:
            logger.error("Token refresh failed: %s", exc)
            return None

    # ── Field mapping ─────────────────────────────────────────────────────

    def _map_to_agent_row(self, raw: dict, lob: str, geo: str) -> AgentRow:
        fm = self._field_map
        agent_id = str(raw.get(fm["agent_id"], ""))
        agent_name = raw.get(fm["agent_name"], "").strip()
        lob_from_api = raw.get(fm["lob_field"], lob)  # Prefer API value; fallback to config
        actual_status_raw = raw.get(fm["actual_status"], "")
        scheduled_activity = raw.get(fm["scheduled_activity"], "Unknown") or "Unknown"
        duration_raw = raw.get(fm["duration_seconds"], 0)
        adherence_raw = raw.get(fm["adherence_pct"], 100.0)

        # Duration: most APIs return seconds, but some return milliseconds
        duration_seconds = int(duration_raw)
        if fm.get("duration_unit") == "milliseconds":
            duration_seconds = duration_seconds // 1000

        return AgentRow(
            agent_id=agent_id or make_agent_id(agent_name, lob_from_api, geo),
            agent_name=agent_name,
            lob=lob_from_api,
            geo=geo,
            actual_status=normalise_status(actual_status_raw, {}),
            scheduled_activity=scheduled_activity,
            duration_seconds=duration_seconds,
            adherence_pct=float(adherence_raw),
        )


# Default field map — Verint WFM 15.x naming
_DEFAULT_FIELD_MAP = {
    "adherence_endpoint": "/api/v1/realtime/adherence",
    "lob_filter_param": "groupName",
    "agent_id": "agentId",
    "agent_name": "agentName",
    "lob_field": "groupName",
    "actual_status": "currentActivityCode",
    "scheduled_activity": "scheduledActivityCode",
    "duration_seconds": "durationInCurrentActivity",
    "adherence_pct": "adherencePercent",
    "duration_unit": "seconds",
}

# Workforce Engagement (WE) field map
WE_FIELD_MAP = {
    "adherence_endpoint": "/wfm/api/v2/adherence/realtime",
    "lob_filter_param": "organizationalUnit",
    "agent_id": "agentKey",
    "agent_name": "agentDisplayName",
    "lob_field": "organizationalUnitName",
    "actual_status": "realTimeStatusCode",
    "scheduled_activity": "scheduleActivityCode",
    "duration_seconds": "currentStateDurationSeconds",
    "adherence_pct": "scheduleAdherencePercentage",
    "duration_unit": "seconds",
}


def _build_retry_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    return session
```

### 4.5 Polling vs. webhook

**Polling (default — implement first):**
```python
# Every 30 seconds: call API, compare against previous snapshot
# Emit only rows that changed since last poll
# Use persistence_map to track repeat violations across 15-min cycles
```

**Webhook (preferred once Verint API access is stable):**
- Verint WE supports event webhooks: `POST /wem/v1/webhooks/register`
- Register your endpoint URL; Verint pushes `adherence_change` events in real time
- No polling needed; harness subscribes once and processes events as they arrive
- Requires an HTTPS endpoint accessible from the Verint server network

Configure which mode to use in `harness_config.json`:
```json
{
  "track_b": {
    "mode": "polling",
    "polling_interval_seconds": 30,
    "webhook_endpoint": null
  }
}
```

---

## Section 5 — The Adapter Abstraction

### 5.1 Why abstraction matters

The adapter abstraction is what enables "no code changes per account" and
"no code changes per LLM provider". Every account gets a config file; the
registry instantiates the correct adapter at runtime.

### 5.2 VerintAdapter protocol

```python
# harness/adapters/base.py

from typing import Protocol, runtime_checkable
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "POC" / "07_simulation"))
from engine.alert_engine import AgentRow


@runtime_checkable
class VerintAdapter(Protocol):
    """
    The single interface between the harness and the Intelligence Service.

    All Track A and Track B implementations must satisfy this protocol.
    The daemon calls only get_agent_rows(); everything else is internal.
    """

    def get_agent_rows(self, lob: str, geo: str) -> list[AgentRow]:
        """
        Return all agent rows for a given LOB and geography.

        Parameters
        ----------
        lob:
            Line of Business name (e.g. "TLB", "Costco").
            Must match a value in harness_config.json → lob_tab_order.
        geo:
            Geography ("Guatemala" or "Philippines").

        Returns
        -------
        List of AgentRow objects ready for evaluate_agents().
        An empty list on failure — never raises.
        """
        ...
```

### 5.3 LLM provider protocol

```python
# harness/providers/base.py

from typing import Protocol, runtime_checkable


@runtime_checkable
class LLMProvider(Protocol):
    """
    Abstraction for all LLM vision providers used in Track A.
    Implementations: AzureOpenAIProvider, FuelIXProvider,
                     AnthropicProvider, OpenAIProvider.
    """

    def extract_grid(self, image_b64: str, prompt: str) -> str:
        """
        Send a base64-encoded screenshot and extraction prompt to the LLM.

        Returns the raw text response (JSON array string expected).
        On failure, returns an empty string — never raises.
        """
        ...
```

### 5.4 Adapter registry

```python
# harness/registry.py

"""
registry.py
-----------
Factory that instantiates the correct VerintAdapter based on harness_config.json.
Adding a new adapter = adding one entry to ADAPTER_MAP. No other changes.
"""

import logging
from .adapters.base import VerintAdapter

logger = logging.getLogger(__name__)


def build_adapter(config: dict) -> VerintAdapter:
    """
    Instantiate and return the VerintAdapter specified in config["adapter"].

    Supported values:
      "ufo2"         — Track A via Microsoft UFO² (Windows-native)
      "claude_cu"    — Track A via Claude Computer Use
      "openai_cua"   — Track A via OpenAI CUA
      "azure_vision" — Track A via Azure Computer Vision (lightweight fallback)
      "verint_api"   — Track B via Verint REST API

    To add a new adapter:
      1. Create harness/adapters/my_adapter.py with a class implementing VerintAdapter
      2. Add "my_adapter": MyAdapter to ADAPTER_MAP below
      3. Update harness_config.json → "adapter": "my_adapter"
    """
    from .adapters.track_a_ufo2 import UFO2Adapter
    from .adapters.track_a_claude_cu import ClaudeCUAdapter
    from .adapters.track_a_openai_cua import OpenAICUAAdapter
    from .adapters.track_a_azure_vision import AzureVisionAdapter
    from .adapters.track_b_verint_rest import VerintRESTAdapter

    ADAPTER_MAP = {
        "ufo2": UFO2Adapter,
        "claude_cu": ClaudeCUAdapter,
        "openai_cua": OpenAICUAAdapter,
        "azure_vision": AzureVisionAdapter,
        "verint_api": VerintRESTAdapter,
    }

    adapter_key = config.get("adapter", "ufo2")
    if adapter_key not in ADAPTER_MAP:
        raise ValueError(
            f"Unknown adapter '{adapter_key}'. "
            f"Valid options: {list(ADAPTER_MAP.keys())}"
        )

    cls = ADAPTER_MAP[adapter_key]
    instance = cls(config)
    logger.info("Adapter instantiated: %s", cls.__name__)
    return instance
```

### 5.5 Configuration templates

**Template for a new Guatemala account:**
```json
{
  "_comment": "Template — copy and fill for each new account",
  "account": "ACCOUNT_NAME_HERE",
  "geo": "Guatemala",
  "adapter": "ufo2",
  "model": {
    "provider": "azure_openai",
    "endpoint_env": "AZURE_OPENAI_ENDPOINT",
    "api_key_env": "AZURE_OPENAI_KEY",
    "deployment": "gpt-4o"
  },
  "lobs": ["LOB_1", "LOB_2", "LOB_3"],
  "lob_tab_order": ["LOB_1", "LOB_2", "LOB_3"],
  "citrix": {
    "window_title_contains": "Verint",
    "process_name": "wfica32.exe",
    "tab_load_wait_seconds": 1.5,
    "full_desktop_mode": false
  },
  "cycle_interval_seconds": 900,
  "capture_interval_seconds": 30,
  "screenshot_retention_seconds": 60,
  "audit_log_path": "./logs/harness_audit.jsonl",
  "output_cards_path": "./output/harness_cards.json"
}
```

**Switching providers without code changes:**
```json
// From Azure OpenAI to FuelIX:
"model": {
  "provider": "openai_compatible",
  "base_url_env": "FUELIX_BASE_URL",
  "api_key_env": "FUELIX_API_KEY",
  "deployment": "gpt-4o"
}

// From Track A to Track B (once API credentials are available):
"adapter": "verint_api"

// From UFO² to Claude CU (e.g. if Citrix is in full-desktop mode):
"adapter": "claude_cu",
"model": {
  "provider": "anthropic",
  "api_key_env": "ANTHROPIC_API_KEY"
}
```

---

## Section 6 — Step-by-Step Build Sequence

Follow these steps in order. Each step has an expected output and a failure
checklist. Do not proceed to the next step until the current step passes.

### Step 1 — Install dependencies

```bash
cd harness/
pip install -r requirements.txt
```

**Expected output:** `Successfully installed mss-9.0.1 pywin32-306 ...`

**Failure:** If `pywin32` fails, run `pip install pywin32` separately, then
`python Scripts/pywin32_postinstall.py -install` from an Administrator prompt.

---

### Step 2 — Create harness_config.json

```bash
cp config/harness_config.template.json config/harness_config.json
# Edit with your account details (LOBs, geo, adapter choice)
```

**Expected output:** File created. Running `python -c "import json; json.load(open('config/harness_config.json'))"` exits without error.

**Failure:** JSON parse error → fix quoting. Missing required field → add it per Section 1.4.

---

### Step 3 — Screen capture smoke test

```bash
python tests/step3_screen_capture_test.py
```

```python
# tests/step3_screen_capture_test.py

import json, sys, time
sys.path.insert(0, ".")
from harness.config import load_config
from harness.capture.window_finder import find_citrix_window
from harness.capture.screen_capture import capture_window, delete_transient_capture

config = load_config("config/harness_config.json")
hwnd = find_citrix_window(config)
assert hwnd is not None, "ERROR: Citrix window not found. Is Verint visible on screen?"
print(f"[OK] Citrix window found. HWND={hwnd}")

path = capture_window(hwnd)
assert path is not None, "ERROR: Screenshot capture failed."
print(f"[OK] Screenshot captured: {path}")
print("     Open this file to verify the Verint grid is visible.")
input("     Press Enter to delete the screenshot and continue...")
delete_transient_capture(path)
print("[OK] Screenshot deleted (transient frame policy enforced).")
```

**Expected output:**
```
[OK] Citrix window found. HWND=1234567
[OK] Screenshot captured: C:\Users\...\harness_capture_20260519_140000.png
     Open this file to verify the Verint grid is visible.
     Press Enter to delete the screenshot and continue...
[OK] Screenshot deleted (transient frame policy enforced).
```

**Failure checklist:**
- `Citrix window not found` → verify Citrix Receiver is open and Verint is on screen; check `window_title_contains` value in config
- Screenshot shows black / empty → Citrix may be in hardware-accelerated mode; in Citrix Workspace settings, disable GPU acceleration
- Screenshot shows only the Citrix toolbar → `full_desktop_mode` may need to be set to `true`

---

### Step 4 — Extraction smoke test

```bash
python tests/step4_extraction_test.py
```

This test sends the captured screenshot to the configured extraction engine
and prints the raw JSON response. You must have Step 3 passing first.

**Expected output:**
```json
[OK] Extraction engine: UFO2Extractor
[OK] Raw response (2 rows):
[
  {"agent_name": "Diego Salazar", "actual_status": "COAC - Coaching", "duration_mmss": "32:14", "scheduled_activity": "BLEN - Blended", "adherence_pct": 72.0},
  {"agent_name": "Gabriela Luna", "actual_status": "INBD - Inbound", "duration_mmss": "11:23", "scheduled_activity": "BLEN - Blended", "adherence_pct": 71.0}
]
```

**Failure checklist:**
- Empty response (`[]`) → model did not see the grid; verify screenshot quality in Step 3; try `azure_vision` adapter as a diagnostic
- JSON parse error → extraction prompt returned non-JSON; check prompt in Section 3.4; increase `max_tokens`
- `actual_status` values are abbreviated (e.g. `"COAC"` instead of `"COAC - Coaching"`) → OK, normaliser handles this in Step 5

---

### Step 5 — Normalisation smoke test

```bash
python tests/step5_normalisation_test.py
```

**Expected output:**
```
[OK] AgentRow(agent_id='3f1a8c2b4e6d', agent_name='Diego Salazar', lob='TLB',
              geo='Guatemala', actual_status='COAC - Coaching',
              scheduled_activity='BLEN - Blended', duration_seconds=1934,
              adherence_pct=72.0)
[OK] LOB 'TLB' injected from config (not from OCR).
[OK] Duration '32:14' → 1934 seconds.
[OK] 0 exception cards generated.
```

**Failure checklist:**
- `actual_status` not matching rules → check `aux_definitions.json` mapping; add missing abbreviation if needed
- `lob` is empty or wrong → verify `lob_tab_order` in config and that tab navigation is working

---

### Step 6 — Rules integration test

```bash
python tests/step6_rules_integration_test.py
```

This test feeds the normalised `AgentRow` list into the existing `evaluate_agents()`
function and verifies that alert results match expectations.

```python
# tests/step6_rules_integration_test.py

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "POC" / "07_simulation"))

from engine.alert_engine import load_thresholds, evaluate_agents, AgentRow

# Use the same test rows from sim_snapshot_t0.json (ground truth)
test_rows = [
    AgentRow(
        agent_id="GT-TLB-003", agent_name="Diego Salazar",
        lob="TLB", geo="Guatemala",
        actual_status="COAC - Coaching", scheduled_activity="BLEN - Blended",
        duration_seconds=1920, adherence_pct=72.0,
    ),
    AgentRow(
        agent_id="GT-TLB-001", agent_name="Gabriela Luna",
        lob="TLB", geo="Guatemala",
        actual_status="INBD - Inbound", scheduled_activity="BLEN - Blended",
        duration_seconds=683, adherence_pct=71.0,
    ),
]

thresholds = load_thresholds()
results = evaluate_agents(test_rows, thresholds)

assert len(results) == 2, f"Expected 2 alerts, got {len(results)}"
assert results[0].rule_type == "time_limit_exceeded"
assert results[0].severity in ("high", "critical")
print(f"[OK] {len(results)} alerts fired as expected.")
for r in results:
    print(f"     {r.agent.agent_name}: {r.rule_type} | severity={r.severity}")
```

**Expected output:**
```
[OK] 2 alerts fired as expected.
     Diego Salazar: time_limit_exceeded | severity=high
     Gabriela Luna: time_limit_exceeded | severity=medium
```

---

### Step 7 — Card builder integration test

```bash
python tests/step7_card_integration_test.py
```

This test passes `AlertResult` objects through `build_card()` and validates
the output matches the `CommandCard` TypeScript interface.

**Expected output:**
```
[OK] 2 CommandCards built.
     Card: sim-c1-GT-TLB-003-time_limit_coac___coaching
       type=alert, severity=high, status=needs-review, confidence=0.91
       draftMessage='TLB alert: Diego Salazar — COAC - Coaching 32:00 (scheduled: BLEN - Blended). Please check.'
     Card: sim-c1-GT-TLB-001-time_limit_inbd___inbound
       type=alert, severity=medium, status=needs-review, confidence=0.91
```

---

### Step 8 — End-to-end pipeline test (static screenshots)

This test runs the full pipeline against the 12 existing CIBC evidence pack
screenshots in `POC/01_evidence_pack/screenshots/raw/` and validates output
against the ground truth in `evidence_pack_findings.md`.

```bash
python tests/step8_e2e_static_test.py
```

**Expected output (pass criteria):**
```
Evidence pack static test results:
  Status match:   8/8   (100%) ✓
  Name match:     6/8   (75%)  ✓
  Duration match: 6/8   (75%)  ✓
  LOB match:     10/10  (100%) ✓  [injected from config]
  Exception cards: 0

ALL PASS — harness is ready for live Verint smoke test (Phase 3).
```

---

### Step 9 — Start the harness daemon

```bash
python -m harness.daemon --config config/harness_config.json
```

**Expected output:**
```
2026-05-19 14:00:00 [INFO] harness.daemon — Harness started. Account: cibc_guatemala | Adapter: UFO2Adapter | LOBs: ['Cards', 'Costco', ...]
2026-05-19 14:00:01 [INFO] harness.daemon — LOB Cards: 18 rows extracted.
2026-05-19 14:00:03 [INFO] harness.daemon — LOB Costco: 22 rows extracted.
...
2026-05-19 14:07:43 [INFO] harness.daemon — Cycle complete. 142 total rows. Next cycle in 132s.
2026-05-19 14:07:43 [INFO] harness.daemon — Emitted 7 cards → ./output/harness_cards.json
```

---

### Step 10 — Verify cards appear in the Command Center

```bash
# In a separate terminal — start the Command Center
cd POC_Redefined/command-center
npm run dev
```

In `src/hooks/useLiveEngine.ts`, temporarily override the fixture source to
load from `./output/harness_cards.json` instead of the simulation scenarios.
Cards from live Verint data will appear in the Priority Feed exactly as they
do in the demo.

---

## Section 7 — Testing Protocol

The five-phase testing protocol maps to the release gates defined in
`FDAE_Program_Response_Derek_Erin.md` (Section 4c).

### Phase 1 — Unit tests (mocked I/O)

**Run:** `pytest tests/unit/ -v`

Test files:

| File | What it tests |
|---|---|
| `test_normaliser.py` | `mmss_to_seconds()`, `normalise_status()`, `make_agent_id()`, null adherence handling |
| `test_extraction_parse.py` | JSON array parsing from all 4 engine response formats |
| `test_rules.py` | `evaluate_agents()` against `sim_snapshot_t0.json` and `sim_snapshot_t15.json` |
| `test_card_builder.py` | `build_card()` output fields match `CommandCard` TypeScript interface |
| `test_registry.py` | `build_adapter()` instantiates correct class for each adapter key |

**Pass criterion:** All unit tests green (0 failures, 0 errors).

Key assertions for `test_normaliser.py`:
```python
def test_mmss_to_seconds():
    assert mmss_to_seconds("32:14") == 1934
    assert mmss_to_seconds("09:32") == 572
    assert mmss_to_seconds("0:45")  == 45
    assert mmss_to_seconds("")      == 0
    assert mmss_to_seconds("garbage") == 0

def test_lob_always_from_config_not_ocr():
    # Simulate an extraction that returned wrong LOB
    raw = [{"agent_name": "Alice", "actual_status": "COAC - Coaching",
            "duration_mmss": "31:00", "scheduled_activity": "BLEN - Blended",
            "adherence_pct": 80.0}]
    rows, _ = raw_rows_to_agent_rows(raw, lob="TLB", geo="Guatemala", aux_map={})
    assert rows[0].lob == "TLB"  # NOT from raw — always from function argument

def test_exception_card_on_missing_name():
    raw = [{"agent_name": "", "actual_status": "COAC - Coaching",
            "duration_mmss": "30:00", "scheduled_activity": "BLEN - Blended",
            "adherence_pct": None}]
    rows, exc_cards = raw_rows_to_agent_rows(raw, lob="TLB", geo="Guatemala", aux_map={})
    assert len(rows) == 0
    assert len(exc_cards) == 1
    assert exc_cards[0]["type"] == "exception"
    assert exc_cards[0]["confidence"] == 0.0
```

---

### Phase 2 — Static screenshot test (CIBC evidence pack)

**Run:** `python tests/step8_e2e_static_test.py`

Uses the 12 real Verint screenshots from `POC/01_evidence_pack/screenshots/raw/`
collected during the April 28 shadowing session.

**Pass criteria:**

| Metric | Target | Notes |
|---|---|---|
| Status match | ≥ 8/8 (100%) | Evidence pack baseline was already 8/8 |
| Name match | ≥ 6/8 (75%) | Evidence pack baseline was 6/8 |
| Duration match | ≥ 6/8 (75%) | Evidence pack baseline was 6/8 |
| LOB match | 10/10 (100%) | Injected from config — the 0/8 OCR failure is eliminated |
| Exception cards | ≤ 2 | Acceptable for headers / blank rows |

**Important:** The LOB match target is 10/10 because LOB is now injected from
`harness_config.json → lob_tab_order`, not extracted from the screenshot. The
0/8 OCR failure documented in `evidence_pack_findings.md` is architecturally
resolved, not improved.

---

### Phase 3 — Live Verint smoke test (shadowing session)

**When:** During the next scheduled RTA access window or shadowing session.

**Procedure:**
1. Start the harness daemon on the RTA's machine: `python -m harness.daemon --config config/harness_config.json`
2. Let it run for one full 15-minute cycle (all LOBs)
3. Compare the extracted AgentRow list against what the RTA sees in Verint
4. Check the audit log: `cat logs/harness_audit.jsonl | python -m json.tool`

**Pass criterion:** 10 consecutive captures (one per LOB tab) with no crashes,
no empty responses, and agent rows that visually match what the RTA sees.

**Failure investigation:**
```bash
# Check the last 20 audit log entries
tail -n 20 logs/harness_audit.jsonl | python -m json.tool

# Check for exception cards (empty agent_name, missing fields)
cat output/harness_cards.json | python -c "
import json, sys
cards = json.load(sys.stdin)
exc = [c for c in cards if c['type'] == 'exception']
print(f'{len(exc)} exception cards out of {len(cards)} total')
"
```

---

### Phase 4 — Silent pilot (HITL mode, cards generated but not dispatched)

**Duration:** 2 weeks (10 working shifts)

**Setup:** Run the harness in `hitl_only` mode — cards are generated and
displayed in the Command Center Priority Feed, but no Google Chat dispatch
is triggered.

```json
// harness_config.json addition
"dispatch": {
  "mode": "hitl_only",
  "live_dispatch_enabled": false
}
```

**What to measure each shift:**
1. Alert accuracy: RTA reviews generated cards and marks each as correct / false positive / missed
2. Card confidence: average confidence score across all `alert` type cards
3. LOB routing: every card's `selectedChannel` is correct for its LOB

**Pass criterion:** Confidence score ≥ 80% averaged across 5 consecutive shifts.
This matches Gate 1 in the Steerco release criteria.

**Data collection sheet (copy per shift):**

| Date | LOB | Total cards | Correct | False positive | Missed alerts | Avg confidence |
|---|---|---|---|---|---|---|
| 2026-06-01 | TLB | 7 | 6 | 1 | 0 | 0.87 |
| ... | ... | ... | ... | ... | ... | ... |

---

### Phase 5 — Supervised live dispatch pilot

**Prerequisites:** Phase 4 passed. Google Chat webhook credentials configured.
Security review completed with Elizabeth Hurtado.

**Start with one LOB only (lowest-risk: TLB).**

```json
"dispatch": {
  "mode": "supervised",
  "live_dispatch_enabled": true,
  "live_dispatch_lobs": ["Telephone Banking"],
  "require_rta_approval": true
}
```

**What to measure:**

| Metric | Target | Meaning |
|---|---|---|
| Override rate | < 20% | RTA edits or suppresses fewer than 1 in 5 cards before dispatch |
| False dispatch rate | < 5% | Fewer than 5% of dispatched alerts were later marked as noise |
| System uptime | > 95% per shift | Daemon runs without crash for > 95% of the 8-hour shift |

**Pass criterion:** Override rate < 20% over 5 consecutive shifts.
This matches Gate 3 in the Steerco release criteria.

---

## Section 8 — Security Checklist

Each item is mandatory. All items must be checked before Phase 5 (live dispatch).

### 8.1 Transient frame policy

Screenshots are source evidence only — they must never be stored, logged,
or transmitted beyond the extraction layer.

**Checklist:**
- [ ] `delete_transient_capture()` is called in a `finally` block — it runs even if extraction fails
- [ ] `screenshot_retention_seconds` in config is set to ≤ 60
- [ ] No screenshot path appears in the audit log (log row count and LOB only, not the image)
- [ ] Temp directory is not backed up or synced to cloud storage (confirm with IT)

```python
# daemon.py — correct pattern (always delete in finally)
path = capture_window(hwnd)
try:
    rows = extractor.extract_agent_rows(path, lob, geo)
finally:
    delete_transient_capture(path)   # runs even if extraction raises
```

### 8.2 No structured data from screenshots in dispatch

Verify that alert messages sent to Google Chat contain only:
- Agent name (from `AgentRow.agent_name`)
- Status code (from `AgentRow.actual_status`)
- Duration (from `AgentRow.duration_seconds`)
- LOB (from config)

They must never contain:
- File paths to screenshots
- Base64 image data
- Raw OCR output strings
- Citrix session details

### 8.3 API key storage

- [ ] All API keys in `.env` — never in `harness_config.json`
- [ ] `.env` in `.gitignore`
- [ ] `harness_config.json` in `.gitignore`
- [ ] No key value printed in harness logs (use `os.environ.get("KEY", "***")` for debug output)

### 8.4 Audit trail

Every capture event must be logged append-only:

```python
# harness/audit.py

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


class AuditLog:
    def __init__(self, path: str):
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, event_type: str, data: dict) -> None:
        """Append one audit event to the JSONL log. Never overwrites."""
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "event": event_type,
            **data,
        }
        with open(self._path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
```

Required audit events:

| Event type | When | Fields |
|---|---|---|
| `harness_start` | Daemon start | account, adapter, lobs |
| `lob_cycle_complete` | After each LOB tab extraction | lob, row_count, exception_count |
| `lob_cycle_error` | On extraction error | lob, error (message only, no stack trace with API keys) |
| `cards_emitted` | After evaluate + build_card | count, cycle_id |
| `dispatch_sent` | When a card is dispatched (Phase 5) | card_id, lob, channel, severity |
| `harness_stop` | On graceful shutdown | reason |

### 8.5 CIBC security review

Track A (screen capture) requires a formal review with Elizabeth Hurtado
(CIBC information security contact, identified in the CIBC intake plan)
before live dispatch.

**Talking points for that review:**
1. Screenshots are transient — retained for < 60 seconds and deleted immediately after OCR
2. No screenshot ever leaves the RTA's local machine — only structured text is transmitted
3. The LLM call sends base64 image data to the provider endpoint — confirm this is acceptable under CIBC data handling policy
4. Track B (Verint REST API) does not involve any screen capture — it reads data the RTA already has API access to

Track B does **not** require a separate security review — it uses the same
data the RTA can already access, via a read-only API credential.

---

## Section 9 — Adding a New Account

### 9.1 The 5-step configuration playbook

No code changes are needed to onboard a new account. The entire process is
configuration and a shadowing session.

**Step 1 — Run a ReDY shadowing session**

Spend a half-day with 1–2 RTAs at the new account. Record:
- The list of LOBs monitored by the RTA
- The order of Verint LOB tabs (left to right) — critical for `lob_tab_order`
- The rule workbook (alert thresholds) — used to populate `alert_thresholds.json`
- Which Google Chat channels correspond to which LOBs

**Step 2 — Create the account configuration files**

```bash
# Copy the template
cp config/harness_config.template.json config/ACCOUNT_NAME_harness_config.json
cp ../../POC/01_evidence_pack/rules/lob_routing_seed.json \
   config/ACCOUNT_NAME_lob_routing.json

# Edit both files with the new account's LOBs, geo, and Verint tab order
```

Populate `alert_thresholds.json` from the account's rule workbook using the
same format as `POC/01_evidence_pack/rules/alert_thresholds.json`. The
Intelligence Service loads this file at startup — no code change needed.

**Step 3 — Run Phase 1 and Phase 2 tests**

```bash
python tests/step8_e2e_static_test.py --config config/ACCOUNT_NAME_harness_config.json
```

If you have collected screenshots during the shadowing session, use them as
the static test input. Otherwise run against the CIBC Guatemala screenshots
as a sanity check (expect LOB mismatch, but all other fields should pass).

**Step 4 — Run Phase 3 smoke test during the shadowing session**

Bring a laptop with the harness installed. Run the daemon during a 15-minute
monitoring cycle alongside the RTA. Verify the extracted rows match the RTA's
view.

**Step 5 — Add the account to the adapter registry**

No code changes — just ensure the account's `harness_config.json` file is on
the RTA's machine before going live.

### 9.2 Account isolation

Each account runs its own harness daemon instance with its own config file.
There is no shared state between accounts. The Intelligence Service and
Command Center can serve multiple accounts simultaneously through the output
card queue.

---

## Section 10 — Troubleshooting Reference

### 10.1 Symptom lookup table

| Symptom | Likely cause | Fix |
|---|---|---|
| `Citrix window not found` | Process name mismatch or Citrix minimised | Check Task Manager for correct process name; update `citrix.process_name` in config |
| Screenshot is black or all-grey | Citrix hardware acceleration blocks screen capture | In Citrix Workspace settings → Advanced → disable GPU acceleration |
| Screenshot shows only toolbar, not Verint grid | Verint grid is on a different monitor or Citrix is in full-desktop mode | Set `citrix.full_desktop_mode: true`; capture the full Citrix window |
| Extraction returns `[]` | Vision model did not find the grid | Check screenshot quality; verify `window_title_contains` matches the visible window; try `azure_vision` adapter as diagnostic |
| Status codes are abbreviated (e.g. `"COAC"`) | Vision model returned abbreviated codes | Normaliser handles this via `aux_definitions.json`; no fix needed |
| `LOB` field is wrong or empty | Tab navigation not completing before capture | Increase `citrix.tab_load_wait_seconds` from 1.5 to 3.0; verify `lob_tab_order` matches the actual tab order |
| UFO² falls back to vision (slow) | Citrix is in full-desktop mode — UIA cannot see through the remote desktop container | Switch to `claude_cu` or `openai_cua` adapter; OR request Citrix seamless mode from IT |
| Clock drift — timestamps are wrong | RTA machine clock is not synchronised | Enable Windows NTP sync; harness uses `datetime.now(timezone.utc)` — verify RTA machine timezone matches expected geo |
| LLM API rate limit (429 error) | Too many requests per minute | Increase `capture_interval_seconds` from 30 to 60; add exponential backoff in the extractor |
| Verint API returns 401 (Track B) | OAuth token expired or invalid | Check `VERINT_CLIENT_ID` and `VERINT_CLIENT_SECRET` env vars; verify token endpoint URL |
| Verint API returns 403 (Track B) | Credential does not have read access to the requested LOB group | Ask CIBC IT to verify the credential has `realtime_adherence:read` scope for all configured LOBs |
| `scheduled_activity` is always `"Unknown"` | Schedule integration is not active in Verint | Confirm with CIBC IT; some OOA rules will not fire without schedule data; document in audit |
| Cards are duplicated in Command Center | Persistence map not being passed between cycles | Ensure `persistence_map` is carried across cycles in the daemon loop; see `evaluate_agents(persistence_map=...)` in `alert_engine.py` |
| High exception card rate (> 20%) | Verint grid layout changed | Update the extraction prompt with corrected column order; run Phase 2 test against new screenshots |

### 10.2 Log inspection commands

```bash
# Show all errors from the last 24 hours
grep '"event": "lob_cycle_error"' logs/harness_audit.jsonl

# Count rows extracted per LOB across last cycle
grep '"event": "lob_cycle_complete"' logs/harness_audit.jsonl | tail -6 | python -c "
import sys, json
for line in sys.stdin:
    e = json.loads(line)
    print(f'{e[\"lob\"]}: {e[\"row_count\"]} rows')
"

# Show exception card rate
python -c "
import json
cards = json.load(open('output/harness_cards.json'))
exc = [c for c in cards if c['type'] == 'exception']
print(f'Exception rate: {len(exc)}/{len(cards)} = {len(exc)/max(len(cards),1)*100:.1f}%')
"
```

### 10.3 Reverting to simulation

If the harness encounters a critical failure during a live shift, the RTA can
immediately revert to the simulation-backed Command Center by stopping the
daemon and switching back to the original scenario data in the UI. The harness
is completely external to the Command Center — stopping it has no effect on the
UI state.

```bash
# Stop harness daemon gracefully
kill -SIGTERM $(cat /tmp/harness.pid)

# The Command Center continues running on simulation data
# No data loss, no UI disruption
```

---

## Appendix A — Quick Reference Card

Print and keep near the RTA's machine.

```
HARNESS STARTUP
  1. Open Citrix → Verint (ensure grid is visible)
  2. python -m harness.daemon --config config/harness_config.json
  3. Watch for: "Harness started. Account: ..."

HARNESS SHUTDOWN
  Ctrl+C in the daemon terminal — graceful shutdown
  All in-flight cards are still written to output/harness_cards.json

CHECK IT'S WORKING
  tail -f logs/harness_audit.jsonl
  Look for: "lob_cycle_complete" with row_count > 0

EMERGENCY REVERT
  Stop harness (Ctrl+C) → Command Center stays on simulation data

SCREENSHOT FILES (if any remain after crash)
  del %TEMP%\harness_capture_*.png
```

---

## Appendix B — Adapter Decision Tree

Use this when choosing which adapter to configure for a new account:

```
Is Citrix in seamless mode (Verint windows float on desktop)?
  YES → Use ufo2 (UIA path is fast and reliable)
  NO  → Is Verint also accessible via browser URL?
          YES → Use browser-use / agent-browser on Chromium and skip the Citrix/vision path
          NO  → Use claude_cu or openai_cua (full-screen vision)

Is the Verint REST API available (CIBC IT has provisioned credentials)?
  YES → Always prefer verint_api (Track B) over any Track A option
  NO  → Continue with Track A until credentials are available

Is LLM API access restricted on the RTA's machine?
  YES → Use azure_vision (no LLM needed — pure OCR + layout analysis)
  NO  → Use ufo2 (default) or claude_cu (high-accuracy fallback)
```

---

## Appendix C — Release Gate Cross-Reference

The test phases in Section 7 map directly to the release gates defined in
`FDAE_Program_Response_Derek_Erin.md` Section 4c:

| Steerco gate | This guide | Pass threshold |
|---|---|---|
| Gate 1: Accuracy | Phase 4 (silent pilot) | Confidence ≥ 85% over 10 shifts |
| Gate 2: Coverage | Step 9 (daemon running) + Phase 3 | Processes 2 and 6 live |
| Gate 3: Adoption | Phase 5 (supervised dispatch) | Override rate < 20% over 5 shifts |
| Gate 4: Stability | Phase 5 (sustained) | Zero P1 incidents in 10 shifts |
| Gate 5: Governance | Section 8 checklist | Audit log active + security review signed |

No gate is out of scope for this harness. The harness is the component that
makes Gate 1, 2, and 3 measurable. Gates 4 and 5 require process and governance
steps outside the code, but the harness's audit log is the measurement instrument.

---

*Document prepared by the CIBC RTA Automation engineering team — May 2026.*
*Source files: `POC/07_simulation/engine/`, `POC/01_evidence_pack/rules/`, `POC_Redefined/command-center/src/domain/types.ts`*
