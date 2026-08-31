# Session Learnings — 2026-08-28

*Captured for MemPalace mining. Focus: non-obvious findings and decisions, not a diff log — the git history already has the diffs.*

---

## 1. COPC alert-dispatch batching (Command Center only)

**Decision:** batching lives entirely in the Command Center's Priority Feed, not the extension. The extension's capture/push behavior stays untouched by explicit instruction — the fix for "don't flood GChat/Teams" is a dispatch-layer concern, not a capture-layer one.

**Reused instead of built:** `CardStatus` already had a dormant `"ready-to-send"` value ("RTA approved the draft, ready to dispatch") that `resolveStatus()` skipped past straight to `"sent"`. That's exactly the "queued for batch" state — approve-send now stops there, and a new `flushBatch()` (App.tsx) is what actually creates `DispatchEntry`s and moves cards to `"sent"`, on a configurable interval (default 15 min, RTA-adjustable in the Priority Feed).

**Batch size cap (added after live testing):** a queue can grow to 200+ cards. `flushBatch()` groups queued cards by account first (a batch never mixes accounts), then splits each account's group into chunks of `MAX_BATCH_SIZE = 25`, each chunk its own `cycle` number. A queue of 200 becomes 8 batches of 25, not one batch of 200.

**Dispatch history rollup:** `DispatchEntry.cycle` already existed ("which monitoring cycle this was sent in") but was previously just `dispatchLog.length + 1` — cosmetic, not a real batch id. Now every entry created in one `flushBatch()` call shares the same real cycle number, and `utils/dispatchHelpers.ts`'s `groupByCycle()` (shared by `DispatchFeed.tsx` and `CloseShiftPanel.tsx`, so the live feed and the end-of-shift handoff summary can't drift apart) rolls entries up into "Batch #N — HH:MM: X sent," expandable to individual sends.

**Escalation entries needed their own cycle-numbering fix:** they used to stamp `cycle: dispatchLog.length + 1` too — an independent counter that collided with `flushBatch`'s real cycle numbers (both start at small integers), which would have merged unrelated escalations into the wrong batch group. Fixed by tagging escalations with `batchSeqRef.current + 1` (the *next* batch's number) so they never collide with an already-flushed cycle and merge cleanly into whichever batch flushes next.

## 2. Multi-account partitioning

**Key discovery:** `CommandCard.lob` was already being repurposed by the live extension to carry the *account* name (`"EPIC"` / `"ZILLOW"` / `"CORELOGIC"`), not just the sub-queue names (`"Costco"`, `"Fraud ITR"`) it means elsewhere in the codebase. This let account partitioning reuse the existing field with zero new plumbing — `isAccountCard(lob)` (domain/types.ts) just checks membership in the known `ACCOUNTS` tuple; anything else (demo/scenario `lob` values) passes through unfiltered so scenario mode keeps working.

