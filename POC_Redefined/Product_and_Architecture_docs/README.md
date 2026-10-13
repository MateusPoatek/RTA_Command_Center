*Audience: architects, engineering leadership, product, and program stakeholders · Purpose: the master index (Information Architecture) for the WFM Automation Platform Architecture Package — the single map from which every volume, chapter, and diagram is produced.*

---

# WFM Automation Platform — Architecture Package

This package documents a **product platform**, not an automation or a migration. It is
organized as an Information Architecture first (this file), so that every document and
diagram traces back to an explicit structure and an explicit principle.

Source of truth for requirements remains the **BRD**
([`../docs/handoff/BRD_RTA_Command_Center_Phase1.md`](../docs/handoff/BRD_RTA_Command_Center_Phase1.md))
and the production **engineering set** ([`../docs/engineering/`](../docs/engineering/)).
This package *elevates and connects* that material into a stakeholder-facing blueprint; it
does not restate it. Relationships are declared in the Supersedes/References table below.

**Status legend:** 🟢 drafted/reviewed · 🟡 starter (partial by design) · 🟠 outline (structure only) · ⚪ deferred

---

## The seven volumes

| Vol | Title | Audience | Answers | Status |
|-----|-------|----------|---------|--------|
| **0** | [Product Vision](./Volume-0_Product-Vision/Volume-0_Product-Vision.md) · [Architecture Principles](./Volume-0_Product-Vision/Volume-0_Architecture-Principles.md) | Everyone | *What is this and why does it exist?* | 🟢 |
| **1** | [Executive Strategy](./Volume-1_Executive-Strategy/Volume-1_Executive-Strategy.md) | VP / sponsors | *What's the value, cost, and commitment?* | 🟢 |
| **2** | [Product Architecture](./Volume-2_Product-Architecture/Volume-2_Product-Architecture.md) | Product / architects | *What capabilities, tenants, and value chain?* | 🟢 |
| **3** | [Technical Architecture](./Volume-3_Technical-Architecture/Volume-3_Technical-Architecture.md) | Architects / engineers | *How is it built? (C4, security, identity)* | 🟢 |
| **4** | [Deployment & Operations](./Volume-4_Deployment-and-Operations/Volume-4_Deployment-and-Operations.md) | Platform / SRE | *How does it ship, host, and stay healthy?* | 🟢 |
| **5** | [Migration Strategy](./Volume-5_Migration-Strategy/Volume-5_Migration-Strategy.md) | Delivery / program | *How do accounts onboard in waves?* | 🟢 |
| **6** | [Program Control Tower](./Volume-6_Program-Control-Tower/Volume-6_Program-Control-Tower.md) | Program / ops leadership | *How is the program run and observed?* | 🟢 |

### Chapter outline

- **Volume 0 — Product Vision:** the elevator narrative · the Platform Poster (cover) · **Architecture Principles** (see below).
- **Volume 1 — Executive Strategy:** value chain · impact model · deployment-tier commitment · risk posture.
- **Volume 2 — Product Architecture:** business capability map · personas · multi-tenant model · tenant manifest.
- **Volume 3 — Technical Architecture:** C4 (context/container/component) · key sequences · trust boundaries · identity flow.
- **Volume 4 — Deployment & Operations:** hosting model · rollout waves · observability · Command Center internals.
- **Volume 5 — Migration Strategy:** migration waves · future vision.
- **Volume 6 — Program Control Tower:** program governance, HITL operations, audit posture (draws on Vol 4 observability).

---

## Architecture Principles → BRD constraint map

These five principles are **elevated from BRD §10 (Architecture Constraints, AC-001–AC-007)**,
where they are marked non-negotiable. Every diagram and design decision in this package
should trace to one. They belong at the **front of Volume 0**, not buried in requirements.

