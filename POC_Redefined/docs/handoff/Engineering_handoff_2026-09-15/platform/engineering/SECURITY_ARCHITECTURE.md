*Audience: security reviewers + platform engineers. Purpose: the security posture across both deployment topologies — identity, OAuth2/OIDC, MFA, API gateway, secrets, network, and the threat model.*

> The auth sequence diagram (`07-auth-oauth-mfa-sequence.mmd`) is planned to ship alongside this document but does not exist yet — track it as a follow-up, not an implicit reference.

---

# Security Architecture

## 1. Trust model & boundaries

The system has exactly two deployment topologies (see [SYSTEM_ARCHITECTURE.md §4](./SYSTEM_ARCHITECTURE.md) and [CONNECTOR_CATALOG.md §5](./CONNECTOR_CATALOG.md)), and the security posture forks at that same seam:

- **Topology A — in-client-cloud (bank-tier).** The whole stack — gateway, rules core, stores, vault — deploys into the client's own cloud/VPC, single-tenant, behind the client's own identity provider and network controls. The vendor retains nothing in the runtime data path: no vendor-side copy of cards, credentials, or audit events. This is the required topology for restricted/regulated clients (bank-tier). Trust boundary: the client's cloud perimeter *is* the security boundary; everything inside it is subject to the client's own controls (network policy, key management, SIEM), and the vendor's obligation is to deploy correctly inside that boundary, not to defend it from outside.
- **Topology B — vendor-hosted.** The stack runs on vendor infrastructure, isolated per tenant (see [DATA_GOVERNANCE_AND_MULTITENANCY.md §2](./DATA_GOVERNANCE_AND_MULTITENANCY.md)). Trust boundary: the vendor's own network perimeter and tenant-isolation controls, with the client trusting the vendor's operational security rather than owning the runtime.

A third boundary sits upstream of both topologies and is treated as a security boundary in its own right, not just a UX constraint: **the Citrix/VDI egress boundary** for `none`-access clients. When Verint is reachable only as a pixel stream (Topology B of the capture split in CONNECTOR_CATALOG §5 — vision/OCR in-VDI), the rule is **no copy-out**: raw screenshots and raw pixel data never leave the VDI session. Only PII-minimized, normalized `AgentRow[]` rows cross the boundary, via an approved egress path (a VDI-compatible agent, or email to a Telus address — never an ad hoc file share). This is the same boundary CONNECTOR_CATALOG §5 describes for capture; here it is called out explicitly as a security control, because "no raw pixel egress" is doing real work: it bounds what an attacker (or a misconfigured pipeline) could exfiltrate even if the capture path itself were compromised.

Where the read-only Verint REST API is available (Topology A of the capture split), the VDI boundary becomes irrelevant to capture entirely — there is no screen, no OCR, no PII-minimization step to get right, because the credential is GET-only by construction (§8).

## 2. Identity & authentication (OAuth2 / OIDC)

The POC has no authentication at all — the SPA is a single unauthenticated browser session with no login, no session, no way to know who is looking at a card. Production replaces this with federation to the client's own identity provider (Entra/Azure AD for a bank-tier client, or the equivalent for a vendor-hosted tenant) using standard OIDC.

- **The SPA authenticates via the OIDC authorization-code flow** (with PKCE — no implicit flow, no tokens ever placed in a URL fragment or query string). The Command Center never collects a username/password itself; it redirects to the client IdP and receives back an ID token + access token.
- **Session model:** the access token is short-lived and used as a bearer credential against the API gateway (§5); refresh happens via the IdP's standard refresh-token or silent-renew flow, not via a long-lived session cookie the frontend manages itself.
- **Service-to-service auth** (capture workers → gateway, dispatch workers → gateway, control plane → data plane) uses OAuth2 client-credentials grants against the same IdP (or a workload-identity equivalent in cloud-native deployments), never shared static API keys between internal services.

This directly replaces the POC's zero-auth state: every request that reaches the rules core or the stores now carries a verified identity, and that identity is what §4's authorization checks and §11's audit trail are keyed on.

