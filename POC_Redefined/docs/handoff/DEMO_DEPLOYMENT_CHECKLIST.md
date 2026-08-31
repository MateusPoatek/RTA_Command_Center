# Live Demo Deployment — Epic Games, Roblox, Corelogic

*Audience: FDAEs deploying the WFM Automation Platform on-site for the client demo.*
*Purpose: what to do, in what order, and why — so this doubles as onboarding, not just a checklist.*

---

## Glossary

| Term | Meaning |
|------|---------|
| **WFM Automation Platform** | The name for this demo build. Same code as the "RTA Command Center" POC — a React app (`command-center/`) + a local Python backend (`local_api.py`) + a browser extension (`verint_extension/`). No functional difference, just the name we present to the client. |
| **RTA** | Real-Time Analyst — the person who watches the floor (adherence, service levels, alerts) during a shift. The platform is built to reduce their manual work. |
| **Verint** | The client's workforce management system of record. It's where real agent schedules, adherence, and status live. We never write to it — read-only, always. |
| **GTT** | Global Time Tracker — the reporting service that produces reconciliation reports (e.g. attendance, hours). The "Report" tab in the app calls GTT through our backend. |
| **`functionalArea`** | The field GTT uses to identify *which account's* data a report request is for (e.g. `FA_Epic Games`). Not the same string as the Verint org/campaign name — they have to be mapped separately. |
| **Calendar filter** | A saved filter inside Verint that scopes the visible agent roster to one account/LOB. Applying the right filter before capture is how we tell the extension which account's data it's looking at. |
| **LOB** | Line of Business — a client account or sub-account (Epic Games, Roblox, Corelogic are each a LOB in this context). |
| **The extension bridge** | `verint_extension/` — a browser extension that watches Verint's own network requests in the tab and forwards the data to the Command Center tab via `window.postMessage`. It doesn't call any API itself; it listens to what Verint already sends the browser. This is why it only works with Verint and the Command Center open in the *same browser, same machine*. |
| **Live capture** | Data pulled from a real, current Verint session — as opposed to the built-in demo scenarios (A–D), which are scripted and don't depend on Verint at all. |
| **GCP dashboard/hosting environment** | A *separate, future* effort by the WFM team to host the Command Center itself in the cloud. Not needed for this demo — the demo runs entirely on the local machine. Don't confuse this with the GTT service, which already has a working key. |
| **Service-account key** | A credential file (JSON) that lets our backend authenticate to GTT without a human login. Lives at `GTT_JSON/` locally, gitignored, requested from Maximiliano. It can expire — an expired key is the most common reason GTT calls fail. |

---

## Why this plan is structured the way it is

Three ideas run through every phase below:

1. **Prove things work before an audience is watching.** Every "dry run" or "rehearsal" step exists because live demos fail in front of the client, not in private. If a filter, a key, or a network path is going to be a problem, we want to find that out on our own time.
2. **Two accounts are new, one isn't.** Epic Games is already the hardcoded default everywhere in the code. Roblox and Corelogic are not wired in yet — that's real work (Phase 0), not a config toggle. Treat them as the risk, and rehearse them harder than Epic Games.
3. **Live data is a chain of independent parts, and the chain shows its weakest link on demo day.** Verint session → extension capture → local backend → GTT service → UI. Each phase below checks one link. Skipping a phase means the *first time* that link is tested is in front of the client.

---

## Phase 0 — Pre-work before anyone travels on-site

**Why this phase exists:** the platform currently only "knows" one account (Epic Games) end-to-end. Extending it to three accounts is a real gap to close, not a checkbox — doing this work on-site, under time pressure, in front of a client, is the scenario we're avoiding.

| # | Step | Why |
|---|------|-----|
| 1 | Add a way to select/pass Roblox and Corelogic's `functionalArea`/`sites` values (today hardcoded to Epic Games in `local_api.py`, `gtt_gate.py`, and `command-center/src/domain/types.ts`) | Without this, only Epic Games can produce a live GTT report — the other two would silently return Epic Games' data or fail. |
| 2 | Confirm the exact GTT `functionalArea` string for Roblox and Corelogic | Verint's org names (`ROBLOX`, `Corelogic_TIGT_*`) are not guaranteed to match GTT's internal field naming. Guessing this wrong produces a report that looks plausible but is wrong data — worse than an obvious failure. |
| 3 | Confirm the Verint calendar-filter name for each of the three accounts | This is how we tell the extension which account it's capturing. No filter = no way to scope the capture to one account. |
| 4 | Confirm the GTT service-account key in `GTT_JSON/` is current and covers all three accounts' data | An expired or under-scoped key is the single most common GTT failure mode. Better to find an expired key now than mid-demo. |
| 5 | Get a fresh FuelIX demo API key if the Copilot panel (AI Why/Recommend/Draft) is part of the demo | Without it, the Copilot panel shows "not configured" instead of failing silently — better to know in advance whether it's in scope. |

---

## Phase 1 — Machine prep (before the machine leaves for the client site)