| # | Principle | BRD source of truth |
|---|-----------|---------------------|
| P1 | **No AI write path** — the LLM subsystem holds no write credentials to external systems | AC-001 (+ BR-018) |
| P2 | **Adapter-blind rules core** — normalise → triage → card_builder processes `AgentRow[]` regardless of capture source | AC-002 (+ BR-026, BR-030) |
| P3 | **One OCI image, many tenant manifests** — one container per client, bound by a JSON manifest; no code forks | AC-003 (+ BR-027, FR-CONFIG-001) |
| P4 | **Cloud-neutral seams, GCP-first** — five swappable integration seams; committed first target = Telus Digital GCP | AC-004 + AC-007 |
| P5 | **Human-in-the-loop before any external write** — every CommandCard stays `pending_review` until a human acts | FR-DISPATCH-001 (+ §7.3) |

---

## Diagram library (D-01 … D-20)

Statuses reflect a read-only audit of existing `.mmd` sources. **EXISTS** = usable as-is;
**PARTIAL** = existing diagram to recast into this slot; **TO BUILD** = net-new.

| D-ID | Diagram | Vol | Status | Existing source / note |
|------|---------|-----|--------|------------------------|
| D-01 | Business Capability Map | 2 | 🟢 EXISTS | `diagrams/sources/D-01-business-capability-map.mmd` |
| D-02 | Product Value Chain | 1 | 🟢 EXISTS | `diagrams/sources/D-02-product-value-chain.mmd` |
| D-03 | Personas | 2 | 🟢 EXISTS | `diagrams/sources/D-03-personas.mmd` |
| D-04 | Enterprise Ecosystem | 2 | 🟢 EXISTS | `diagrams/sources/D-04-enterprise-ecosystem.mmd` (recast from `command-center-integration-topology.mmd`) |
| D-05 | Deployment Landscape | 4 | 🟢 EXISTS | `diagrams/sources/D-05-deployment-landscape.mmd` (multi-env; bank-tier seams defaulted to Azure — verify) |
| D-06 | Platform Capability Stack | 2 | 🟢 EXISTS | `diagrams/sources/D-06-platform-capability-stack.mmd` (recast from `01-system-architecture-cloud-neutral.mmd`) |
| D-07 | Multi-Tenant Model | 2 | 🟢 EXISTS | `diagrams/sources/D-07-multi-tenant-model.mmd` |
| D-08 | Tenant Configuration / Manifest | 2 | 🟢 EXISTS | `../docs/engineering/diagrams/mmd/10-fdae-control-vs-data-plane.mmd` |
| D-09 | C4 Context | 3 | 🟢 EXISTS | `diagrams/sources/D-09-c4-context.mmd` |
| D-10 | C4 Container | 3 | 🟢 EXISTS | `diagrams/sources/D-10-c4-container.mmd` (recast from `01-system-architecture-cloud-neutral.mmd`) |
| D-11 | C4 Component | 3 | 🟢 EXISTS | `diagrams/sources/D-11-c4-component.mmd` (folds in `02-adapter-spine.mmd`) |
| D-12 | Sequences (attendance/alerts/dispatch/SNOW/extension) | 3 | 🟢 EXISTS | `diagrams/sources/D-12-sequences.mmd` (folds in `06-multisource-confirmation.mmd`) |
| D-13 | Trust Boundaries | 3 | 🟢 EXISTS | `diagrams/sources/D-13-trust-boundaries.mmd` (extended from `verint-extension-dataflow.mmd`) |
| D-14 | Identity Flow | 3 | 🟢 EXISTS | `diagrams/sources/D-14-identity-flow.mmd` (sequence) |
| D-15 | Rollout Waves (5 tiers) | 4 | 🟢 EXISTS | `diagrams/sources/D-15-rollout-waves.mmd` (folds in `03-integration-rest-readonly` + `04-integration-citrix-vdi`) |
| D-16 | Hosting Model | 4 | 🟢 EXISTS | `diagrams/sources/D-16-hosting-model.mmd` (seeded from `command-center-infrastructure.mmd`) |
| D-17 | Observability | 4 | 🟢 EXISTS | `diagrams/sources/D-17-observability.mmd` (folds in `05-connector-failprevention.mmd`) |
| D-18 | Command Center internal | 4 | 🟢 EXISTS | `diagrams/sources/D-18-command-center-internal.mmd` (component names from the retired `POC_Redefined/command-center`, git tag `command-center-final`; superseded by `RTA_Board_V2`) |
| D-19 | Migration Waves | 5 | 🟢 EXISTS | `diagrams/sources/D-19-migration-waves.mmd` (Gold=ground truth; Silver/Bronze illustrative) |
| D-20 | Future Vision | 5 | 🟢 EXISTS | `diagrams/sources/D-20-future-vision.mmd` |
| **D-00** | **Platform Poster (A2)** | 0 | 🟢 EXISTS | `diagrams/sources/D-00-platform-poster.mmd` (signature cover; Opus-authored synthesis of D-01…D-20) |

