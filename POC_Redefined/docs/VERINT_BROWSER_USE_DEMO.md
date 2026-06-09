# Verint Browser-Use Demo (live computer-use path)

Drives the live Verint web app (`https://wfo.a87.verintcloudservices.com`) with
browser-use + Playwright to **extract** the ADHERENCE grid, then runs the
deterministic pipeline to produce work cards + draft LOB-chat messages.

## Principle (non-negotiable)

**The agent navigates and extracts; Python decides.** The browser agent never
authors alerts and never mutates Verint. Triage / cards / messages come from
`verint_triage` + `verint_pipeline`. See `Computer_Use_Plan_0603.md`.

## Why browser (not OCR)

The live web app exposes a real DOM — exact text + structure. The earlier OCR
baseline (`POC/05_results/ocr_baseline/`) scored status 100% but LOB 0% and
could not reconstruct the table. DOM extraction solves both; LOB is injected
from the selected View.

## Environment (already set up)

A dedicated Python 3.12 venv at repo root `.venv-browser` (the core's `.venv` is
3.9 and stays untouched). Created with `uv`:

```bash
uv venv --python 3.12 .venv-browser
uv pip install --python .venv-browser/bin/python browser-use playwright langchain-anthropic
.venv-browser/bin/python -m playwright install chromium
```

Versions: browser-use 0.12.9, playwright 1.60.0, langchain-anthropic 1.3.1.

### LLM provider (default: FuelIX)

The agent's LLM defaults to **FuelIX** — TELUS's sanctioned, OpenAI-compatible
gateway (same one the command-center uses). No direct Anthropic key needed.

```bash
export FUELIX_API_KEY="ak-..."        # required for extract mode (default provider)
```

- Default provider `fuelix`, default model `claude-sonnet-4-6` (vision-capable;
  browser-use runs with `use_vision=True`). Confirmed working via
  `browser_use.ChatOpenAI(base_url=https://api.fuelix.ai/v1)`.
- To use Anthropic directly instead: `--provider anthropic` + `ANTHROPIC_API_KEY`.

## Run

Two modes. Run from `POC_Redefined/`.

### 1. Log in once (interactive, no credentials in code)

```bash
../.venv-browser/bin/python verint_browser_use_demo.py login
```

Opens Chromium with a **persistent profile** (`~/.verint_demo_profile`). Log into
Verint by hand, then press Enter to save the session. Re-run only when the
session expires.

### 2. Extract one LOB and produce cards

```bash
export FUELIX_API_KEY="ak-..."
../.venv-browser/bin/python verint_browser_use_demo.py extract \
  --view "Zillow — All Current" --lob Zillow --geo Philippines
```

- `--view` selects a saved View to scope to ONE LOB (stays under the 2,500 cap).
- Reads the Quick View grid, emits `runs/<id>/capture.json`, then runs the
  pipeline → `runs/<id>/cards.json`, `alerts.json`, `run.log`.
- `--capture-only` stops after the capture JSON. `--headless` for no window
  (omit for a visible demo).

## Guardrails

- **Read-only (D4):** the task forbids Edit/Delete/Insert/Create/Purge/Save/Send;
  navigation is domain-locked to `*.verintcloudservices.com`.
- **One-LOB scope (D5):** select a specific View; never capture all agents.
- **No screenshots persisted; no secrets logged.** Login is manual (no creds in
  code); the API key comes from the environment.

## Capture JSON shape (the agent's only output)

```json
{ "captured_at": "...", "source_url": "...", "view": "...",
  "lob": "Zillow", "geo": "Philippines", "cycle": 1, "persistence_map": {},
  "rows": [ { "name": "...", "scheduled_activity": "...", "out_of_adherence": "0:11:07",
              "actual_activity": "...", "time_in_activity": "...", "days_adherence": "78%" } ] }
```

This is exactly the shape `verint_pipeline` consumes — validated end-to-end with
`fixtures/verint_capture_sample.json` (browser-free).

## Note on the tenant

`wfo.a87` is TELUS's Verint (clients: Zillow/TikTok/Etsy/…), not CIBC's data.
This proves the live mechanics; CIBC LOBs/rules/routing swap in when pointed at
CIBC's tenant/View. Non-CIBC LOBs route to the fallback chat channel (expected).