**Design:** single shared `cards`/`dispatchLog` state (that's how data actually arrives from the extension bridge), filtered per-render into `visibleCards`/`visibleDispatchLog` by `activeAccount`. Not separate storage — switching accounts never loses anything, it's a view filter.

**A bug this surfaced:** the "autonomous AI" demo loop (`useLiveEngine.ts`) picked cards from the *full* unfiltered list, so its toast could reference a card from an account the RTA wasn't even viewing — looked like "wrong names" in the toast. Fixed by scoping the autonomous-selection filter to `activeAccount` too. A second, compounding bug in the same filter: `"ready-to-send"` was still in the eligible-for-autonomous-action list, so once batching made approve-send *queue* instead of *send*, the engine kept re-selecting the same already-queued card every tick forever. Removed `"ready-to-send"` from that filter.

## 3. Card grouping + "up to speed" dedup

Cards sharing the same `(lob, type, rule.id)` collapse into one visual group with a count, expandable to individual agents (`groupActiveCards()` in `cardHelpers.ts` — presentation-layer only, doesn't touch the underlying `CommandCard[]` shape).

**Per-shift dedup memory:** a recapture can resurface the same violation under a *new* raw card id before it's resolved server-side. `actionedKeysRef` (App.tsx) keys on `(lob, rule.id, agent.id-or-name)` — NOT the card's own `id`, which isn't stable across recaptures — and the extension-bridge callback merges incoming cards against it instead of blind-replacing, so already-actioned violations don't resurrect as "needs-review". Resets on `startShift()`.

## 4. Full Capture (extension) — the one-pass alternative to RTA paging

The gate-probe primitive built earlier (ADR-0005, self-composed sequential `calendar-filter` reads from the extension's authenticated context) already proved Verint honors composed reads. It just wasn't wired to feed the *real* capture pipeline — only a diagnostic counter. Extended `probeFire()` with an `emitFull` option that reuses the existing `emit()` hook (the same one the passive tee uses), so a new `runFullCapture()` can drive census + targeted pulls and have them land in `captures.calendarFilters` exactly like normal paging would — one popup click instead of paging every few minutes.

**Explicitly flagged, not resolved:** this is "active polling" per the existing ADR-0004/0005 governance language, and the per-tenant rate ceiling is still an unratified guess. Shipped with a confirm-before-fire prompt specifically so it's never triggered silently against a real account's tenant.

## 5. GTT × Verint reconciliation — three real bugs found, one false start

The user's "248 discrepancies never change" report chain surfaced a genuinely tricky sequence of root causes, in the order they were found:

1. **Hispanic double-surname join failure** — `GTTRow.surname` took only the *last* token of "Firstname Surname1 Surname2" (`.split()[-1]`), while Verint's "Last, First" format puts the *whole* surname before the comma. For a population where double surnames are the norm (Guatemala/El Salvador), this meant most employees never exact-matched at all. Fixed to `" ".join(.split()[1:])` — not perfect (fails on compound first names like "Roberto Carlos"), but a strict improvement for the dominant case.
2. **rapidfuzz silently missing** — the fuzzy-match fallback swallows `ImportError` and returns `None` with no error, so a missing dependency degrades matching invisibly. Discovered there are **two separate `.venv-browser` directories** in this repo — one at repo root (Python 3.12, uv-managed) and one inside `POC_Redefined/` (Python 3.9, system CommandLineTools Python, already had rapidfuzz) — and `local_api.py` in practice runs under the **second** one. Installing rapidfuzz into the wrong (root) venv earlier in the session did nothing for the actual running server. Added a `fuzzy_match_available` flag surfaced in the report's `_meta` and as an intelligence bullet, plus a startup log line in `local_api.py`, so this can never fail silently again.
3. **A self-inflicted false fix** — hypothesized that Verint emits multiple rows per employee (one per activity interval) and "fixed" the reconciler to mark every same-surname row as matched. Actually verified (by reading `parse.js`'s `extractRoster()`) that it already emits exactly ONE row per employee — the fix solved a non-existent problem and introduced a real one: two *different* employees sharing a surname would incorrectly both get marked matched by a single GTT row. Reverted once the wrong assumption was caught. **Lesson: verify the actual data shape before writing a fix for an assumed one** — the synthetic test that "confirmed" the first fix was itself built on the same wrong assumption, so it validated nothing.
4. **The real dominant cause was neither of the above** — cross-checked directly against the live GTT API (`gtt_gate.py`, bypassing the reconciler entirely) and confirmed GTT genuinely only had ~140 event rows for ~27 employees at that point in the day, while Verint showed 272 people present. This is a legitimate GTT-is-a-cumulative-log-that-fills-in-during-the-day vs Verint-is-who's-here-right-now timing difference, not a bug. Led directly to feature #6 below.

**Process note:** `local_api.py` is a long-lived uvicorn process; its `from X import Y` statements execute inside the per-request handler but Python only reads a module's source once per process. Editing `gtt_verint_reconciler.py`/`gtt_adapter.py` while the server keeps running has **zero effect** until the process restarts. This caused two rounds of "the fix didn't work" that were actually just "the fix never ran." Now documented directly in `local_api.py`'s own startup comment.

## 6. Shift start/end extraction (answers "should fewer people be flagged during off-hours?")

`parse.js` already had an unused-for-this-purpose helper, `deriveShiftProductive()`, computing per-agent shift open/close from `actualSchedule.events[]` (min start / max end) — built earlier for card display, never wired into the roster export used for reconciliation. Wired it through the full chain: `extractRoster()` → `verint_normalize.py`/`AgentRow` (`POC/07_simulation/engine/alert_engine.py`, two new optional fields with defaults) → `gtt_verint_reconciler.py`.

**New discrepancy type: `not_yet_scheduled`** — an unmatched Verint row whose own `shift_start_iso` is still in the future relative to report-generation time is no longer counted as a real discrepancy (excluded from `discrepancy_count`, given its own UI filter tab, slate-colored instead of red). The report also now surfaces `earliest_shift_start`/`latest_shift_end` across the whole captured roster as an intelligence bullet.

**Requires a fresh capture to take effect** — this is extension-side code (`parse.js`), so it needs `chrome://extensions` reload + a fresh Verint page/capture before the new fields exist in any roster data. Forgetting this step (twice) is why "fixes" appeared to do nothing until a real recapture happened.

## 7. The roster-goes-empty-on-reload trap

`verintRoster` (App.tsx) was plain in-memory React state, never persisted. Any full page reload (including a Vite HMR full-reload triggered by certain file edits) silently reset it to `[]`. Clicking "Report" afterward sent `verint_rows: []` to the backend, producing a report where *every* GTT row shows "No Verint record" — which reads exactly like a real capture-gap incident but is actually just stale frontend state. Fixed two ways: persisted `verintRoster` to `localStorage`, and added an explicit `report_intelligence.py` bullet (checked first, before any other analysis) for `verint_total == 0`.

## 8. UI polish that mattered in practice

Filter-tab counts (`GttReportDashboard.tsx`) — computed once from the full unfiltered row set, shown as a badge on every tab (`All (407) · No Verint record (12) · ...`) — came from the user wanting the category breakdown visible without clicking through each tab. Small change, meaningfully better at-a-glance readability for a table that routinely has 200-400+ rows.

---

## Standing gotchas worth remembering next session

- **Two `.venv-browser` dirs exist** — repo root (3.12) and `POC_Redefined/.venv-browser` (3.9, system Python). `local_api.py` runs under the **POC_Redefined-local** one. Don't install deps into the wrong one.
- **Restart `local_api.py` after any `.py` file change** in `gtt_adapter.py`, `gtt_verint_reconciler.py`, `verint_normalize.py`, `report_intelligence.py`, or `local_api.py` itself — module caching means edits are invisible otherwise.
- **Reload the extension + recapture Verint** after any `verint_extension/*.js` change before expecting new fields/behavior in a report.
- **`card.lob` is overloaded** — account name for live-captured cards, sub-queue name for demo/scenario cards. `isAccountCard()` is the discriminator; don't assume `lob` means one or the other without checking.
