*Audience: VP / sponsors · Purpose: what's the value, cost, and commitment?*

---

# Volume 1 · Executive Strategy

> Traces to principle(s): **P2, P3, P5** (see [package README](../README.md#architecture-principles--brd-constraint-map)).
> Source of truth: [BRD §1 Executive Summary](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#1-executive-summary), [§5 Account Prioritisation](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#5-account-prioritisation), [§10 Architecture Constraints](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#10-architecture-constraints), [§15 Risks & Mitigations](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#15-risks--mitigations); [`ACCOUNT_SELECTION_METHODOLOGY.md`](../../../Golden_Cluster_Calculations/ACCOUNT_SELECTION_METHODOLOGY.md). This chapter elevates, it does not restate.

## Summary

The RTA Command Center is a proven platform, not a concept: real-time Verint capture, the rules core, and the reconciliation engine have all run live. Its business case rests on a confirmed, audited base — **20 Gold-tier accounts, 6,768 recorded headcount, $242,644–$659,720/year recoverable** — with a much larger candidate expansion (Silver/Bronze) held to a lower evidentiary bar and explicitly not committed. Deployment scales by authoring a tenant manifest, never by forking code, so committing to Wave 1 does not commit engineering to bespoke work for Wave 2 or 3. Risk is bounded structurally, not by policy: no AI write path, human approval before any external action, and five swappable cloud seams.

## The Value Chain

The platform's value chain runs from raw Verint capture to a human-approved external action, with a stable rules core in the middle that never changes per client. See **D-02** for the full flow. The commercially important property for this audience: the *capture* step is adapter-blind (**P2**) — new accounts and even a second WFM vendor (NICE IEX) extend reach without touching the rules, triage, or reconciliation logic that already runs in production.

![D-02 · Product Value Chain](../diagrams/output/D-02-product-value-chain.png)

## The Impact Model

**Ground truth (Gold tier — committed).** Per the audited methodology in `ACCOUNT_SELECTION_METHODOLOGY.md` (source of truth for the *numbers*; supersedes any earlier count or dollar figure):

| Metric | Value |
|---|---|
| Qualifying accounts | **20**, across Americas / Europe / APAC |
| Recorded headcount | **6,768** (14 unique HC pools; 5 accounts qualify on tech stack but carry $0 recorded HC today) |
| Implied RTA staffing | **68** (headcount ÷ 100 agents/RTA) |
| Recoverable $/year — Conservative | **$242,644** |
| Recoverable $/year — Expected | **$461,532** |
| Recoverable $/year — Aggressive | **$659,720** |

Gold qualifies on a strict, five-clause test — Verint scheduling and adherence, GTT time-capture, Workday payroll, all TI-owned (not client/Citrix) — verified per account, not estimated. Dollar figures use real, HC-weighted per-geo hourly rates (not a flat placeholder rate), computed once per region and blended for the combined view. This is a floor, not a ceiling: it already understates value because 5 of the 20 accounts have no recorded headcount yet.

**Candidate expansion (Silver/Bronze — illustrative only, not committed).** The Silver tier (≥2 of 3 enabling systems present, not Citrix/VDI-locked, not PCI-flagged) is currently sized at **85 accounts / 12,258 HC** as a first-pass population, not yet individually re-verified per account against its own access-method criteria. Its dollar figures borrow the Gold tier's blended rate as an explicit placeholder — Silver has no independent per-geo rate workup. Bronze (Citrix/VDI-locked, a genuinely different stack, and/or PCI-restricted) is a **confirmed seed list of 7+ account families, 1,478 known HC, not fully sized**, and carries no dollar estimate at all pending access negotiation. Neither Silver nor Bronze should be presented to sponsors as committed value — only as directional evidence that the addressable base extends well beyond the 20 Gold accounts, and further still once a NICE IEX capture adapter opens the second dominant WFM vendor already read by Telus's existing automation platform.

**PCI status — flagged gap, not asserted.** No PCI-DSS flag, cardholder-data indicator, or compliance-scope column exists in any of the four authoritative source files checked. PCI status for any Bronze or Bronze-candidate account is **unknown, not "not applicable,"** and must not be inferred from account name or industry (BRD R-13). No account should be committed to a delivery date while its PCI status is unconfirmed.

## The Deployment-Tier Commitment

Rollout is sequenced by how reachable each account's capture path is (**D-15**, five capture waves) and, separately, by how each account is classified for onboarding priority (**D-19**, three tiers — Gold/Silver/Bronze). The two are linked but distinct: D-15 answers "what capture mechanism does this account need," D-19 answers "which accounts do we commit to first, and why."

![D-15 · Rollout Waves](../diagrams/output/D-15-rollout-waves.png)

![D-19 · Migration Waves](../diagrams/output/D-19-migration-waves.png)

| Wave | Population | Commitment level |
|---|---|---|
| **Gold** | 20 accounts, 6,768 HC, 3 regions | Ready today — no negotiation, no new integration beyond what the POC proved |
| **Silver** | 85 accounts (candidate), 12,258 HC | Requires one additional time-capture adapter per tool variant; not yet individually cleared |
| **Bronze** | 7+ confirmed families, 1,478 known HC (partial) | Access negotiation and/or PCI/legal confirmation required before any date is committed |

The deployment topology itself is likewise tiered, not one-size-fits-all: bank-tier clients receive a dedicated stack in their own cloud/VPC, while permissive clients are Telus-hosted — the same container image supports both, with topology as a manifest property (AC-005, **D-05**). Onboarding any account, in any wave, is authoring one new tenant manifest — never a code fork (**P3**).

![D-05 · Deployment Landscape](../diagrams/output/D-05-deployment-landscape.png)

## The Risk Posture

Sponsor-facing risk is bounded by the same five architecture principles that govern engineering design (see [Volume 0](../Volume-0_Product-Vision/Volume-0_Architecture-Principles.md)), read here as risk controls rather than design statements:

| Principle | Risk it controls |
|---|---|
| **P1 — No AI write path** | Bounds AI blast radius structurally: an audit query for `actor_type=system AND action_type=write_external` must return zero rows, for any window, indefinitely. A non-empty result is a governance breach, not a bug. |
| **P2 — Adapter-blind rules core** | De-risks expansion: new accounts and even a second WFM vendor extend reach without destabilizing the rules logic already proven in production. |
| **P3 — One OCI image, many tenant manifests** | De-risks fleet operation: one patch, one release, applied uniformly — no client-specific branch can silently drift from the audited baseline. |
| **P4 — Cloud-neutral seams, GCP-first** | De-risks the deployment-tier commitment above: bank-tier in-client-cloud and permissive Telus-hosted topologies both run the same image; the committed first target (Telus Digital GCP) is real, not theoretical, without losing portability. |
| **P5 — Human-in-the-loop before any external write** | De-risks accountability: nothing reaches an agent, a channel, or a ticketing system without a named human's explicit approval, logged. |

Named, sponsor-relevant risks tracked in the BRD's risk register that bear directly on this chapter's numbers: PCI status unconfirmed for Bronze (**R-13**, above); extend-path economics not yet fully transparent, so run-cost claims should not be treated as final until confirmed (**R-12**); and a scope boundary still to be resolved against a sister initiative's overlapping attendance-reporting business case, to avoid double-counting savings if both reach the same executive audience (**R-09**).

## Diagrams

| D-ID | What it shows |
|------|---------------|
| D-02 | Product Value Chain — capture → rules core → HITL → dispatch |
| D-15 | Rollout Waves — five capture tiers, one adapter-blind core |
| D-05 | Deployment Landscape — bank-tier vs. permissive-client topologies |
| D-19 | Migration Waves — Gold/Silver/Bronze onboarding sequence |

## References

| Topic | Source of truth | Relationship |
|-------|-----------------|--------------|
| Business case, market opportunity | [BRD §1](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#1-executive-summary) | references (this chapter elevates, never restates) |
| Account tiering and impact numbers | [`ACCOUNT_SELECTION_METHODOLOGY.md`](../../../Golden_Cluster_Calculations/ACCOUNT_SELECTION_METHODOLOGY.md) | references (ground truth for Gold; Silver/Bronze illustrative) |
| Architecture Constraints (AC-001–AC-007) | [BRD §10](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#10-architecture-constraints) | references |
| Risks & Mitigations | [BRD §15](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#15-risks--mitigations) | references |
| Architecture Principles (P1–P5) | [Volume 0](../Volume-0_Product-Vision/Volume-0_Architecture-Principles.md) | extends (this chapter reframes as risk posture) |

<!-- Status: 🟢 drafted/reviewed -->
