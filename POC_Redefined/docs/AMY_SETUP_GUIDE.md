# RTA Command Center — Setup Guide for Amy

This is a step-by-step walkthrough to get the full RTA Command Center running on
your own machine: the web app, the local reconciliation backend, and the browser
extension that pulls live data from Verint. Follow the steps in order — each one
builds on the last.

Written for **Brave** as the browser (it uses the same extension engine as
Chrome, so every step below works identically in Chrome if you prefer it).

---

## 1. Prerequisites

Before you start, make sure you have:

- **Brave browser** installed
- **Node.js 18+** and **npm 9+** (`node -v` / `npm -v` to check)
- **Python 3.12** installed (`python3.12 -V` to check)
- **git**
- **Access to the repo**: `https://github.com/MateusPoatek/RTA_Command_Center` —
  if you get a permission error cloning, ask Mateus to add you as a
  collaborator.

---

## 2. Clone the repo

```bash
git clone https://github.com/MateusPoatek/RTA_Command_Center.git
cd RTA_Command_Center
git checkout feat/floor-view
```

---

## 3. Start the frontend

```bash
cd POC_Redefined/command-center
npm install
cp .env.example .env.local
npm run dev
```

Leave `VITE_FUELIX_API_KEY` blank in `.env.local` unless someone gave you a
FuelIX key — without it the Copilot AI panel just shows "not configured", the
rest of the app works fine.

Open **http://localhost:5173** in Brave. You should see the **Shift Briefing**
modal. This confirms the frontend works — leave this terminal running.

---

## 4. Set up the Python backend (GTT reconciliation reports)

Open a **second terminal**. The Report tab in the Command Center calls a local
Python server (`local_api.py`) on port 5050.

```bash
cd RTA_Command_Center/POC_Redefined
python3.12 -m venv .venv-browser
source .venv-browser/bin/activate
pip install -r requirements.txt
python local_api.py
```

You should see uvicorn log that it's running on `http://127.0.0.1:5050`. Leave
this terminal running too.

**GTT service-account key**: `gtt_adapter.py` needs a GCP service-account JSON
key to call the GTT reconciliation API. This is a secret and is **not** in the
repo (it's gitignored on purpose). Ask **Maximiliano** for a current key, and
save it at:

```
POC_Redefined/GTT_JSON/<key-name>.json
```

Without this key, the app still runs — you just can't generate a real
reconciliation report yet.

---

## 5. Load the extension in Brave

The extension ("RTA Live Bridge") reads Verint's own schedule data in your
browser and pushes it into the Command Center — no login credentials or
separate integration needed.

1. Open `brave://extensions` in a new tab.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the folder
   `POC_Redefined/verint_extension`.
4. Pin the **RTA Live Bridge** icon to the toolbar so you can see its badge.

---

## 6. Verify the bridge WITHOUT Verint (do this first)

Before touching real Verint data, confirm the Command Center side of the
bridge works on its own:

1. With `http://localhost:5173` open, open DevTools (Brave menu → More tools →
   Developer tools) and go to the **Console** tab.
2. Open `POC_Redefined/verint_extension/BRIDGE_TEST.js` in a text editor, copy
   its contents, paste into the console, and press Enter.
3. The Priority Feed should immediately fill with sample cards.

If this works, the Command Center is correctly listening for the extension's
messages — any issue after this point is on the Verint/extension side, not the
app.

---

## 7. Open the Verint tab and capture live data

**Important constraint:** the extension only bridges data within **one browser
session**. Verint, the extension, and the Command Center tab must all be open
in the same Brave window/profile on your machine.

1. In Brave, log into Verint at `https://wfo.a87.verintcloudservices.com`.
2. Go to the calendar view and apply a filter (e.g. `EPIC_TISV`) so employee
   rows show — the filter is what triggers Verint's `calendar-filter` API
   call, which is what the extension taps.
3. Check the extension's toolbar badge — it should show a non-zero count once
   data is captured.
4. Switch to (or open) the `http://localhost:5173` tab in the same browser —
   the Priority Feed should fill with real cards. If it doesn't automatically,
   click the extension's popup icon → **Push to Command Center**.

---

## 8. Run a full end-to-end check (capture → report)

1. With cards live in the Command Center (from step 7), open the **Report**
   tab.
2. Configure and generate a reconciliation report.
3. Confirm the request succeeds (it calls `local_api.py` on port 5050 via the
   Vite `/api` proxy) and that a report lands in
   `POC_Redefined/runs/reports/reconciliation_<date>.{json,csv}`.

If this works end to end, your setup is complete.

---

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Badge stuck at 0 | Open the Verint calendar fresh with a filter applied — capture fires on the live API call, not a cached view. |
| Command Center tab doesn't update | Confirm the tab URL is exactly `http://localhost:5173` (the extension's host permission is exact) and reload it. |
| Report tab fails / CORS error | `local_api.py` only accepts requests from `localhost:5173` / `127.0.0.1:5173` — make sure the frontend dev server is the one making the request, and that `local_api.py` is still running in its terminal. |
| Report generation fails with a 401/403 from GTT | The service-account key is missing, expired, or in the wrong path — re-check `POC_Redefined/GTT_JSON/<key-name>.json` and ask Maximiliano for a fresh key if needed. |
| `pip install -r requirements.txt` fails | Confirm you're using Python 3.12 in the venv (`python3.12 -m venv .venv-browser`), not the system Python. |

For more extension-specific detail, see
[`../verint_extension/README.md`](../verint_extension/README.md).