## 3. 2FA / MFA

MFA is enforced at the client IdP, not re-implemented in this product — the Command Center inherits whatever second factor the client already requires for its workforce (push, TOTP, hardware key), so there is no separate MFA secret store to secure or lose.

On top of baseline login MFA, the product adds **step-up authentication** for actions whose blast radius is materially larger than "look at a card": dispatching an alert to a live LOB channel, escalating a card, and promoting a configuration change (tenant manifest edits, rule-threshold changes) to a live environment. Step-up is enforced at the API gateway (§5) by requiring a fresh (recent `auth_time`) or elevated-assurance-level token on those specific endpoints — a session that authenticated 6 hours ago cannot promote a config change without re-proving presence. This mirrors the RBAC principle in §4: the higher the consequence of an action, the more the system asks the human to reconfirm they're the one taking it.

## 4. Authorization / RBAC

The POC's authorization model is "any browser can take any action" — there's no server to say no, because there's no server. Production fixes this by making **every action server-side-authorized**, with no client-only gate that a curious or malicious user could bypass by editing local state or replaying a request.

Roles come from the PRD personas — RTA, supervisor, Operations Manager, FDAE admin — and are mapped to groups in the client IdP rather than reinvented as a product-local user table. The gateway resolves the caller's groups on every request and checks them against the action being requested:

| Persona | Representative actions |
|---|---|
| RTA | review cards, approve/edit/suppress a draft, dispatch to a LOB channel |
| Supervisor | RTA actions + escalate, view cross-LOB rollups |
| Operations Manager | read-only rollups, no dispatch |
| FDAE admin | tenant manifest edits, rule-threshold changes, connector configuration |

