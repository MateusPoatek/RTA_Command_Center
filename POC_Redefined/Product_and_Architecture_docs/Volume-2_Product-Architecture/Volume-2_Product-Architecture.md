*Audience: product managers, architects, and delivery leads · Purpose: what the platform provides — the capability map, the personas it serves, and the one-image/many-manifests model that lets one product serve every client without a fork.*

---

# Volume 2 · Product Architecture

> Traces to principle(s): **P2** (adapter-blind rules core), **P3** (one OCI image, many tenant manifests) — see [package README](../README.md#architecture-principles--brd-constraint-map).
> Source of truth: [SYSTEM_ARCHITECTURE.md](../../docs/engineering/SYSTEM_ARCHITECTURE.md) §2–4 and [FDAE_CONFIGURATION_LAYER.md](../../docs/engineering/FDAE_CONFIGURATION_LAYER.md). This chapter elevates, it does not restate.

## Summary

The platform is one product, not a family of client-specific builds: a single capability stack — capture, an adapter-blind rules core, and dispatch — is packaged into one OCI image and reused unmodified across every client. What differs per client is entirely captured in a versioned tenant manifest, not in code. This chapter maps the business capabilities the platform provides (D-01), the people who use it (D-03), where it sits in the client's ecosystem (D-04), the layered capability stack (D-06), how multi-tenancy is achieved (D-07), and the manifest that drives it all (D-08).

## Business capability map

The platform's capabilities cluster into three groups that mirror the architectural spine (capture → rules core → dispatch): **sensing** the floor (capture, normalization), **deciding** what matters (triage, prioritization, drafting), and **acting** on it (human review, dispatch, audit). A fourth cluster — **configuring** — sits alongside all three: it is how an FDAE stands up a new client without touching the other three.

See **D-01** for the full map. The load-bearing point for product and architecture stakeholders: every capability in the "sensing" and "acting" clusters has more than one interchangeable implementation (an adapter), while every capability in the "deciding" cluster has exactly one implementation shared by all clients — this asymmetry is the platform's core design decision (P2).

![D-01 Business Capability Map](../diagrams/output/D-01-business-capability-map.png)

## Personas

Four personas drive the design, spanning the floor and the platform:

| Persona | Role | What the platform gives them |
|---|---|---|
| **RTA (Real-Time Analyst)** | Front-line reviewer | The HITL review surface — cards to approve/edit/suppress/escalate, never a system that acts without them (P5) |
| **WFM Supervisor / Team Lead** | Floor oversight | Aggregate view of adherence, exceptions, and dispatch outcomes across their LOBs |
| **FDAE (Field Deployment / Admin Engineer)** | Client onboarding | The control-plane console — pick tier, bind seams, select capture/dispatch, set thresholds — with no code change (D-08) |
| **Program / Compliance Stakeholder** | Governance | The audit trail and the queryable "no AI write" proof (P1), reportable per tenant |

See **D-03** for the full persona set, including goals, pain points, and touchpoints per persona.

![D-03 Personas](../diagrams/output/D-03-personas.png)

## Platform capability stack

The stack is layered, and the layering is the point: adapters vary at the top and bottom; the core in the middle never changes per client.

| Layer | Contents | Varies per client? |
|---|---|---|
| Capture adapters | Browser extension, Verint REST, vision/OCR, netcap, file export | Yes — selected by `accessTier` in the manifest |
| Rules core | `verint_normalize → verint_triage → card_builder` | **No** — identical code path for every tenant (P2) |
| Dispatch adapters | In-app HITL feed, Google Chat, Teams, ServiceNow, RPA (sole write channel), audit-only | Yes — selected + LOB-mapped by the manifest |
| Cloud-neutral seams | Vault, operational/audit store, intelligence store, LLM endpoint, runtime/gateway | Bindings vary; the abstraction does not (P4) |

Full layering and component detail: **D-06**, which recasts the production system architecture — see [SYSTEM_ARCHITECTURE.md §2–3](../../docs/engineering/SYSTEM_ARCHITECTURE.md#2-the-architectural-spine) for the underlying component model and the `AgentRow`/`CommandCard` contracts that make the layers swappable without touching the core.

![D-06 Platform Capability Stack](../diagrams/output/D-06-platform-capability-stack.png)

## Enterprise ecosystem

The platform is one node in a client's existing operational ecosystem, not a replacement for it: it reads from the client's WFM tool (Verint, or future NICE IEX), writes into their chat/ticketing systems (Google Chat, Teams, ServiceNow), and — via RPA, the only write channel — makes deterministic corrections back into the WFM tool itself. It never disintermediates the systems of record; it sits alongside them as a sensing-and-recommending layer with a narrow, audited write path.

See **D-04** for the full integration topology, including which systems are read-only sources, which are dispatch targets, and where the RPA write boundary sits.

![D-04 Enterprise Ecosystem](../diagrams/output/D-04-enterprise-ecosystem.png)

## The multi-tenant model

"One product, many clients" is achieved on two independent axes, both carried entirely in the tenant manifest — never in a code fork:

- **Access tier** (`full` / `partial` / `none`) — how much access the platform has to the client's WFM system, which determines which capture adapters are even offered.
- **Deployment topology** (`in-client-cloud` / `vendor-hosted`) — where the stack physically runs, driven by the client's regulatory posture.

A bank-tier client (`none`-access, in-client-cloud, Citrix/VDI) and a permissive web-Verint shop (`full`-access, vendor-hosted) run the **identical container image**; only their manifests differ. Each tenant's operational and intelligence data is isolated — no cross-tenant data path exists in this phase.

See **D-07** for the full tenant-isolation model, including the per-tenant store boundaries this implies.

![D-07 Multi-Tenant Model](../diagrams/output/D-07-multi-tenant-model.png)

## Tenant configuration and the manifest (P3)

The tenant manifest is the mechanism that makes P3 real: one declarative, versioned JSON document per client per environment fully determines a deployment — which capture adapters wire up (and in what fallback order), which dispatch channels and LOB map apply, which rule thresholds are in effect, and which cloud seam bindings are used. At boot, the image reads exactly one manifest and deterministically wires itself; the same image plus the same manifest always produces the same wiring, which is what makes rollback ("re-activate the previous manifest version") safe and auditable.

This is deliberately **not** CI/CD: a manifest change reaches one tenant and needs no rebuild or test suite; a code change reaches every tenant and always goes through the full pipeline. The one-directional coupling — a manifest change may *trigger* a CD deploy only if it also bumps the image tag — keeps a bank-tier client's threshold tweak from ever being able to break another client's deployment.

Full manifest shape, the connector registry, preflight/health checks, and the validate → promote → rollback lifecycle: [FDAE_CONFIGURATION_LAYER.md](../../docs/engineering/FDAE_CONFIGURATION_LAYER.md).

![D-08 Tenant Configuration / Manifest](../diagrams/output/D-08-tenant-configuration.png)

## Diagrams

| D-ID | What it shows |
|------|---------------|
| D-01 | Business Capability Map — sensing / deciding / acting / configuring capability clusters |
| D-03 | Personas — RTA, WFM Supervisor, FDAE, Program/Compliance stakeholder |
| D-04 | Enterprise Ecosystem — the platform's integration topology within a client's existing systems |
| D-06 | Platform Capability Stack — capture / rules core / dispatch / cloud-neutral seams, layered |
| D-07 | Multi-Tenant Model — access tier × deployment topology, per-tenant isolation |
| D-08 | Tenant Configuration / Manifest — control plane vs. data plane, the manifest lifecycle |

## References

| Topic | Source of truth | Relationship |
|-------|-----------------|--------------|
| Architecture principles (P1–P5) | [Volume 0 · Architecture Principles](../Volume-0_Product-Vision/Volume-0_Architecture-Principles.md) | references (this chapter applies P2, P3) |
| Production system architecture, capability stack, spine | [`../../docs/engineering/SYSTEM_ARCHITECTURE.md`](../../docs/engineering/SYSTEM_ARCHITECTURE.md) | references / extends (elevates §2–4) |
| Tenant manifest, control plane, FDAE console | [`../../docs/engineering/FDAE_CONFIGURATION_LAYER.md`](../../docs/engineering/FDAE_CONFIGURATION_LAYER.md) | references (feeds D-07, D-08) |
| Connector catalog (per-adapter detail feeding D-04) | [`../../docs/engineering/CONNECTOR_CATALOG.md`](../../docs/engineering/CONNECTOR_CATALOG.md) | references |
| Requirements & constraints | [`../../docs/handoff/BRD_RTA_Command_Center_Phase1.md`](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md) | references (this package elevates, never restates) |

<!-- Status: 🟢 drafted/reviewed -->
