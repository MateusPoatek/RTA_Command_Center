*Audience: platform / SRE + deployment engineers · Purpose: how the platform ships, hosts, and stays healthy — one image, many tenant manifests, cloud-neutral seams.*

---

# Volume 4 · Deployment & Operations

> Traces to principle(s): **P3** (one OCI image, many tenant manifests) and **P4** (cloud-neutral seams, GCP-first) — see [package README](../README.md#architecture-principles--brd-constraint-map).
> Source of truth: [`../../docs/engineering/DEPLOYMENT_AND_OPERATIONS.md`](../../docs/engineering/DEPLOYMENT_AND_OPERATIONS.md) and [`../../docs/engineering/SYSTEM_ARCHITECTURE.md`](../../docs/engineering/SYSTEM_ARCHITECTURE.md) (the five seams, §3). This chapter elevates, it does not restate.

## Summary

The platform ships as **one signed OCI image** and is never forked per client — every difference between tenants (network, identity, capture adapter, dispatch targets, thresholds) lives in a versioned **tenant manifest**, not in code. That image binds to a cloud at exactly five seams (Secret Vault, Operational + Audit Store, Intelligence Store, LLM Endpoint, Runtime + Gateway), so moving or adding a client is a configuration and seam-binding exercise, not a rewrite. Deployment topology (in-client-cloud vs vendor-hosted) and access tier (`full`/`partial`/`none`) are independent axes, both carried in the manifest. A bank-tier client — `none`-access, in-client-cloud — is the reference deployment for this volume; its seam bindings are currently **defaulted to Azure and unverified** (see D-05 note below).

## Hosting model (D-16)

Two deployment topologies, one image:

| Topology | Who runs it | Data path | Fit |
|---|---|---|---|
| **In-client-cloud** | Deploys into the client's own cloud/VPC, single-tenant, behind their identity and network controls | Vendor retains nothing in the runtime data path | Required for restricted/regulated clients — a bank-tier client |
| **Vendor-hosted** | Runs on vendor infrastructure, isolated per tenant | Vendor operates the runtime | Permissive clients (e.g. a full-access web shop) |

Runtime target is **managed-runtime first** (Azure Container Apps / Cloud Run / ECS-Fargate); an orchestrator (AKS/GKE/EKS) is adopted only at multi-client density or on explicit client mandate — the image doesn't change, only the runtime seam binding does (see [SYSTEM_ARCHITECTURE.md §9](../../docs/engineering/SYSTEM_ARCHITECTURE.md#9-scaling-model)). Provider specifics below are reference bindings, not an architectural decision — the cloud-agnostic policy holds even where a specific provider is named.

![Hosting Model](../diagrams/output/D-16-hosting-model.png)

## Deployment landscape (D-05) — cloud-neutral seams bound per environment (P4)

The product binds to a cloud at exactly five seams; everything else is cloud-neutral application code in the one image (full seam table: [SYSTEM_ARCHITECTURE.md §3](../../docs/engineering/SYSTEM_ARCHITECTURE.md#3-the-five-cloud-neutral-seams-d2)):

| Seam | Responsibility | Example bindings |
|---|---|---|
| Secret Vault | All credentials — never in the image, never in client-side vars | Azure Key Vault · AWS Secrets Manager · GCP Secret Manager · HashiCorp Vault |
| Operational + Audit Store | Live cards, dispatch log, append-only/WORM audit trail | Cosmos DB · DynamoDB · Firestore · Postgres + object-lock |
| Intelligence Store | Derived analytics, per-tenant isolated | a warehouse/lakehouse per tenant |
| LLM Endpoint | Advise/draft only, reached via backend proxy | in-tenant Azure OpenAI · Vertex · Bedrock · self-hosted |
| Runtime + Gateway | Where the image runs, how ingress is fronted | Azure Container Apps · Cloud Run · ECS · AKS/GKE/EKS |

**⚠️ Verification gap:** the committed first target is Telus Digital GCP (AC-004/AC-007), but the current deployment-landscape diagram defaults a bank-tier client's seam bindings to **Azure**. That default was carried forward from the infrastructure source diagram, not confirmed against a bank-tier client decision — platform/SRE should verify the actual target cloud for that bank-tier client before this row is treated as final, and correct D-05's source (`diagrams/sources/D-05-deployment-landscape.mmd`) once confirmed.

![Deployment Landscape](../diagrams/output/D-05-deployment-landscape.png)

## One image, many manifests — the deploy model (P3)

The **tenant manifest** (see [`FDAE_CONFIGURATION_LAYER.md`](../../docs/engineering/FDAE_CONFIGURATION_LAYER.md)) is the deployment input: the image self-configures at boot by reading its active manifest — which capture adapters to instantiate and in what fallback order, which dispatch adapters, the LOB→channel map, rule thresholds, and the five seam bindings. Secrets are injected from the client vault via managed identity; nothing tenant-specific is baked into the image.

This produces two independent, non-interchangeable pipelines — keeping them separate is the operational discipline that lets a config change on one tenant never touch another:

| | Control plane (config) | CI/CD (image) |
|---|---|---|
| Ships | per-client configuration | code — one image for **every** tenant |
| Affects | one tenant | all tenants |
| Needs a build? | No | Yes (full test suite) |
| Rollback | re-activate the previous manifest (seconds) | redeploy a previous image |

The control plane may *trigger* a CD deploy only when a config change also bumps the image tag — the single, one-directional coupling between the two.

**Release strategy for the image:** blue/green with per-tenant canary and rollback; on cutover, the push (WSS) hub is drained so live RTAs aren't dropped mid-shift.

## Rollout waves (D-15)

Onboarding a new account is primarily a **capture-adapter and access-tier** decision, not a rebuild — the same image serves every tier:

- **`full`-access** — REST-capturable, server-side, lowest friction.
- **`partial`-access** — web-accessible without a full API; browser extension / netcap.
- **`none`-access** (a bank-tier client) — pixel-only through Citrix/VDI; in-VDI vision/OCR agent, or a read-only API credential that upgrades the tier.

Each tier maps to a wave of the rollout; the fallback order within a tier is itself carried in the manifest's ordered `capture[]` list (see [SYSTEM_ARCHITECTURE.md §8](../../docs/engineering/SYSTEM_ARCHITECTURE.md#8-failure-domains-and-graceful-degradation)). Migration sequencing and account tiering (Gold/Silver/Bronze) are the subject of Volume 5; this diagram shows the deployment-side tiers that migration wave sequencing must respect.

![Rollout Waves](../diagrams/output/D-15-rollout-waves.png)

## Observability (D-17)

Standard metrics/logs/traces apply, plus two operational signals specific to this platform:

- **Capture-freshness signal.** Verint's calendar refresh is **interaction-driven, not timer-driven** — confirmed by dry-run instrumentation (no WebSocket present; refresh gaps track user paging/filtering, not a fixed interval; ~9.5 min idle produced zero refreshes). Freshness monitoring must alarm on *staleness while the RTA is active*, and a gentle periodic re-trigger (re-issuing the read the app already makes) is the mitigation for idle gaps — see [`../../docs/OBSERVABILITY_DRY_RUN.md`](../../docs/OBSERVABILITY_DRY_RUN.md).
- **The audit standing check.** *"actor = ai → zero rows"* against the append-only audit store is not a one-time compliance proof, it's an operational check that should run continuously; any non-zero result is a P1 (see the governance invariant, [SYSTEM_ARCHITECTURE.md §7](../../docs/engineering/SYSTEM_ARCHITECTURE.md#7-the-governance-invariant-non-negotiable)).

SIEM export applies for in-client-cloud deployments, where the client's own security tooling needs the audit and access logs.

![Observability](../diagrams/output/D-17-observability.png)

## Command Center internals (D-18)

The Command Center SPA is the HITL review surface: it renders `CommandCard`s pushed over WSS/SSE from the push service, and every approve/edit/suppress/escalate action calls back through the API gateway — the SPA itself holds no write path to any external system (P1, P5). Component boundaries (gateway, rules-core service, dispatch workers, push service, control plane) are defined in [SYSTEM_ARCHITECTURE.md §5](../../docs/engineering/SYSTEM_ARCHITECTURE.md#5-production-component-model); this diagram is the internal view platform/SRE need for on-call — which process owns which failure mode.

![Command Center Internal](../diagrams/output/D-18-command-center-internal.png)

## Runbooks (pointers)

Full runbook content is operational detail owned outside this package; the hooks this volume establishes are:

- **Connector failover** — the per-environment fallback chain (P/none-access order above) is the runbook's decision tree.
- **Credential rotation** — rotates at the Secret Vault seam; no image redeploy required.
- **Exception-card backlog** — unparseable rows surface as `type: "exception"` cards routed to HITL review, never silently dropped.
- **Outage / circuit-breaker** — "capture degraded" state ties directly to the capture-freshness signal above.

## Diagrams

| D-ID | What it shows |
|------|---------------|
| D-05 | Deployment Landscape — multi-environment seam bindings; bank-tier client row defaulted to Azure, unverified |
| D-15 | Rollout Waves — the five access-tier/capture waves the one image serves |
| D-16 | Hosting Model — the two deployment topologies |
| D-17 | Observability — capture-freshness signal + audit standing check |
| D-18 | Command Center internal — component/failure-mode view for on-call |

## References

| Topic | Source of truth | Relationship |
|-------|-----------------|--------------|
| Deployment, blue/green, observability outline | [`../../docs/engineering/DEPLOYMENT_AND_OPERATIONS.md`](../../docs/engineering/DEPLOYMENT_AND_OPERATIONS.md) | references (this chapter elevates, never restates) |
| The five cloud-neutral seams, scaling model | [`../../docs/engineering/SYSTEM_ARCHITECTURE.md`](../../docs/engineering/SYSTEM_ARCHITECTURE.md) | extends |
| Tenant manifest / control-vs-data plane | [`../../docs/engineering/FDAE_CONFIGURATION_LAYER.md`](../../docs/engineering/FDAE_CONFIGURATION_LAYER.md) | references (feeds this chapter's manifest section) |
| Capture-freshness evidence | [`../../docs/OBSERVABILITY_DRY_RUN.md`](../../docs/OBSERVABILITY_DRY_RUN.md) | references |
| Connector catalog, fallback chains | [`../../docs/engineering/CONNECTOR_CATALOG.md`](../../docs/engineering/CONNECTOR_CATALOG.md) | references (feeds rollout-waves section) |
| Architecture principles P3/P4 | [Volume 0 · Architecture Principles](../Volume-0_Product-Vision/Volume-0_Architecture-Principles.md) | extends |

<!-- Status: 🟢 drafted/reviewed -->