Least privilege applies at both the human and the service level: an RTA's token cannot promote a manifest change even if they guess the endpoint, and the rules-core service's own credential can read `AgentRow[]` and write `CommandCard[]` but holds no write credential to Verint, Chat, or ServiceNow (that authority lives only with the dispatch/RPA channel — see §8's governance tie-in). This is the same "no ambient authority" posture as the write-path invariant in [SYSTEM_ARCHITECTURE.md §7](./SYSTEM_ARCHITECTURE.md): authorization is checked per-action, per-actor, every time, not granted once and assumed forever.

## 5. API gateway

The API gateway is the single ingress seam for the entire product — every capture adapter, every SPA request, and every dispatch trigger passes through it, and nothing reaches the rules core or the stores by any other path. Concretely, the gateway is responsible for:

- **TLS termination** at the edge.
- **OIDC token validation and introspection** — every request's bearer token is checked against the IdP (or a cached introspection result with a short TTL); an expired, forged, or revoked token is rejected before it reaches application code.
- **MFA / step-up enforcement** for the elevated-risk actions listed in §3.
- **RBAC** — the role check described in §4, enforced centrally rather than duplicated (and potentially forgotten) in each service.
- **Rate-limiting**, to bound both accidental retry storms from capture workers and deliberate abuse.
- **Request validation against the API contract** ([API_SPECIFICATION.md](./API_SPECIFICATION.md)) — malformed or unexpected payloads are rejected at the edge rather than trusted into the rules core.
- **mTLS to internal services** — once a request is admitted, gateway-to-service traffic is mutually authenticated, so a compromised internal network segment can't inject requests that impersonate the gateway.

The gateway is a cloud-neutral concept, not a specific product: it is realized as Azure APIM, AWS API Gateway, Apigee, or a self-managed gateway container depending on the runtime seam ([SYSTEM_ARCHITECTURE.md §3](./SYSTEM_ARCHITECTURE.md)), and its behavior — not its brand — is what this section specifies.

## 6. Secrets management

The vault is the fifth cloud-neutral seam (D2) and holds every credential the product depends on: the Verint read-only service-account credential, dispatch webhook URLs (Google Chat, Teams, ServiceNow), the LLM API key or endpoint credential, and the OIDC client secret. All of these are held **by reference** — the running service fetches them at runtime via a managed identity / workload identity, and no secret is ever baked into the container image or checked into configuration alongside it.

This section exists specifically to close a real issue found in the POC. `command-center/src/services/fuelixClient.ts` calls the FuelIX API directly from the browser, reading its key from `VITE_FUELIX_API_KEY`. Vite embeds any `VITE_`-prefixed environment variable directly into the browser JavaScript bundle at build time, which means the key is visible to anyone who opens DevTools → Sources — acceptable for an internal demo, not acceptable once this handles a real client's data. The fix is one of the three options the client already documents inline in that file and in [../NEXT_STEPS.md](../NEXT_STEPS.md):

- **Backend proxy** — the browser calls `/api/ai-chat`; the backend holds the key and forwards to the LLM endpoint after validating the caller's session. (Recommended; see §9 for how this generalizes to the per-client LLM options.)
- **Managed-identity-issued tokens** (e.g. Azure AD tokens against an in-tenant Azure OpenAI deployment) instead of a static shared key at all.
- **An MCP gateway** inside the client network, so the browser never contacts an external AI provider directly.

The same pattern already exists correctly elsewhere in this codebase and should be the template: `local_api.py`'s `/dispatch-alert` endpoint proxies the Google Chat webhook server-side specifically because the webhook URL is itself a bearer credential (it carries a `key=` query parameter) — if the frontend called Chat directly, that credential would ship in the bundle exactly like the FuelIX key does today. The rule going forward is unconditional: **no secret in the image, no secret in a `VITE_`-prefixed (or equivalent client-bundled) variable, ever** — every credential-bearing call to an external system is made server-side, from a service that fetched its credential from the vault at runtime.

Rotation is a vault-native operation (rotate at the provider, the running service picks up the new value on its next fetch/TTL expiry without a redeploy), and every rotation event is written to the audit log (§11) as rotation-evidence — a reviewer can prove a credential was rotated on schedule, not just assert it.

## 7. Network & VPC

Network topology is per-deployment, following the same fork as §1:

- **In-client-cloud (bank-tier) deployments** have **no public ingress**. The gateway is reachable only from the client's own network (VPN, private link, or an internal load balancer), and all internal service-to-service traffic (gateway ↔ rules core ↔ stores ↔ vault) rides private endpoints inside the client's VPC — never the public internet, even encrypted.
- **Vendor-hosted deployments** front the gateway with a public endpoint (still TLS-terminated, still behind the auth stack in §2/§5), but each tenant's data-plane services and stores remain on private networking, isolated per the tenancy model in [DATA_GOVERNANCE_AND_MULTITENANCY.md §2](./DATA_GOVERNANCE_AND_MULTITENANCY.md).

Both topologies apply **default-deny egress with explicit allow-listing** — a capture worker or dispatch worker can only reach the specific external hosts it needs (the Verint API host, the Chat/Teams/ServiceNow endpoints, the LLM endpoint), not the open internet. This bounds the damage of a compromised dependency: even a fully hijacked worker process cannot exfiltrate data to an arbitrary destination.

For `none`-access, VDI-limited environments, network policy also enforces the capture-side constraint from §1 at the infrastructure level, not just the application level: **no raw VDI pixel egress**. The in-VDI vision agent's only permitted network path out is the approved egress channel (§1, §8) carrying already-PII-minimized rows — there is no route by which a raw screenshot could leave the VDI boundary even if the agent code tried.

## 8. Capture-path & write-path security

Capture and write are asymmetric, and the security model treats them that way — capture only ever reads, and only one channel ever writes.

**Capture.** The Verint credential used by the REST capture worker (Topology A) is a **read-only service account, scoped narrowly to adherence/schedule reads**, and is GET-only *by construction* — not by policy the code merely intends to honor, but because the credential itself cannot authorize a mutating call even if the code were compromised or modified. Where capture instead runs as an in-VDI vision/OCR agent (Topology B), the same read-only posture holds at the data level: the agent emits PII-minimized rows only (§1), and LOB is always taken from configuration context, never inferred from OCR (OCR LOB accuracy measured at 0% — see [CONNECTOR_CATALOG.md §5](./CONNECTOR_CATALOG.md)), so a misclassification can't silently mis-route a row to the wrong tenant's LOB channel.

Capture-adjacent PII handling follows the same discipline: `gtt_adapter.py` fetches `email` and `workday_id` as part of the join key for the GTT/Verint reconciliation pipeline, but **never logs either raw** — they're kept in the typed `GTTRow` dataclass for join purposes only, and it's the caller's responsibility to mask before any logging or display path. That "never logs raw PII" property is a property of the adapter, not an opt-in the caller has to remember correctly every time.

**Write.** The governance invariant from [SYSTEM_ARCHITECTURE.md §7](./SYSTEM_ARCHITECTURE.md) is the security control here, not just a product philosophy: **the approved RPA/API dispatch channel is the only mutation path into any external system, and the LLM holds no write credential, period.** The LLM-facing code can call the model endpoint and get text back; it cannot call Verint, Chat, ServiceNow, or anything else that changes state. Concretely today, `local_api.py`'s `/dispatch-alert` endpoint is the only code path that holds a Chat webhook credential, and it only fires after a human approval action reaches the gateway (§4) — there is no route from "AI drafted this" to "message sent" that skips the human. This is what makes the audit query in §11 ("any write where `actor = ai`") provably return zero rows: it isn't a logging convention, it's a consequence of which components hold which credentials.

## 9. LLM endpoint security

The browser never calls the model directly in production — every LLM call goes through the backend proxy described in §6, which is the structural fix for the `fuelixClient.ts` issue. This buys three things at once: the API key stays server-side, the backend can validate the caller's session before forwarding (so an unauthenticated request never reaches the model), and every prompt/response pair becomes something the backend can log for the audit trail if needed.

Per-client, the actual LLM endpoint is one of the options promoted in [../NEXT_STEPS.md](../NEXT_STEPS.md) and chosen at deployment time via the tenant manifest, not hardcoded:

- **In-tenant Azure OpenAI via a private endpoint** — for a bank-tier client already on Azure, keeping the model call inside the same network boundary as the rest of Topology A.
- **Self-hosted** — for clients whose policy prohibits any external model call at all.
- **A vendor endpoint (e.g. FuelIX) reached through an allow-listed egress proxy** — for vendor-hosted or less-restricted clients, where the egress rule from §7 (default-deny, explicit allow-list) is what keeps this from becoming an arbitrary external dependency.

Prompt-injection posture is bounded by the same governance invariant as §8: because the model **only advises and drafts** and holds no write credential, a successful prompt injection can at worst produce a bad *suggestion* that a human then reviews — it cannot itself cause a write, since no write path is reachable from the model's output. The residual risk is a human rubber-stamping a manipulated draft, which is why the HITL review surface always shows the underlying rule, evidence, and confidence alongside the draft, not just the drafted text in isolation.

Before any prompt is sent, **agent and customer names are redacted** — the model reasons over role/status/rule context, not raw PII, keeping the prompt payload itself out of scope for the kind of PII exposure §6 and [DATA_GOVERNANCE_AND_MULTITENANCY.md §5](./DATA_GOVERNANCE_AND_MULTITENANCY.md) are otherwise built to prevent.

## 10. Threat model (STRIDE)

The threat model runs over the architectural spine — capture, core, dispatch, control plane, audit store ([SYSTEM_ARCHITECTURE.md §2](./SYSTEM_ARCHITECTURE.md)) — because that spine is exactly where trust boundaries and data format changes happen, which is where STRIDE categories tend to concentrate.

| STRIDE category | Representative threat on this spine | Primary mitigation |
|---|---|---|
| **Spoofing** | A worker or SPA session impersonates a legitimate identity | OIDC token validation at the gateway (§2, §5); mTLS between internal services (§5) |
| **Tampering** | A capture row or dispatch payload is altered in transit or at rest | TLS everywhere; append-only/WORM audit store with hash-chaining (§11); request validation against the API contract (§5) |
| **Repudiation** | An actor denies having approved a dispatch or a config change | Every mutating action logged with actor identity, timestamp, and hash-chained audit entry (§11); the `actor` typing (`rta`/`system`/RPA identity) makes "who did this" unambiguous |
| **Information disclosure** | Raw PII (names, workday IDs) or a secret (Verint credential, webhook URL, LLM key) leaks | PII-minimization at capture (§8); tokenization at rest ([DATA_GOVERNANCE_AND_MULTITENANCY.md §5](./DATA_GOVERNANCE_AND_MULTITENANCY.md)); vault-held secrets, never client-bundled (§6) |
| **Denial of service** | Capture polling or dispatch retries overwhelm an upstream, or the gateway is flooded | Backoff + circuit breaker on capture (60s floor, per [CONNECTOR_CATALOG.md §5](./CONNECTOR_CATALOG.md)); gateway rate-limiting (§5) |
| **Elevation of privilege** | An RTA-level actor reaches a dispatch/promotion action, or a capture credential is used to write | Server-side RBAC on every action (§4); read-only-by-construction capture credentials and no-write-credential LLM (§8) |

Each row's mitigation is already load-bearing elsewhere in this document — the threat model's job here is to confirm the spine has no unmitigated cell, not to introduce new controls.

## 11. Audit & non-repudiation

Every write — a dispatched message, an approved card, a config promotion — is recorded in an **append-only / WORM (write-once-read-many) audit store**, the same operational+audit store described as a cloud-neutral seam in [SYSTEM_ARCHITECTURE.md §3](./SYSTEM_ARCHITECTURE.md). Entries are hash-chained (each entry's hash includes the previous entry's hash), so a tampered or deleted entry breaks the chain and is detectable — the audit store proves not just that events were recorded, but that the record hasn't been quietly edited after the fact.

The standing control this document keeps returning to is a **single, always-available query, not a policy statement**: *"any write where `actor = ai`"* must return **zero rows**, every time it's run, for the lifetime of the system. This is provable rather than asserted because of how §8's write-path works — the LLM holds no write credential, so there is structurally no code path that could produce a row violating the invariant. A reviewer doesn't have to trust a process; they can run the query.

Full detail on the store's isolation model, retention, and the `actor` typing lives in [DATA_GOVERNANCE_AND_MULTITENANCY.md](./DATA_GOVERNANCE_AND_MULTITENANCY.md); this section is the security-specific framing of the same invariant.

## 12. Compliance hooks

For **in-client-cloud (bank-tier)** deployments, the controls in this document — federated identity (§2), enforced MFA with step-up (§3), server-side RBAC on every action (§4), a single audited ingress (§5), vaulted secrets with rotation evidence (§6), private networking with default-deny egress (§7), a read-only-by-construction capture credential and a single deterministic write channel (§8), and a hash-chained WORM audit trail (§11) — are the banking-grade control set a client's security team will expect to see mapped to their own framework (SOC 2, their internal control catalog, or equivalent).

The data in scope is **employee PII — schedule adherence, status, workday ID — not cardholder data**, so the posture here is described as **PCI-aligned, not "PCI compliant."** Where a client's compliance regime nonetheless asks for segmentation evidence, the isolation model in [DATA_GOVERNANCE_AND_MULTITENANCY.md §2](./DATA_GOVERNANCE_AND_MULTITENANCY.md) (per-tenant store isolation, no cross-tenant data path) is the evidence that this product's data is out of any cardholder-data-environment scope, not merely assumed to be.

Data residency follows the deployment topology directly: in-client-cloud deployments keep data inside the client's chosen region/cloud by construction (the stack runs where the client's cloud runs); vendor-hosted tenants pin residency per the tenant manifest's `deployment` property ([SYSTEM_ARCHITECTURE.md §4](./SYSTEM_ARCHITECTURE.md)).

Finally, the audit store (§11) is designed to be a source a client's own SIEM can consume, not a dead end: rotation events (§6), dispatch events (§8), and RBAC-denied attempts (§4) are all candidates for export into the client's existing security monitoring, so this product's security posture is visible inside the client's own tooling rather than living only in a vendor-side dashboard the client has to trust separately.