**Why this phase exists:** the Telus-provided machine needs the full stack installed and *proven to boot* before it's anywhere near the client. A broken `npm install` or missing dependency is a five-minute fix at your desk and a demo-ending problem on-site.

| # | Step | Why |
|---|------|-----|
| 6 | Install Python 3.12, Node 18+, Brave/Chrome on the machine; get the code onto it | Baseline requirements for both halves of the stack (frontend + backend). |
| 7 | `npm install` in `command-center/`, then `.env.local` with the FuelIX key | Frontend dependency install — this is the step most likely to hit network/proxy issues, so do it somewhere with reliable internet first. |
| 8 | Python venv + `pip install -r requirements.txt`, place the GTT key at the expected path | Backend dependency install + credential placement. |
| 9 | Load `verint_extension` unpacked in Brave/Chrome dev mode; confirm host permissions match the client's actual Verint subdomain | The extension's permissions are an exact match on domain — if the client's Verint URL differs from what's configured, capture silently fails with no error. Better to know the real subdomain in advance. |
| 10 | Full dry run of the stack *without* client Verint access — `local_api.py` on :5050, `npm run dev` on :5173, extension loads cleanly | This isolates "does our stack work at all" from "does it work against the client's specific environment" — two different failure classes that are much easier to debug separately. |

---

## Phase 2 — On-site, before the FDAEs touch the demo flow

**Why this phase exists:** the client's network and the client's real Verint account are both unknowns until you're physically there. This phase turns those unknowns into known-good (or known-broken-with-a-plan) states.

| # | Step | Why |
|---|------|-----|
| 11 | **Test outbound connectivity first**: from the client Wi-Fi, confirm the machine can reach Verint's cloud domain, the GTT API host, and FuelIX's API | This is the biggest open unknown in the whole plan. Corporate client networks commonly block or proxy outbound traffic. If any of these three is blocked, you need a fallback *decided calmly beforehand*, not improvised live: ask client IT for an exception, use a cellular hotspot, or fall back to the scripted A–D scenarios (which need no live connectivity at all). |
| 12 | Log into Verint with client credentials, apply Account 1's filter, confirm the extension badge increments | A badge stuck at 0 means the extension isn't seeing live traffic — usually because the Verint view is cached rather than making a fresh request. This is the fastest way to catch that before relying on it. |
| 13 | Repeat step 12 for Account 2 and Account 3, and confirm each account's GTT report returns *that account's* data | The failure mode here is silent and dangerous: a report can return successfully but contain the wrong account's numbers if the `functionalArea` mapping from Phase 0 is wrong. Always eyeball the numbers, don't just check for a 200 response. |
| 14 | Screenshot a known-good state per account | If something breaks mid-demo, having "here's what it looked like an hour ago" is a faster recovery than debugging live. |

---

## Phase 3 — Rehearsal (day before, on the actual machine, on client Wi-Fi if possible)

**Why this phase exists:** the individual pieces can each work and the *sequence* can still fail — switching between three accounts live is a new motion nobody has practiced yet.

| # | Step | Why |
|---|------|-----|
| 15 | Full run-through switching between all three accounts in one sitting, timing the switch (reapply filter → recapture → tab back to Command Center) | This account-switch is the step most likely to feel rough or slow live, purely because it's manual and has never been rehearsed as a sequence before. |
| 16 | Confirm the Verint session stays authenticated for the full demo length | Known issue: session tokens rotate/expire. A demo that starts fine and 401s halfway through is worse than one that never worked, because the audience has already engaged. |
| 17 | Confirm at least one person knows how to drop to the scripted scenarios (A–D) without the demo visibly stalling | This is the safety net for everything above. It should be a rehearsed move, not a "we'll figure it out" fallback. |

---

## Day-of checklist

- [ ] Machine powered on, on client Wi-Fi, outbound access to Verint / GTT / FuelIX confirmed
- [ ] Brave open, extension loaded and pinned
- [ ] `local_api.py` running on `:5050`, GTT key valid (not expired)
- [ ] `npm run dev` running on `:5173`
- [ ] Verint logged in, session fresh
- [ ] Account 1 (Epic Games): filter applied, capture verified, GTT report correct
- [ ] Account 2 (Roblox): filter applied, capture verified, GTT report correct
- [ ] Account 3 (Corelogic): filter applied, capture verified, GTT report correct
- [ ] Fallback (scripted scenarios) rehearsed and ready to switch to if live data breaks

---

## Open items to close before this is demo-ready

| Item | Owner | Status |
|------|-------|--------|
| Roblox / Corelogic GTT `functionalArea` values and Verint filter names | TBD | Open |
| Whether client site network allows the three required outbound connections | TBD — verify on-site | Open |
| Who does the Phase 0 account-selector work, and by when | TBD | Open |
| Ask Maximiliano: does GTT's employee master data also carry Verint's internal `workResourceDetails.id` anywhere? If so, we can build a Verint-id ↔ WorkdayID crosswalk and drop the fragile surname/fuzzy-name join in `gtt_verint_reconciler.py` entirely. (Verint's own captured data has no Workday ID or equivalent field — confirmed against real captures — so this only closes the loop if GTT's side already links the two.) | Mateus | Open — next week |
