# Floor View — Gate probe via the extension (how to run)

This is the **working** way to answer the gate (does Verint honour a `workResourceIds` set *we* compose?). It replaces
the console harness, which couldn't authenticate (wrong frame + rotating token — see
[../docs/decisions/0005-probe-via-extension-not-console.md](../docs/decisions/0005-probe-via-extension-not-console.md)).

The probe lives inside the extension's `inject.js`, so it re-fires from the same authenticated MAIN-world context the
app uses — fresh tokens, right frame, no console. **Read-only.**

## Prerequisites

- Brave/Chrome with the **RTA Live Bridge** extension loaded (unpacked) from
  `POC_Redefined/verint_extension/`.
- A live Verint login. Low-traffic window. Dione aware (this is active polling).

## Run it

1. **Reload the extension** so the updated code loads: `brave://extensions` (or `chrome://extensions`) →
   **RTA Live Bridge** → the **↻ reload** icon. (Do this every time `inject.js` etc. change.)
2. **Open the Verint calendar** and apply your account filter (e.g. EPIC_TISV). Make the filter broad enough to
   include **≥2 organisations** if you want V3 to be a true cross-LOB test (otherwise it degrades to ≈V2 and the popup
   says so).
3. **Page the calendar once** (next page, or re-Apply the filter). This lets `inject.js` capture the live request
   (with a fresh token) and seed the name-free `{id, org}` index. *No DevTools needed.*
4. **Click the extension icon** → in the popup, click **"Run gate probe."**
5. **Keep the popup open ~15s** while it runs V1→V5 sequentially. A results table + a verdict line appear:
   - ✅ **GREEN-LIGHT** — V2 & V3 returned `2xx` with `returned == requested`. The composed-`workResourceIds`
     scheduler is real. → proceed to the FloorView UI (Phase 3).
   - 🟠 **FALLBACK** — the composed set wasn't honoured. The rows show what happened (status / req-vs-ret / error).
6. **Paste the table back to C.** It carries **no employee names** — only `variant · status · req/ret · ms` + an
   `indexed N resources` line. C records the verdict in [results_template.md](results_template.md).

## Reading the table

| Column | Meaning |
|--------|---------|
| `variant` | V1 census (offset 0/50) · V2 arbitrary cross-page · V3 cross-LOB · V4 single-LOB · V5 health ×3 |
| `status` | HTTP status (green = 2xx). `⏳` = a `Retry-After` was returned. Errors show inline. |
| `req/ret` | IDs requested vs rows returned. For V2/V3 these must **match** to pass. |
| `ms` | latency — V5's three rows characterise it for the per-tenant rate budget (ADR-0004). |

## Safety (built into the probe)

Read-only (only `calendar-filter`); **sequential** with an 800 ms gap (never parallel); **abort-on-`5xx`** kill switch;
conservative count; names discarded at capture (the index is ids + `organizationName` only). Everything runs in-page
and evaporates on tab reload.

## If it doesn't work

- **"No result — is the Verint calendar tab open?"** → make sure the calendar tab is open and you **paged it once**
  after reloading the extension, then retry.
- **V1 shows `no captured request yet`** → you haven't paged the calendar since the last extension reload; page once.
- **Everything 401s** → unexpected (the whole point is that inject's context authenticates). Capture the rows and tell
  C; we'd re-examine whether `inject.js` is in the calendar's frame.
