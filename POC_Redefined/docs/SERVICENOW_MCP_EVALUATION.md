# Evaluating `servicenow-mcp` for the RTA Command Center

> **What this is:** a go/no-go evaluation of the open-source
> [echelon-ai-labs/servicenow-mcp](https://github.com/echelon-ai-labs/servicenow-mcp)
> server as the way we connect the Command Center to ServiceNow.
> **Audience:** technical leads planning the Phase 3 ServiceNow connector.
> **No code changes** were made for this evaluation — it is a recommendation only.

---

## TL;DR — Recommendation

**Do not adopt the MCP server as the runtime path for the ServiceNow dispatch
connector. Build the thin, deterministic REST connector that
[`NEXT_STEPS.md`](./NEXT_STEPS.md) Phase 3 already specifies.** Then extract real
value from the repo in three smaller ways:

| # | Decision | Verdict |
|---|----------|---------|
| 1 | Use `servicenow-mcp` as the **runtime dispatch connector** | ❌ **No** — wrong shape (see *The architectural fork*) |
| 2 | Mine it as a **reference implementation** (auth flows, field mappings, call shapes) | ✅ **Yes** — MIT licensed, saves discovery time |
| 3 | Run it as a **dev/ops tool** during build & demos (Claude/Cursor → PDI) | ✅ **Yes, optional** — throwaway, off the product path |
| 4 | Keep MCP for the **future agentic copilot layer** (Option C gateway) | 🕒 **Later** — Phase 8+, not Phase 3 |

The one-line reason: an MCP server exists so that *an LLM can choose which tool to
call from natural language*. Our dispatch step is the opposite — a single,
predictable, auditable `POST /api/now/table/incident` fired by a button click.
Wrapping a REST API in an MCP/JSON-RPC layer to make a deterministic call adds an
extra in-network service to harden and audit, for no benefit on this path.

---

## What the repo is

`servicenow-mcp` is a Model Context Protocol server that wraps the ServiceNow REST
API and exposes it as MCP tools an AI client can call.

| Attribute | Detail |
|-----------|--------|
| **Language / runtime** | Python 3.11+ |
| **License** | MIT (permissive — safe to read, borrow, and vendor with attribution) |
| **Auth methods** | Basic (user/password), OAuth (client id/secret + token URL), API key |
| **Capability surface** | Incidents, change requests, service catalog, knowledge base, user/group management, workflows, script includes, changesets/update sets, agile (stories/epics), UI policies |
| **Clients** | Claude Desktop, MCP CLI, Cursor; also an **SSE server mode** for web integration |
| **Config** | `.env` (`SERVICENOW_INSTANCE_URL`, `SERVICENOW_USERNAME`, `SERVICENOW_PASSWORD`, `SERVICENOW_AUTH_TYPE=basic`) + an MCP client registration |
| **Requires** | A reachable ServiceNow instance with API access |

It is a capable, broad wrapper. Our POC, by contrast, needs roughly **one**
endpoint to start: incident create (and later, status read).

---

## Where ServiceNow fits in the POC today

ServiceNow is a **designed-but-unbuilt** slot in two places, and it appears in the
UI today only as labels and demo placeholders:

- **Dispatch adapter** — listed "🔓 Future (process #5)" in
  [`CAPTURE_AND_DISPATCH_ADAPTERS.md`](./CAPTURE_AND_DISPATCH_ADAPTERS.md).
- **Phase 3 connector** — [`NEXT_STEPS.md`](./NEXT_STEPS.md) (lines 87–101)
  specifies a REST connector against `/api/now/table/incident`: the backend calls
  it when the RTA clicks *"Open ticket" / "Create ServiceNow follow-up,"* stores
  the returned `INC-XXXXX` in the card audit trail, and polls status.

The type system already reserves the slots:

- `CardAction` includes `"create-servicenow-follow-up"` — `src/domain/types.ts:149`
  (surfaced as the **"Open ticket"** label in `src/utils/cardHelpers.ts:154`).
- `TargetChannel` includes `"servicenow"` — `src/domain/types.ts:174`, with the
  explicit production note `"servicenow" → ServiceNow REST API` at
  `src/domain/types.ts:163`.
- A whole process axis exists for it: `ProcessId` value `"tickets-exceptions"`
  ("ABD 5: ServiceNow Ticket Processing") — `src/domain/types.ts:129`.

And it is **only labels** today:

- `src/data/fixtures.ts:218` — the `card-servicenow` card carries the source label
  *"ServiceNow live queue not connected."*
- `src/data/scenarios.ts:1040` — the *TKT-8823 (Tech Outage Fraud ITR)* card is a
  `dataClass: "future-integration"` placeholder: *"ServiceNow not yet integrated…
  card is a demo placeholder."*
- `runCardAction()` (`src/App.tsx:353`) currently only mutates local React state
  (status, audit, learning signal, dispatch log) — there is **no network call** on
  any dispatch action yet. That single function is the entire integration
  touch-point the connector will extend.

---

## The architectural fork (why the shape matters)

There are two fundamentally different ways to connect to ServiceNow, and they are
not interchangeable:

**A. Deterministic REST connector** *(what NEXT_STEPS Phase 3 describes — our chosen runtime path)*
```
RTA clicks "Open ticket"
  → frontend POSTs /api/dispatch { cardId, channel: "servicenow", payload }
    → backend maps card → ITIL fields, POSTs /api/now/table/incident (secret held server-side)
      → ServiceNow returns INC-XXXXX
        → backend stores it in the card audit trail; polls status periodically
```
One code path. Same inputs → same call, every time. Fully auditable. ~a few
hundred lines in the backend the POC is already going to build.

**B. LLM-driven via MCP** *(what the MCP server is built for)*
```
LLM reads context
  → decides "I should file an incident" and which MCP tool + arguments to use
    → MCP client invokes the servicenow-mcp tool over JSON-RPC/SSE
      → the Python MCP server translates that into the ServiceNow REST call
```
The value of MCP is the *model's discretion* — letting an LLM pick among dozens of
tools (incident, change, catalog, KB…) from natural language. That value is
exactly what we **don't** want on the dispatch path, where the RTA's button press
must map to one known action with no model in the loop.

Using the MCP server for path A means standing up a Python MCP process whose only
job is to expose tool schemas to an LLM — then bypassing the LLM and driving it
programmatically. You'd be wrapping a REST API in a tool-call protocol to make a
single REST call. That's strictly more moving parts than calling
`/api/now/table/incident` directly.

This fork also rhymes with the **"Option C — MCP gateway"** future-state note
already in `src/services/fuelixClient.ts:28-30` — but that note is about routing
*AI model* calls through an in-network MCP gateway, not about deterministic
ticketing. See *Future agentic layer* below.

---

## Evaluation against CIBC constraints

| Dimension | Direct REST connector (A) | `servicenow-mcp` at runtime (B) |
|-----------|---------------------------|----------------------------------|
| **Secret handling** | Credentials live server-side in the backend we already build. Matches the lesson in `NEXT_STEPS.md:48-49` (webhook/API secrets must never reach the browser). | Same secrets, but now held by an *additional* service that must also be secured. |
| **In-network requirement** | One backend service inside the CIBC network. | A second long-running Python service to deploy, patch, and keep in-network. |
| **Supply-chain surface** | Our code + the ServiceNow SDK/HTTP client. | A third-party repo + its transitive deps in the runtime trust boundary. (MIT helps for *reading*; running it is a different risk.) |
| **Scope fit** | Implement exactly the 1–2 endpoints we need. | Ships incident/change/catalog/KB/agile/script-includes — most of it dead weight and extra attack surface for our use. |
| **Auditability** | Deterministic 1:1 mapping from action → REST call → stored `INC-XXXXX`. Trivial to log and review. | Indirect through a tool-call layer; auditing means tracing JSON-RPC invocations. |
| **Operability / effort** | Folds into the Phase 3 backend already on the roadmap (2–3 sprints, per NEXT_STEPS). | Adds a service to run + the connector logic anyway. Net more to operate. |
| **License** | n/a | ✅ MIT — safe to read, borrow code, vendor patterns. |

**Net:** on every dimension that matters for a deterministic ticketing step, the
direct REST connector is equal-or-better. The MCP server's strengths (breadth,
model-driven tool selection) are not strengths *here*.

