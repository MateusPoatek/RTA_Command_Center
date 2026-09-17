*Audience: architects, engineers, security reviewers · Purpose: how the WFM Automation Platform is built — the C4 model from context to component, the runtime sequence, the trust boundaries, and the identity flow.*

---

# Volume 3 · Technical Architecture

> Traces to principle(s): **P1** (no AI write path), **P2** (adapter-blind rules core), **P4** (cloud-neutral seams, GCP-first), **P5** (human-in-the-loop before any external write) — see [package README](../README.md#architecture-principles--brd-constraint-map).
> Source of truth: [SYSTEM_ARCHITECTURE.md](../../docs/engineering/SYSTEM_ARCHITECTURE.md), [SECURITY_ARCHITECTURE.md](../../docs/engineering/SECURITY_ARCHITECTURE.md), [CONNECTOR_CATALOG.md](../../docs/engineering/CONNECTOR_CATALOG.md). This chapter elevates, it does not restate.

## Summary

The platform is one C4 system: a single-tenant deployable image that turns Verint (and future WFM sources) into human-reviewed `CommandCard`s. Zooming in — context (D-09) → container (D-10) → component (D-11) — the same invariant holds at every level: capture is swappable, the rules core is adapter-blind (P2), and nothing reaches an external system without a human approval (P5). The runtime sequence (D-12) and trust-boundary map (D-13) show where that gets enforced in code; the identity flow (D-14) shows how every request is scoped to one tenant and one authenticated role.

## From context to component (D-09 → D-11)

**D-09 — C4 Context** places the platform among the people and external systems it touches: the RTA Analyst, Supervisor, Operations Manager, and Platform Admin on one side; Verint (system of record), GTT (planned attendance source), ServiceNow, and chat channels on the other. The platform *recommends*; humans and external systems receive only what a human has approved for dispatch (P1/P5).

**D-10 — C4 Container** zooms into that system box: capture adapters feed the API Gateway, which forwards validated data into the rules core; the Command Center SPA renders cards over a push service; dispatch workers deliver approved cards; and five cloud-neutral seams (Secret Vault, Operational + Audit Store, Intelligence Store, LLM Endpoint, Runtime + Gateway) are the only places the system binds to a specific cloud (P4). One OCI image serves every tenant — see [SYSTEM_ARCHITECTURE.md §3–4](../../docs/engineering/SYSTEM_ARCHITECTURE.md#3-the-five-cloud-neutral-seams-d2).

**D-11 — C4 Component** zooms further into the Rules Core Service container: `verint_normalize → verint_triage → card_builder`, adapter-blind by construction (P2) — the API Gateway forwards `AgentRow[]` from whichever capture adapter is active, and the core never knows which one it was. Every `CommandCard` this pipeline builds starts `pending_review`; the LLM Subsystem is wired in as a backend-proxied advisory/draft call with no write credential (P1), and nothing exits that state until the RTA Analyst acts (P5).

| Level | Diagram | Concretely shows |
|---|---|---|
| Context | D-09 | Who/what surrounds the platform; dispatch only reaches externals post-approval (P1/P5) |
| Container | D-10 | Swappable capture/dispatch either side of the adapter-blind core (P2); the five seams as the only cloud-bound interfaces (P4) |
| Component | D-11 | The `normalize → triage → card_builder` pipeline; the `pending_review` gate (P5); the LLM as a no-write-credential component (P1) |

![D-09 C4 Context](../diagrams/output/D-09-c4-context.png)

![D-10 C4 Container](../diagrams/output/D-10-c4-container.png)

![D-11 C4 Component](../diagrams/output/D-11-c4-component.png)

## Runtime sequence (D-12)

D-12 traces one alert end-to-end across six phases:

1. **Capture** — a capture adapter (extension shown; REST/Vision/netcap/file-export are equivalent, P2) reads Verint read-only and posts `AgentRow[]` to the gateway, which validates it against the contract.
2. **Normalize / triage** — the adapter-blind core normalizes, triages against Verint's own out-of-adherence verdict, and runs multi-source confirmation (OOA verdict + native notifications + card-shape match + LOB-chat routing); agreement or disagreement is logged either way.
3. **Card build** — the core asks the LLM Subsystem for draft copy only; the LLM returns text with no write credential and no target-system access (P1); `card_builder` produces a `CommandCard` in `pending_review`.
4. **Persist + push** — the card is written to the append-only Operational + Audit Store and streamed to the Command Center SPA.
5. **Human-in-the-loop gate (P5)** — the RTA approves, edits, suppresses, or escalates; nothing dispatches until this happens, and the decision is itself an audited event with `actor = "rta"`.
6. **Dispatch** — only approved cards fan out (ServiceNow, chat, etc.); the outcome is written to the audit trail.

![D-12 Sequences](../diagrams/output/D-12-sequences.png)

## Trust boundaries (D-13)

D-13 draws four trust zones and the crossings between them: the RTA's browser (untrusted client code), the API Gateway (the single ingress seam, P4), the tenant-isolated cloud runtime (rules core, LLM subsystem, dispatch, audit store, vault), and external systems (Verint, GTT, ServiceNow, chat). Four boundary crossings carry the enforcement load:

| Crossing | Enforced by |
|---|---|
| 1. Browser → API Gateway | OIDC bearer token + MFA/step-up, validated against the API contract |
| 2. API Gateway → Cloud Runtime | Only validated, contract-shaped `AgentRow[]` passes; mTLS to internal services |
| 3. Runtime → Secret Vault | Managed identity; credentials read by reference, never as values |
| 4. Dispatch → External Systems | Only after human approval (P5); deterministic RPA/API write, never AI-initiated |

The LLM subsystem sits in its own read-only sub-zone inside the cloud runtime — prompt/response only, no write credential (P1) — so a prompt-injection or model failure has no path to an external mutation regardless of what the model outputs.

![D-13 Trust Boundaries](../diagrams/output/D-13-trust-boundaries.png)

## Identity flow (D-14)

D-14 is the concrete OIDC sequence behind Crossing 1: the RTA authenticates against the client's IdP (Entra/Azure AD for a bank-tier client) via authorization-code + PKCE, completes an MFA challenge (with step-up for high-risk actions per [SECURITY_ARCHITECTURE.md §3](../../docs/engineering/SECURITY_ARCHITECTURE.md)), and the SPA holds only the resulting tokens — no OIDC secret ever reaches the browser. Every subsequent API request carries the bearer token; the gateway validates signature/expiry/issuer, checks the role claim against RBAC, and scopes the session to the `tenant_id` claim before forwarding to the core. That last step is P3's per-tenant isolation enforced at the identity layer: a valid token for one tenant cannot read another tenant's `CommandCard`s.

![D-14 Identity Flow](../diagrams/output/D-14-identity-flow.png)

## Diagrams

| D-ID | What it shows |
|------|---------------|
| D-09 | C4 Context — the platform among its personas and external systems |
| D-10 | C4 Container — capture/core/dispatch plus the five cloud-neutral seams |
| D-11 | C4 Component — the adapter-blind normalize→triage→card_builder pipeline and the `pending_review` gate |
| D-12 | Sequences — capture → normalize/triage → card build → HITL approve → dispatch |
| D-13 | Trust Boundaries — browser, gateway, cloud runtime, external systems, and the four boundary crossings |
| D-14 | Identity Flow — OIDC/MFA authentication, RBAC, and per-tenant session scoping |

## References

| Topic | Source of truth | Relationship |
|-------|-----------------|--------------|
| Production system architecture, spine, seams, component model | [SYSTEM_ARCHITECTURE.md](../../docs/engineering/SYSTEM_ARCHITECTURE.md) | extends |
| Identity, OIDC, MFA, gateway, secrets, threat model | [SECURITY_ARCHITECTURE.md](../../docs/engineering/SECURITY_ARCHITECTURE.md) | extends |
| Capture/dispatch adapters, integration topologies, fail-prevention | [CONNECTOR_CATALOG.md](../../docs/engineering/CONNECTOR_CATALOG.md) | extends |
| Requirements & constraints | [BRD_RTA_Command_Center_Phase1.md](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md) | references |

<!-- Status: 🟢 drafted/reviewed -->
