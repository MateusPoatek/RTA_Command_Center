*Audience: data + platform engineers, legal/compliance liaisons. Purpose: how data is isolated, classified, tokenized, and retained across tenants, and the three-store model.*

> **🟠 STATUS: OUTLINE.** Section structure with per-section intent; content to be filled next pass. Diagrams `08-multitenant-topology.mmd` and `09-dataflow-pii-tokenization.mmd` ship with this document when written.

---

# Data Governance & Multi-Tenancy

## 1. Tenant model
*Tenant = client; the tenant manifest is the governing artifact ([FDAE_CONFIGURATION_LAYER.md](./FDAE_CONFIGURATION_LAYER.md)); **access tier** (`full`/`partial`/`none`) and **deployment** (in-client-cloud/vendor-hosted) are manifest properties (D1).*

## 2. Isolation tiers (D1 / D3)
*What "isolated" means at storage, compute, network, and key level per deployment. Recommendation, strongest→weakest: separate DB per tenant (CIBC, region-locked, in-client-cloud) > separate schema (vendor-hosted) > row-level tenant key (not for in-client-cloud/bank deployments).*

## 3. The three-store model (D2 seams)
*Operational + audit store (immutable, low-latency, compliance) · intelligence store (derived, per-tenant, analytical) · secrets vault. The operational store is the source of record; the intelligence store is derived and rebuildable from the event stream — keep them separate.*

## 4. Data classification
*Extend the `DataClass` honesty labels ([../../command-center/src/domain/types.ts](../../command-center/src/domain/types.ts)) for production lineage; add PII sensitivity tiers.*

## 5. PII tokenization gate
*Pseudonymize identity (name / Verint id / Workday id → tenant-scoped surrogate key via per-tenant HMAC); the name↔surrogate map lives only in the access-controlled operational store; the warehouse stores surrogate keys only; **LOB from config, never OCR**; `Hire_Date` → tenure bucket. The identity surrogate is also the schedule↔clock-in join key the attendance feature needs ([../FUTURE_FEATURES.md](../FUTURE_FEATURES.md)).*

## 6. Retention & deletion
*Per-store, per-tenant retention from the manifest; append-only audit exemption; right-to-erasure against an append-only store = delete the surrogate-map entry (orphans/anonymizes warehouse rows without a destructive rewrite); audited deletion. Fixes the `runs/` raw-PII problem (treat raw capture as transient; never persist raw bodies durably; `.gitignore` + purge).*

## 7. Code governance
*One signed image; config (manifest) vs code separation; no per-client code forks; the governance invariant (no AI writes) as a data-integrity guarantee.*

## 8. Cross-client benchmarking — design-only (D3)
*Default: no cross-tenant reads, ever, enforced physically by the isolation model. Shape the surrogate-key + aggregation model so opt-in, k-anonymized, legal-gated benchmarking is **possible later** (computed in a separate aggregation environment that only receives pre-anonymized rollups). For CIBC: out of scope until legal signs off; make accidental commingling impossible.*
