# Connector Scenarios — which capture adapter, per environment

> **Read this with [CAPTURE_AND_DISPATCH_ADAPTERS.md](./CAPTURE_AND_DISPATCH_ADAPTERS.md).**
> That doc explains *what* the swappable capture/dispatch adapters are. This one
> answers the operational question: **for a given deployment, which capture adapter
> do we actually apply, and how many?**
> Companion roadmap: [NEXT_STEPS.md](./NEXT_STEPS.md).

---

## The mental model (the part that restores sanity)

> **You apply exactly *one* capture adapter per environment, chosen by *how Verint
> is reachable* there. Everything downstream — `verint_normalize` → `verint_triage`
> → `card_builder` → Command Center → dispatch — is identical regardless of which
> adapter fed it.**

You do **not** stack connectors for coverage. You pick the single one the access
situation allows, optionally with a fallback. So "how many connectors?" is really
"*which one*, and is it available in this environment?"

The two environments we care about differ only in **how the RTA reaches Verint**:
a locked **Citrix/VDI pixel stream** (CIBC) vs. a **normal browser** (EPIC_TISV on
Telus infrastructure).

---

## Scenario 1 — CIBC (Verint reached through Citrix / VDI)

**What the environment gives you:** a *pixel stream*. The browser and Verint run on
the remote VDI host; the RTA's local machine receives images — **no DOM, no API
traffic, no local page**. Plus the hard rule: data cannot be copied out of the VDI
session ([NEXT_STEPS.md:222-224](./NEXT_STEPS.md)).

**Does the bridge extension work here? → No, not as built.** The extension hooks the
page's own `fetch`/XHR inside a *local* Chrome and pushes to the Command Center in
the *same browser* via `postMessage`. In a Citrix pixel stream there is no local
page to inject into, no fetch/XHR to tee, and the Command Center is not in that
remote browser. (It could only run if Verint were a *browser inside* the VDI **and**
you were permitted to load an unpacked extension there **and** the Command Center
were reachable from inside the VDI — three things enterprise VDI normally forbids.)
Treat the extension as a Scenario-2 tool.

**Connectors that actually apply, ranked:**

1. **Verint REST API ("Track B")** — *the one to fight for.* A read-only API
   credential lets a **backend service** call Verint server-to-server and **bypass
   Citrix entirely**. The board deck calls this "the single most impactful access
   grant — it removes the Citrix constraint"
   ([generate_presentation.mjs:1759](../../POC/06_board_materials/generate_presentation.mjs)).
   *Status: designed, needs the credential.*
2. **Vision / OCR (Vision Agent, "Track A")** — the fallback when there is no API.
   Must run **inside the VDI** (capture screenshots in-session; emit only
   normalized, PII-minimized results — never raw pixels out). Needs the trained
   classifier first: baseline was 0/8 LOB codes, so 200–500 labelled CIBC screens
   ([NEXT_STEPS.md:228-229](./NEXT_STEPS.md)). *Status: fallback, not
   production-ready.*
3. **GScript / scheduled file export** — if CIBC can emit Verint exports, ingest
   those (batch/offline). *Status: designed, not built.*

**netcap** is out for the same reason as the extension — it needs a controllable
*local* browser and its network traffic, which a pixel stream doesn't expose.

**How the Command Center receives cards here:** a **backend push over WebSocket /
SSE** (the API path in [NEXT_STEPS.md:12-24](./NEXT_STEPS.md)), or a backend fed by
the in-VDI vision agent. **Not** the in-browser bridge.

**How many to make it operational:** **one primary** — REST API if granted,
otherwise Vision/OCR — optionally with vision as a fallback behind the API.

> ⚠️ **Honest status:** nothing is proven operational against CIBC/Citrix yet. The
> extension that *is* proven (Scenario 2) does **not** carry over to Citrix.

---

## Scenario 2 — EPIC_TISV (Verint on Telus infra, reached in a normal browser)

**What the environment gives you:** a real browser with a real DOM and real API
traffic — the "just a browser" case.