### Orphaned-diagram disposition

Five existing engineering diagrams have no 1:1 slot in the proposed 20. Rather than retire
validated content, each **folds into** a library diagram as detail (reuse, not rebuild):

| Existing `.mmd` | Disposition |
|-----------------|-------------|
| `02-adapter-spine.mmd` | → into **D-11** (component detail) |
| `03-integration-rest-readonly.mmd` | → into **D-15** (Tier 1/2 detail) |
| `04-integration-citrix-vdi.mmd` | → into **D-15** (Tier 4 detail) |
| `05-connector-failprevention.mmd` | → into **D-17** (resilience view) |
| `06-multisource-confirmation.mmd` | → into **D-12** (alerts sequence) |

---

## Visual language (the one spec every diagram follows)

- **File:** Mermaid `.mmd` in `diagrams/sources/`, named `D-NN-kebab-title.mmd`.
- **Header:** every file opens with three `%%` comment lines —
  `%% D-NN <title>` / `%% Source: <originating doc or BRD section>` / `%% Purpose: <one line>`.
- **Cloud-neutral by default;** provider-specific diagrams are kept as separate reference files.
- **Render:** `.mmd` → PNG into `diagrams/output/` via the documented command (see
  [`_templates/`](./_templates/) / the render note added in Phase 1). One uniform path for
  this package; no per-diagram bespoke rendering.

---

## Supersedes / references

| Topic | Source of truth | Relationship |
|-------|-----------------|--------------|
| Requirements & constraints | [`../docs/handoff/BRD_RTA_Command_Center_Phase1.md`](../docs/handoff/BRD_RTA_Command_Center_Phase1.md) | references (this package elevates, never restates) |
| Production system architecture | [`../docs/engineering/SYSTEM_ARCHITECTURE.md`](../docs/engineering/SYSTEM_ARCHITECTURE.md) | references / extends into Volume 3 |
| Connector catalog | [`../docs/engineering/CONNECTOR_CATALOG.md`](../docs/engineering/CONNECTOR_CATALOG.md) | references (feeds D-04, D-15) |
| Tenant manifest / control plane | [`../docs/engineering/FDAE_CONFIGURATION_LAYER.md`](../docs/engineering/FDAE_CONFIGURATION_LAYER.md) | references (feeds D-07, D-08) |
| Existing diagram sources | `../docs/diagrams/`, `../docs/engineering/diagrams/mmd/` | reuses / recasts (see disposition table) |
| RTA Board + TL Alert System (the running Command Center, `RTA_Board_V2/`) | [`rta-board-engineering-guide.html`](rta-board-engineering-guide.html) | how the built POC works: sources, pipeline, alert rules, KPIs, finance view |

---

## How this package is produced

Production follows the token-discipline playbook
([`./DOC_PRODUCTION_PLAYBOOK.md`](./DOC_PRODUCTION_PLAYBOOK.md)): this IA is the master
skeleton; chapters and TO-BUILD diagrams are drafted by Sonnet subagents (one per artifact,
reading only their sources), and consistency + the Principles chapter + the D-00 poster are
Opus-led. Skeletons live in [`_templates/`](./_templates/).
