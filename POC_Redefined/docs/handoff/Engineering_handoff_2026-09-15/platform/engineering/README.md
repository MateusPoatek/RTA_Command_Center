*Audience: external engineering teams + technical leads who will build the production system (human and AI). Purpose: the index for the production engineering documentation set — the design that turns the proven POC into a buildable, multi-client product.*

---

# RTA Automation — Production Engineering Documentation Set

This subtree (`POC_Redefined/docs/engineering/`) is the **production design**. It is built *on* the POC — it does not restate it. Where a topic's source of truth is one of the original 18 docs in `../`, this set links to it; where the production answer is new, this set owns it (see the supersedes/references table below).

The POC is proven end-to-end on live EPIC Verint: a browser extension reads Verint's read-only API in the RTA's browser, the rules core (`verint_normalize → verint_triage → card_builder`, 44 tests) turns it into cards, and the React Command Center renders them. This set describes how that becomes a hardened, deployable product that runs for very different clients — from a `none`-access, Citrix-locked bank-tier client to a `full`-access web-Verint shop (EPIC).

## The four locked decisions (the foundation)

Every document here is built on four strategic decisions made and approved in the prior strategy pass:

| # | Decision | Where it's realized |
|---|---|---|
| **D1** | **Three access tiers × two deployment topologies.** Access tier (`full`/`partial`/`none`) drives the capture strategy; deployment (in-client-cloud single-tenant for banks vs vendor-hosted for permissive clients) is a separate axis. Same container image; both are properties of the per-client *tenant manifest*. | [SYSTEM_ARCHITECTURE](./SYSTEM_ARCHITECTURE.md), [DEPLOYMENT_AND_OPERATIONS](./DEPLOYMENT_AND_OPERATIONS.md), [FDAE_CONFIGURATION_LAYER](./FDAE_CONFIGURATION_LAYER.md) |
| **D2** | **Cloud-agnostic** — five cloud-neutral seams behind interfaces (secrets vault · operational+audit store · intelligence store · LLM endpoint · runtime+gateway). The OCI container image is the portability layer; deploy to whatever a client mandates. | [SYSTEM_ARCHITECTURE](./SYSTEM_ARCHITECTURE.md) |
| **D3** | **Per-client isolated now, benchmark later** — strict per-tenant isolation today; the data model is shaped so opt-in, k-anonymized cross-client benchmarking is *possible* later, legal-gated. The liability is not built now. | [DATA_GOVERNANCE_AND_MULTITENANCY](./DATA_GOVERNANCE_AND_MULTITENANCY.md) |
| **Spine** | **Swappable CAPTURE adapters → stable rules core → swappable DISPATCH adapters.** Governance invariant: **NO direct AI writes** — every write goes through an approved RPA/API channel; the LLM only advises/drafts. The audit query "any write where `actor = ai`" must return **zero rows**. | [SYSTEM_ARCHITECTURE](./SYSTEM_ARCHITECTURE.md), [CONNECTOR_CATALOG](./CONNECTOR_CATALOG.md) |

## Reading order

1. **[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)** — start here. The spine, the five seams, one-image/two-topologies, and the governance invariant everything else cites.
2. **[CONNECTOR_CATALOG.md](./CONNECTOR_CATALOG.md)** — every capture/dispatch adapter, the two integration topologies (read-only REST vs Citrix/VDI), and how they compose as fail-prevention.
3. **[FDAE_CONFIGURATION_LAYER.md](./FDAE_CONFIGURATION_LAYER.md)** — the control plane that configures the adapters per client (the tenant manifest).
4. The cross-cutting docs: **[PRD](./PRD.md)**, **[SECURITY_ARCHITECTURE](./SECURITY_ARCHITECTURE.md)**, **[DATA_GOVERNANCE_AND_MULTITENANCY](./DATA_GOVERNANCE_AND_MULTITENANCY.md)**, **[DEPLOYMENT_AND_OPERATIONS](./DEPLOYMENT_AND_OPERATIONS.md)**.
5. **[API_SPECIFICATION.md](./API_SPECIFICATION.md)** — the contract (deferred this pass; placeholder describes the intended shape).