**Does the bridge extension work here? → Yes — proven end-to-end.** On live EPIC,
`inject.js` captured the live `calendar-filter` and **12 real EPIC cards reached the
Command Center** with the LIVE banner, no manual click (Part 2 dry-run PASSED
2026-06-05; see [OBSERVABILITY_DRY_RUN.md](./OBSERVABILITY_DRY_RUN.md)).

**Connectors that apply:**

1. **Browser extension (RTA Live Bridge)** — proven, live. The demonstrated path.
2. **netcap (Playwright / CDP)** — proven on real EPIC data; good for repeatable /
   headless capture.
3. **Verint REST API** — available if a Telus-side credential is granted.
4. **GScript / export** — possible.

**How the Command Center receives cards here:** the **in-browser `postMessage`
bridge** (same-browser; PII stays local). *Caveat:* same-browser by design — for a
multi-machine deployment add a networked relay (the production answer). For a demo,
run Verint + Command Center + extension on one machine, or validate via the
extension popup.

**How many to make it operational:** **one — the extension by itself.** It already
does capture → bridge → cards. Optionally enable the timed re-trigger (Phase B,
already wired) for idle-window freshness.

---

## The matrix

| Capture adapter | CIBC (Citrix / VDI) | EPIC_TISV (Telus, browser) | Build status |
|---|---|---|---|
| **Verint REST API (Track B)** | ✅ **Best** — server-side, bypasses Citrix | ✅ if credentialed | 🔓 needs credential |
| **Browser extension (Live Bridge)** | ❌ no — pixel stream, no local DOM | ✅ **proven live** | ✅ built & verified |
| **netcap (Playwright / CDP)** | ❌ no — needs local browser + network | ✅ proven | ✅ proven on EPIC |
| **Vision / OCR (Track A)** | ⚠️ **fallback** — inside VDI, needs training | (unnecessary) | ⚠️ baseline only |
| **GScript / file export** | 🔓 if exports available | 🔓 possible | 🔓 designed |

---

## The deciding variable (the escape hatch)

The thing that determines Scenario 1 is **not where Verint is hosted** — the
`wfo.a87` Telus tenant already serves CIBC alongside EPIC. It is:

1. **whether RTAs reach Verint through Citrix**, and
2. **whether we can get a server-side, read-only Verint REST credential.**

> **A read-only REST credential collapses Scenario 1 into "Scenario 2 easy":**
> capture runs server-side, Citrix on the RTA's desktop becomes irrelevant to
> *capture*, and no extension or vision pipeline is needed. **That credential is the
> single highest-leverage thing to chase for CIBC.**

---

## How the Command Center receives cards (3 mechanisms, environment-independent)

The same `CommandCard` shape arrives by one of three transports, depending on the
adapter:

| Transport | Used by | Notes |
|---|---|---|
| **In-browser `postMessage` bridge** | Browser extension | Same-browser; PII local; demo + single-machine |
| **Backend push (WebSocket / SSE)** | REST API, vision-agent backend, networked relay | The production transport |
| **Static scenario import** | netcap, offline export | Build a scenario file, load in the Command Center |

Dispatch (where approved alerts go *out* — Google Chat / Teams / ServiceNow /
audit-only) is **independent of the capture environment**; see
[CAPTURE_AND_DISPATCH_ADAPTERS.md](./CAPTURE_AND_DISPATCH_ADAPTERS.md).

---

## Bottom line

- **One capture adapter per environment.** The core, the Command Center, and
  dispatch never change.
- **EPIC_TISV / Telus-browser is the solved case** — one connector (the extension)
  already makes it operational.
- **CIBC / Citrix is hard only because of the access path** — and the clean fix is a
  **read-only Verint REST credential**, which removes Citrix from the capture
  equation. Without it, the path is the Vision/OCR fallback, which still needs the
  classifier trained.

## See also
- [CAPTURE_AND_DISPATCH_ADAPTERS.md](./CAPTURE_AND_DISPATCH_ADAPTERS.md) — the adapter model.
- [NEXT_STEPS.md](./NEXT_STEPS.md) — Verint connector, Track A/B, VDI constraints.
- [OBSERVABILITY_DRY_RUN.md](./OBSERVABILITY_DRY_RUN.md) — the live EPIC proof (Scenario 2).