---

## Recommendation in detail

### 1. Runtime — build the thin REST connector (not the MCP server)
Implement Phase 3 as written in `NEXT_STEPS.md`:
- Backend `/api/dispatch` branch for `channel: "servicenow"` →
  `POST /api/now/table/incident` with credentials held server-side.
- Map the card → ITIL fields (`short_description`, `description`, `category`,
  `assignment_group`, `urgency`/`impact`); store the returned `INC-XXXXX` in the
  card audit trail (the slot `runCardAction()` already maintains).
- Add a lightweight status poll to reflect ServiceNow state back on the card.
- This lights up the existing `"create-servicenow-follow-up"` action and
  `"servicenow"` channel — no new type-system work, just the network call.

### 2. Reference — mine the repo (don't run it)
Because it's MIT, read `servicenow-mcp` to **shortcut discovery**:
- Confirm the exact incident create/read request and response shapes.
- Copy its auth patterns (basic / OAuth / API-key) — likely OAuth or API-key for
  CIBC rather than basic.
- Lift its ITIL field mapping into our connector's design ticket so we don't
  rediscover the table API field names.

### 3. Dev/ops — optional, during build & demos only
Register `servicenow-mcp` with Claude Desktop or Cursor pointed at a **free
ServiceNow Personal Developer Instance (PDI)** to:
- Seed realistic incidents for demos, inspect tickets, and validate our field
  mappings — without building UI for any of it.
