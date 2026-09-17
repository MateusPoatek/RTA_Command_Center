# Floor View — Dry-Run Protocol (the gate)

*The single experiment that unblocks the whole feature. Run this **before** writing any interface. Read-only.
Needs a live Verint login (Mateus). The instrument is [../dry_run/floor_probe.js](../dry_run/floor_probe.js); the
how-to and safety rails are in [../dry_run/README.md](../dry_run/README.md).*

---

## What we're proving

> **Will Verint accept a `workResourceIds` set that *we* compose** — spanning multiple census pages and multiple
> LOBs — in a `calendar-filter` POST, returning live adherence for exactly those people?

- **Yes** → the attention-driven, neighbourhood-scoped scheduler ([REFRESH_ARCHITECTURE.md](REFRESH_ARCHITECTURE.md))
  is real. Build it.
- **No** → fall back to **page-aligned neighbourhoods** (accept Verint's 50-row pages as the unit). Document the
  fallback verdict; the rest of the design is unchanged.

Nothing else in the feature is unproven. This is the only gate.

## The variants (fire in order)

| # | Variant | Mutation applied to the captured request | PASS criterion |
|---|---------|-------------------------------------------|----------------|
| **V0** | Baseline census | none — just capture a real `calendar-filter` after applying an account filter | request body recorded; response has `resourceData[]`, a `total`, and sample `organizationName`s |
| **V1** | Pagination | census body, set `offset = 50` (keep `limit = 50`) | returns the **next** 50 *distinct* employees; `total` unchanged; HTTP 2xx |
| **V2** | **Arbitrary IDs** ⭐ | adherence body, `useAllEmployees:false`, `workResourceIds` = **5 IDs from page 0 + 5 IDs from page 1** | returns adherence for **exactly** those 10 IDs; HTTP 2xx; no error |
| **V3** | **Cross-LOB set** ⭐ | adherence body, `workResourceIds` = IDs spanning **≥2 distinct `organizationName`s** | returns all requested, regardless of LOB; HTTP 2xx |
| **V4** | Single-LOB pull | adherence body, `workResourceIds` = all IDs (≤50) of **one** `organizationName` | returns that whole neighbourhood — the "neighbourhood refresh" primitive |
| **V5** | Health probe | repeat a small targeted pull a **handful** of times, sequentially, with a gap | record latency per call + any `429` / `Retry-After` / `5xx`; informs the rate budget |

⭐ **V2 + V3 are make-or-break.** They are the literal statement of "self-composed, cross-page, cross-LOB ID set."

## Reading the results

- **V2 PASS and V3 PASS** → ✅ **GREEN-LIGHT** the attention-driven scheduler. Record the verdict; proceed to Phase 3.
- **V2 or V3 FAIL** (rejected, error, or returns the wrong/empty set) → 🟠 **FALLBACK** to page-aligned
  neighbourhoods. Record *exactly how* it failed (status code, error body shape) in the ADR — that detail decides
  whether a milder workaround exists (e.g. IDs must be page-contiguous, or capped below 50).
- **V1 FAIL** (offset paging doesn't behave) → stop and investigate; the census tier itself is in question.
- **V5** is **not** pass/fail and **not** a stress test. It's a few requests to *characterise* latency and surface any
  rate-limit signalling. The explicit goal is **not to perturb Verint.**

## Safety rails (binding)

These are restated in [../dry_run/README.md](../dry_run/README.md) and enforced by the harness where possible:

1. **Read-only.** Every request is a `calendar-filter` GET-equivalent read. No write endpoints, ever.
2. **Sequential, never parallel.** One request at a time, with a deliberate gap. No `Promise.all` fan-out.
3. **Conservative count.** A dozen-ish requests total across all variants. This is a probe, not a load test.
4. **Abort on first `5xx`.** If Verint returns a server error, stop immediately and record it.
5. **Low-traffic window**, and **coordinate with Dione** — Verint stability/governance was explicitly flagged by the
   team. This run is "active polling"; treat it as such.
6. **PII never leaves the machine.** The harness strips employee names before any console dump. Saved captures go to
   a gitignored `captures/` (or `runs/`); **no raw response body is ever committed.** Recorded results are
   **counts, statuses, latencies, and the verdict** — not bodies.

## What to record

Copy [../dry_run/results_template.md](../dry_run/results_template.md) and fill it in live. Per variant: HTTP status,
record count returned vs requested, latency, any rate-limit headers, and PASS/FAIL. Then the one-line overall verdict:
**GREEN-LIGHT** or **FALLBACK** (+ the failure detail if fallback). Commit *that* file (sanitised) as the durable
record of the gate.
