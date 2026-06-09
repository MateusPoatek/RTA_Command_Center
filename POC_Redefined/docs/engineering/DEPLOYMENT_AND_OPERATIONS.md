*Audience: platform / SRE + deployment engineers. Purpose: how to ship and run the one image into either topology, and how to operate it.*

> **🟠 STATUS: OUTLINE.** Section structure with per-section intent; content to be filled next pass.

---

# Deployment & Operations

## 1. The OCI image
*Single container = the portability layer (D2); build, sign, SBOM, pinned digests, non-root, hardened base.*

## 2. The two topologies (D1)
*In-client-cloud single-tenant vs vendor-hosted isolated — the two deployment topologies (a separate axis from the `full`/`partial`/`none` access tier). What differs is config (network, IdP, store bindings) — not the image.*

## 3. Per-client configuration
*The tenant manifest is the deployment input ([FDAE_CONFIGURATION_LAYER.md](./FDAE_CONFIGURATION_LAYER.md)); the image self-configures at boot; secrets injected from the client vault via managed identity.*

## 4. Cloud-neutral deployment targets
*Managed-runtime first (Azure Container Apps / Cloud Run / ECS-Fargate); Kubernetes (AKS/GKE/EKS) only at multi-client density or client mandate. Provider specifics are reference-only, not a decision (cloud-agnostic policy).*

## 5. Release strategy
*Blue/green + per-tenant canary + rollback; drain the push (WSS) hub on cutover so live RTAs aren't dropped mid-shift. **Config promotion ≠ image deploy** — the control plane handles config; CI/CD handles the image.*

## 6. Observability
*Metrics / logs / traces; the **capture-freshness signal** (interaction-driven refresh, no idle timer, gentle re-trigger — from [../OBSERVABILITY_DRY_RUN.md](../OBSERVABILITY_DRY_RUN.md)); the **audit query "actor=ai write → zero rows" as a standing operational check**; SIEM export for in-client-cloud deployments.*

## 7. Runbooks
*Connector failover (the fallback chain); credential rotation; exception-card backlog handling; outage playbook hooks; circuit-breaker / "capture degraded" response.*

## 8. Capacity & cost
*Per-tenant sizing; the 60s poll budget; reference the internal cost model (board materials — not in this repo).*
