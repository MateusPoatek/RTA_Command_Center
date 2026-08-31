*Audience: front-end, back-end, and integration engineers. Purpose: the versioned contract between every component.*

> **⚪ STATUS: DEFERRED (this pass).** The API specification is intentionally **not** written yet — the architecture should settle first (decided with Mateus this session). This placeholder fixes the intended shape and the entry point so the next session can start cleanly. Until then, the de-facto contract is the TypeScript domain model in [../../command-center/src/domain/types.ts](../../command-center/src/domain/types.ts) and [../../command-center/src/domain/scenario_types.ts](../../command-center/src/domain/scenario_types.ts).

---

# API Specification (deferred)

## Intended contents (next pass)

1. **Three contracts**
   - **REST** (`contracts/openapi.yaml`) — control plane (tenant manifest CRUD, connector registry, preflight/health, promotion), dispatch (`POST /dispatch`), signals (`POST /signals`), and the audit query (including the governance query "writes where actor=ai").
   - **Push** (`contracts/asyncapi.yaml`) — the `CardEvent` stream over WSS/SSE: reconnection, ordering, idempotency keys (the `live-{ts}` card-id format).
   - **Domain schemas** — `CommandCard`, `AgentRow`, `AuditEvent`, `LearningSignal`, `DispatchEntry`, `LOBHealth`, frozen as **versioned** JSON Schemas, each citing its source `.ts` interface.

2. **Versioning & compatibility** — semver on the contract; additive-only within a major; the `processId`-optional precedent in `types.ts` is the compatibility model; backend supports N and N-1 during a rollout window.

3. **Authentication** — how OAuth2/OIDC tokens are presented (links to [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md)).

4. **Upstream (Verint) contracts** — `calendar-filter` (+ companions), `work-resources`, `activities`, and Track B `/api/v1/realtime/adherence` — documented as **consumed**, not owned.

5. **Error model** — exception cards (`confidence: 0.0` → HITL) as a first-class API outcome when a row won't normalize.

6. **Source-of-truth & codegen policy** — `types.ts` stays canonical for the TS client; OpenAPI generates server stubs; how drift is prevented.

## Natural home

The control-plane REST surface is described in prose in [FDAE_CONFIGURATION_LAYER.md](./FDAE_CONFIGURATION_LAYER.md); formalizing it into `contracts/openapi.yaml` is the recommended first step when this document is picked up.