## Document status

| Document | Status | Notes |
|---|---|---|
| README (this file) | 🟢 reviewed | The set index. |
| [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | 🟢 drafted | Flagship #1 — full. |
| [CONNECTOR_CATALOG.md](./CONNECTOR_CATALOG.md) | 🟢 drafted | Flagship #2 — full. |
| [FDAE_CONFIGURATION_LAYER.md](./FDAE_CONFIGURATION_LAYER.md) | 🟡 starter | Model + manifest + lifecycle defined; console UX sketched, not finalized. |
| [PRD.md](./PRD.md) | 🟠 outline | Rich outline; sections to be filled next pass. |
| [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) | 🟠 outline | Rich outline; OAuth2/MFA/gateway/threat-model structure captured. |
| [DATA_GOVERNANCE_AND_MULTITENANCY.md](./DATA_GOVERNANCE_AND_MULTITENANCY.md) | 🟠 outline | Rich outline; isolation tiers + three-store model + PII gate captured. |
| [DEPLOYMENT_AND_OPERATIONS.md](./DEPLOYMENT_AND_OPERATIONS.md) | 🟠 outline | Rich outline. |
| [API_SPECIFICATION.md](./API_SPECIFICATION.md) | ⚪ deferred | Placeholder; to be written once the architecture settles. |

Legend: 🟢 drafted/reviewed · 🟡 starter (partial by design) · 🟠 outline (structure only) · ⚪ deferred.

## Supersedes / references — where is the source of truth?

| Topic | Source of truth | Relationship to the original 18 docs |
|---|---|---|
| POC as-built | `../ARCHITECTURE.md` | Unchanged. SYSTEM_ARCHITECTURE is the *production* successor; ARCHITECTURE stays the POC record. |
| Production architecture | `./SYSTEM_ARCHITECTURE.md` | **Supersedes** `../ARCHITECTURE.md` for production. |
| Adapter model | `../CAPTURE_AND_DISPATCH_ADAPTERS.md` | CONNECTOR_CATALOG **extends** it (full catalog + fail-prevention). |
| Which adapter per environment | `../CONNECTOR_SCENARIOS.md` | CONNECTOR_CATALOG **extends** it. |
| Write-channel governance | `../VERINT_MCP_AND_RPA_NOTE.md` | Referenced; the no-AI-write rule is promoted into SYSTEM_ARCHITECTURE + CONNECTOR_CATALOG. |
| ServiceNow REST-not-MCP | `../SERVICENOW_MCP_EVALUATION.md` | Referenced by CONNECTOR_CATALOG. |
| Capture-freshness behavior | `../OBSERVABILITY_DRY_RUN.md` | Referenced by DEPLOYMENT_AND_OPERATIONS. |
| FDAE program intent | `../FDAE_Program_Response_Derek_Erin.md` | FDAE_CONFIGURATION_LAYER is anchored to it. |
| Problem / value | `../PAIN_POINTS.md`, `../SOLUTION.md`, `../SCOPE.md`, `../../POC/06_board_materials/` | PRD references; does not restate. |
| Domain schemas | `../../command-center/src/domain/types.ts`, `scenario_types.ts` | The schema source of truth for the whole set; API_SPECIFICATION will freeze versioned copies. |
| Security / OAuth / RBAC | `./SECURITY_ARCHITECTURE.md` | New. Promotes the scattered notes in `../NEXT_STEPS.md` (LLM gateway, SSO/RBAC). |
| Data governance / multi-tenancy | `./DATA_GOVERNANCE_AND_MULTITENANCY.md` | New. |

## Conventions

- Docs: `UPPER_SNAKE.md`, an italicized context-header at the top, a horizontal rule, tables, relative cross-links.
- Diagrams: Mermaid `.mmd` in [diagrams/mmd/](./diagrams/mmd/), `NN-kebab-case.mmd`, a `%%` header citing source + purpose, **cloud-neutral** per `../../POC/02_architecture/README.md` (provider-specific reference diagrams are kept separate).
