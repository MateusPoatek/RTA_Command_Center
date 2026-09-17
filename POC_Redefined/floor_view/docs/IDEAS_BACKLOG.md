# Floor View / Platform — Ideas Backlog

*Forward-looking threads to explore once the core is proven. Captured 2026-06-12 (Mateus). Each notes the idea, what
data/work it builds on, and where it connects to what already exists.*

---

## 1. Observability layer (the solution goes live as a TELUS app → 100+ accounts this year)

**Why:** once proven, this becomes a **unified multi-client WFM platform** adopted by 100+ accounts through the year.
Operating that fleet needs observability across **three audiences**:

- **Infrastructure side (run the fleet):** per-tenant + fleet-wide health of the capture pipeline —
  extension liveness/heartbeat (✅ seed already built: `chrome.storage.session` survival + the `♥ synced Ns ago`
  heartbeat + `captureLog`), capture freshness, Verint API latency/health, **per-tenant rate-budget consumption**
  (ADR-0004), error rates, SW-eviction frequency, push success. SLOs per tenant. The heartbeat + captureLog are the
  first telemetry primitives — generalize them into a fleet dashboard.
- **Client side (adoption/value):** per-client usage — LOBs covered, alert volume, dispatch rate, RTA engagement,
  data-freshness SLA, "is the bridge alive for account X right now."
- **Intelligence for the client (insight delivered):** aggregated trends/benchmarks (k-anonymized cross-client per
  the **locked D3 decision** — opt-in, legal-gated, never the raw cross-client liability), $ value (alerts actioned,
  adherence improvement, toil removed).

**Builds on:** the productionization plan's **3 intelligence stores** (control-plane · operational+immutable-audit ·
derived warehouse), the **per-tenant manifest**, and the **cloud-neutral seams**. Observability is itself one of those
seams. **Next concrete step when ready:** define the telemetry schema (what each capture emits, name-free) + a
per-tenant health rollup; promote `captureLog`/heartbeat into a real metrics stream.

## 2. Floor-View intelligence catalog (what *intelligence* can we generate from the data?)

Each item maps to data we already capture (Verint adherence/violations + actualSchedule + schedule; + GTT attendance
when it lands) and feeds the FloorView (heat, the lunch/break wave) and/or the cards:

| Intelligence | From what data | Connects to |
|---|---|---|
| **Most frequent events** | which OOA statuses/activities recur most, by LOB / agent / time-of-day | aggregation over `adherence.violations`; FloorView neighbourhood badges |
| **Peak times of fluctuation** | intraday adherence-break curve; when the floor goes red | the **lunch/break wave** (DESIGN.md) made quantitative; a per-LOB intraday heat timeline |
| **Shrinkage** | unproductive/off-phone time as a % of paid (WFM shrinkage metric) | `actualSchedule.events` isWork/isPaid + productive-hours derivation + **Load Contract Rules** (paid definition) |
| **Rebalance** | LOB A overloaded while B has slack → propose agent moves | existing **rebalance cards** in the CC; intelligence = detect imbalance + suggest moves |
| **Tech-outage detection** | a *cluster* of simultaneous OOA / same status across many agents in an LOB = likely outage signature | existing **outage-playbook cards**; intelligence = auto-detect the cluster, not hand-seeded |
| **Next-best-action** | per situation, recommend the action (send/escalate/suppress/rebalance) | the **Copilot** seed (`fuelixClient`); confidence-scored recommendations |

**Theme:** we already have the *atoms* (per-agent adherence + schedule); intelligence = **aggregation + pattern
detection** over them. Outage-detection (the cluster signature) and shrinkage are the two highest-value, most-novel.

## 3. Report Composer (parameter-driven report definition)

**The idea:** a "report composer" where a report is *defined by parameters*, not hardcoded:
- **Who needs to read it** — audience / recipients / channels.
- **Frequency** — how many times a day (the reporting cycles: Morning/Midday/Final, or custom).
- **What questions it answers** — the report's purpose / sections.
- **Which sources** — Verint adherence · GTT attendance · telephony (later) · ServiceNow (later).
- **Which KPIs** — and **prefer the ones with the best confidence score** (surface confidence per KPI; we already
  track `dataClass`/`confidence` on cards).

**Mateus's key unlock:** now that the extension is **sleep-proof**, we can reliably **consolidate a full shift's
data → shift open/close reports** (bookend the shift: who started on time, who's still out at close, productive hours,
attendance exceptions).

**Builds on:** this is the natural evolution of the **config-panel menu** (CONFIG_PANEL_MENU.md) — from "what to see
on the floor" to "what to compose into scheduled reports" — on the same **tenant-manifest / control-plane** idea. Ties
to the existing **Reports tab** + attendance reports, the **confidence scoring**, and the **shift open/close +
productive-hours** derivations already live in `parse.js`. **Next concrete step when ready:** a report-definition
schema (audience · cadence · questions · sources · KPIs+confidence) + a shift-bookend report as the first instance.

---

## 4. Google Chat slash-command bot (`/attreport`, `/statuscheck`)

**Idea (Mateus, 2026-09-02):** an RTA types `/attreport` or `/statuscheck` directly in the Google Chat space and gets
the current Command Center report back as a reply — no need to open the app.

**Why deferred:** the incoming webhook we already use for outbound alerts (`GCHAT_WEBHOOK_<ACCOUNT>`,
`local_api.py` `/dispatch-alert`) is one-way — it can push into a space but has no way to *receive* a typed message.
Reacting to a slash command needs one of two real integration paths, each with an access/infra requirement outside
this codebase:

- **A real Chat app** registered in Google Cloud Console with `/attreport` as a defined slash command, plus a public
  HTTPS endpoint Google's servers can call synchronously (`local_api.py` is localhost-only today — would need ngrok
  for testing or an actual deployment for real use).
- **A polling bot**: a backend loop reads the space's message history via the Chat API on an interval, looks for a
  message starting with `/attreport`, and replies via the existing webhook. No public endpoint needed, but requires a
  service account with read access to that space (member of the space, or domain-wide delegation) and tolerates
  poll-interval lag, not instant replies.

**Blocked on:** Mateus confirming whether he has the Google Workspace/Cloud access either path needs. **No action
until then** — revisit once the Full Shift Report (composed Attendance + Adherence + Intelligence, see the
`ShiftReportPrintView` work) has something worth replying with.

---

## 5. Verint capture extension — auto-detect and auto-page the calendar

**Idea (Mateus, 2026-09-15):** the extension already reliably captures attendance/adherence from Verint's calendar
view (alerts + productive hours) — confirmed working well. Suggested improvement: have it detect how many pages of
agents the current calendar view has, then automatically capture every page at a set time interval, instead of
relying on whatever's manually paged into view at capture time.

**Why deferred:** raised as an aside during the Verint-only reporting work, not scoped/estimated yet — needs its own
look at `verint_extension/` (content_cc.js/parse.js) to find where page count could be read from the DOM and how the
existing capture-interval/scheduling logic would extend to a multi-page walk.

---

## How these relate

All three are facets of the **platform** the POC is becoming: #1 is how we *operate* it at fleet scale, #2 is the
*value* we extract from the data, #3 is how that value is *packaged and delivered* per client. They share the same
spine: per-tenant manifest + the 3 intelligence stores + confidence-scored, source-tagged data. Explore after the core
loop (capture → adherence/attendance → FloorView + reports) is proven on real CIBC data.
