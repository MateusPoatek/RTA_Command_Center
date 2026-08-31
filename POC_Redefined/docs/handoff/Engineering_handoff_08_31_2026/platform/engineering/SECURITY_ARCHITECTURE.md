*Audience: security reviewers + platform engineers. Purpose: the security posture across both deployment topologies — identity, OAuth2/OIDC, MFA, API gateway, secrets, network, and the threat model.*

> **🟠 STATUS: OUTLINE.** Section structure with per-section intent; content to be filled next pass. The auth sequence diagram (`07-auth-oauth-mfa-sequence.mmd`) ships with this document when it is written.

---

# Security Architecture

## 1. Trust model & boundaries
*The CIBC boundary (single-tenant, in the client's own cloud) vs the vendor-hosted boundary; the Citrix/VDI egress constraint treated as a security boundary (no copy-out; PII-minimized rows only). Maps to the two topologies in [CONNECTOR_CATALOG.md §5](./CONNECTOR_CATALOG.md).*

## 2. Identity & authentication (OAuth2 / OIDC)
*Federation to the client IdP (CIBC = Entra/Azure AD); OIDC authorization-code flow for the SPA; session model; service-to-service auth via client-credentials. Replaces the POC's "no authentication" state.*

## 3. 2FA / MFA
*MFA enforced via the client IdP; **step-up authentication** for high-risk actions — dispatch, escalation, and config promotion.*

## 4. Authorization / RBAC
*Roles from the PRD personas (RTA / supervisor / OM / FDAE admin) mapped to IdP groups; **server-side authorization on every action** (closes the POC gap where any browser could take any action); least privilege.*

## 5. API gateway
*The single ingress seam: TLS termination, OIDC token validation + introspection, MFA/step-up enforcement, RBAC, rate-limiting, **request validation against the API contract**, mTLS to internal services. Cloud-neutral concept (APIM / API Gateway / Apigee / gateway container).*

## 6. Secrets management
*The vault seam (D2): Verint read credential, dispatch webhook URLs, LLM key, OIDC secret — all by reference, fetched at runtime via managed identity. **Never in the image, never in `VITE_` vars** (fixes the POC client-side-key issue in `fuelixClient.ts`). Rotation + rotation-evidence to the audit log.*

## 7. Network & VPC
*Per-deployment network topology; private endpoints; no public ingress for in-client-cloud deployments; default-deny egress with allow-listing; no raw VDI pixel egress.*

## 8. Capture-path & write-path security
*Capture: read-only Verint credential scoped to adherence/schedule reads, GET-only by construction; in-VDI vision emits PII-minimized rows only. Write: the approved RPA/API channel is the **only** mutation path; the LLM holds no write credential. Enforces the governance invariant in [SYSTEM_ARCHITECTURE.md §7](./SYSTEM_ARCHITECTURE.md).*

## 9. LLM endpoint security
*Backend proxy only (browser never calls the model directly); the per-client LLM options (in-tenant Azure OpenAI via private endpoint / self-hosted / vendor via allow-listed egress proxy) — promoting the options in [../NEXT_STEPS.md](../NEXT_STEPS.md); prompt-injection posture (LLM only advises, so blast radius is bounded); name redaction before any prompt.*

## 10. Threat model (STRIDE)
*A STRIDE table over the spine — capture, core, dispatch, control plane, audit store — with mitigations.*

## 11. Audit & non-repudiation
*Append-only/WORM audit store; the **"any write where `actor = ai` → zero rows"** invariant as a standing control; hash-chaining for tamper-evidence. Detail in [DATA_GOVERNANCE_AND_MULTITENANCY.md](./DATA_GOVERNANCE_AND_MULTITENANCY.md).*

## 12. Compliance hooks
*Banking-grade controls for in-client-cloud (bank) deployments; PCI-aligned (not "PCI compliant" — this is employee PII, not cardholder data) with segmentation evidence proving out-of-CDE scope; data residency; SIEM log export.*
