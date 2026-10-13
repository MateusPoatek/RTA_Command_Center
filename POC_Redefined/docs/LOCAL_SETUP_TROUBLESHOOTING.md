# Local setup troubleshooting — Command Center

If the app starts but breaks when you actually use it, it's almost always
one of the two issues below.

## 1. `ImportError: Could not locate the simulation engine`

**Symptom:** `/generate-report` (or any AI card action) returns a 500, and
the backend log shows:

```
ImportError: Could not locate the simulation engine at .../POC/07_simulation/engine.
Expected POC/07_simulation/engine/alert_engine.py relative to the repo root.
```

**Why (historical — should no longer happen after a `git pull`):**
`_engine_bridge.py` imports the shared alert engine from
`POC/07_simulation/engine/`, a folder that sits **one level above**
`POC_Redefined/` (a sibling, not a subfolder). The top-level `POC/` folder
is gitignored in bulk because most of it (evidence pack, OCR dumps, an old
demo duplicate, simulation *data* snapshots) contains real, unsanitized
employee PII — but `07_simulation/engine/` itself is pure code with no PII,
so `.gitignore` now carves out an exception for just that subfolder and it's
committed to the repo. A plain `git clone` or `git pull` gives you
`engine/*.py` automatically; `07_simulation/data/`, `output/`, and
`README.md` stay excluded (they still have real names in them).

**If you still hit this** (e.g. you're on an old checkout from before this
fix, or `git pull` hasn't run):
1. `git pull` on `main` — that alone should resolve it.
2. Confirm the layout looks like this:
   ```
   <repo root>/
     POC/
       07_simulation/
         engine/
           alert_engine.py
           card_builder.py
           ...
     POC_Redefined/
       local_api.py
       _engine_bridge.py
   ```
   `POC/` must be a **sibling** of `POC_Redefined/`, not inside it.
3. Restart `local_api.py`.

**How to verify without running the whole app:**
```bash
python3 -c "
import sys, pathlib
p = pathlib.Path('POC/07_simulation/engine/alert_engine.py')
print('found' if p.exists() else 'MISSING', p.resolve())
"
```
Run this from the repo root — same rule `_engine_bridge.py` uses (it
resolves the path relative to its own file location, not your `cwd`).

## 2. Report shows the wrong account's Functional Area (e.g. `FA_Epic Games`
   when you expected a different account)

**Symptom:** you switch the account selector, generate a report, and the
GTT functional area in the result still belongs to a different account.

**Why:** each account's report config (Functional Area, Sites, Source,
etc.) is persisted per-account in the browser's `localStorage`, keyed as
`rta.report.config.<ACCOUNT_ID>`. If you ever typed a value into the
Config panel's Functional Area field while a different account was
active, it's saved under *that* account's key and will keep showing up
every time you switch back to it — the UI won't silently reset it for you.

This is easy to trigger with **Epic Games (Philippines)**
(`EPIC_PH`) specifically: its catalog default `gttFunctionalArea` is
intentionally blank (`""`) — GTT API access for that site is still being
negotiated, so it defaults to Verint-only. If GTT_verint mode is forced on
and the field gets hand-filled with El Salvador's value, that's what
sticks.

**Fix:**
1. Confirm the account selector actually shows the account you mean to
   test (`EPIC` = El Salvador, `EPIC_PH` = Philippines — they're separate
   catalog entries, not variants of the same one).
2. Open the Report Config panel for that account and check the
   Functional Area field. If it's showing another account's value,
   clear/correct it there — that also updates the saved value.
3. If you want a clean slate: in the browser devtools console,
   `localStorage.removeItem("rta.report.config.EPIC_PH")` (swap in the
   account id you're resetting), then reload.

## Quick pre-flight checklist for a new machine

- [ ] `POC/07_simulation/engine/alert_engine.py` exists as a sibling of
      `POC_Redefined/` — should come automatically from `git clone`/`git pull`
      now (see §1)
- [ ] Backend: `POC_Redefined/.venv-browser` created, deps installed,
      `python local_api.py` running on `127.0.0.1:5050`
- [ ] Frontend: `RTA_Board_V2` → `npm install` →
      `npm run dev` running on `localhost:5174`
- [ ] GCP service-account key present at `POC_Redefined/GTT_JSON/` (get
      from Maximiliano — gitignored, not in the repo)
- [ ] Account selector in the UI matches the account you actually mean to
      test — double-check before trusting a generated report's Functional
      Area