- Keep this strictly **off the product runtime path**; it's a throwaway
  developer convenience.

### 4. Future — revisit MCP for the agentic layer
If/when the copilot graduates from *explain / recommend / improve-draft* (its
scope today in `fuelixClient.ts`) to **taking actions** on the RTA's behalf, an
**in-network MCP gateway** becomes the right pattern — and this repo is a real
head start. That is the "Option C" future-state, Phase 8+ territory, and a
separate decision from the Phase 3 ticketing connector.

---

## "But what if we still want MCP at runtime?"

Honest caveats, so the option is on the record:
- It is **technically possible** — `servicenow-mcp` has an SSE server mode, so the
  backend could call it over HTTP without a desktop client.
- You can drive MCP tools **without an LLM**, but then you're hand-constructing
  JSON-RPC tool calls — i.e., wrapping a REST API in a second protocol to make the
  same REST call. You gain nothing and add a hop.
- The only scenario where runtime MCP pays off is decision #4 (a model genuinely
  choosing the ServiceNow action). That's not the dispatch connector.

---

## Suggested next actions

- [ ] File the **Phase 3 ServiceNow REST connector** as the work item (per
  `NEXT_STEPS.md:87-101`); explicitly note "direct REST, not MCP server" with a
  link to this doc.
- [ ] Sign up for a free **ServiceNow PDI**; validate the
  `/api/now/table/incident` request/response shape and confirm the ITIL field
  mapping.
- [ ] Lift `servicenow-mcp`'s field-mapping + auth patterns into the connector
  design ticket (MIT — attribute it).
- [ ] (Optional) Register `servicenow-mcp` against the PDI in Cursor/Claude for
  demo-data seeding; document it as a dev tool, not a runtime dependency.
- [ ] Add MCP-as-action-gateway to the **Phase 8+** backlog, cross-referencing the
  "Option C" note in `fuelixClient.ts`.

---

## See also
- [NEXT_STEPS.md](./NEXT_STEPS.md) — Phase 3 ServiceNow REST connector spec.
- [CAPTURE_AND_DISPATCH_ADAPTERS.md](./CAPTURE_AND_DISPATCH_ADAPTERS.md) — the
  swappable dispatch-adapter model ServiceNow plugs into.
- `src/domain/types.ts` — `CardAction` / `TargetChannel` / `ProcessId` slots.
- `src/services/fuelixClient.ts` — the "Option C — MCP gateway" future-state note.
