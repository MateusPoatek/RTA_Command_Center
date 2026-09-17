*Audience: RTA Automation team (all skill levels) · Purpose: the play-by-play for standing up the RTA Command Center as its own hosted product — what to build, in what order, and why each service exists.*

---

# RTA Command Center — Production Rollout Sequence

> Traces to principle(s): **P4** (cloud-neutral seams, GCP-first) — see [package README](../README.md#architecture-principles--brd-constraint-map).
> Companion to [Volume 4 · Deployment & Operations](./Volume-4_Deployment-and-Operations.md), which describes the platform's target hosting model in steady state. This document is the **bootstrap sequence** to get there: the concrete, ordered steps for a team standing up a brand-new environment, written to be read by someone who has never provisioned a cloud product before.

## Summary

The RTA Command Center (Floor View + the rest of the command center surfaces) is being built as its **own standalone product for Telus** — it does not run inside, share credentials with, or write to Anshul's existing production platform. The team may study that platform (read-only) for patterns, but the hosting, identity, and data layers here are net-new. This document lays out the ten-step sequence to go from "we have a GitHub repo" to "the team can trigger automations from their laptops and watch them run, with a manager who can see if something breaks."

Two ground rules that shape every step below:

- **Isolation, not integration.** No shared GCP project, service account, or database with Anshul's platform. Studying his design is fair game (architecture patterns, IAM layout, folder structure) — touching his environment is not.
- **New product, own environment.** Because this is a distinct product, it gets its own GCP project, its own repo permissions, its own SLOs — it is not a feature bolted onto something else.

---

## Step 0 — Repo access & branch hygiene (in progress)

**What:** GitHub org access under Telus credentials, with branch protection and required reviews turned on from commit one.

**Why it exists:** Everything downstream (CI/CD, deploy triggers, audit trail of "who shipped what") assumes the repo is the single source of truth and that merges to `main` are gated. Retrofitting this after code is already flowing is painful — nobody wants to go back and re-review six months of unreviewed merges.

**Team action:** Once access lands, set branch protection on `main` (required PR review, required status checks) before the first real commit — not after.

---

## Step 1 — Study Anshul's platform, at arm's length

**What:** A read-only knowledge-transfer pass over Anshul's existing production platform: how his GCP project is organized, how he structured IAM, what his CI/CD pipeline looks like, how he wired observability. No access to his live environment, no shared credentials — this is a design review, not an integration.

**Why it exists:** He has already solved problems the team is about to hit (SOC2-compliant audit trails, GCP folder/project structure, secret rotation). Re-deriving those from scratch wastes time and risks repeating mistakes he already fixed. Borrowing the *pattern* costs nothing; borrowing the *environment* would create a compliance and blast-radius problem (a bug in Command Center could never be allowed to touch his production data).

**Team action:** Schedule time with Anshul for an architecture walkthrough (diagrams, IAM structure, deployment pipeline) — output should be a short internal note on "what we're borrowing and what we're doing differently," not a shared account.

---

## Step 2 — Provision a dedicated GCP project

**What:** A new GCP project (or a small project hierarchy: e.g. `rta-cc-dev`, `rta-cc-staging`, `rta-cc-prod`) under Telus's GCP organization, billed and owned independently of any other platform.

**What it solves:** A GCP *project* is the hard isolation boundary in GCP — IAM policies, quotas, billing, and audit logs are all scoped to it. Separate projects per environment (dev/staging/prod) mean a mistake in dev (a bad IAM binding, a runaway job) cannot reach prod, and a compromised dev credential cannot touch prod data.

**Role in the design:** This is the foundation everything else in this document sits inside. Every other service below (Cloud Run, Secret Manager, Cloud SQL, etc.) is provisioned *inside* this project boundary.

**Team action:** Request project creation through Telus's cloud governance process (whatever ticket/approval flow they use for new GCP projects) — this is usually the longest lead-time item, so start it in parallel with Step 1, not after it.

---

## Step 3 — Identity & access: IAM and service accounts

**What:**
- **IAM (Identity and Access Management)** — who (which human or service) can do what, on which resource.
- **Service accounts** — non-human identities that automations run as, instead of impersonating a person.

**What it solves:** Automations should never run "as a person" — if an engineer leaves or rotates their password, production shouldn't break. A service account is a credential scoped to exactly the actions the automation needs (e.g. "read this one Secret Manager secret, write to this one Cloud Storage bucket") and nothing else. This is the *least-privilege* principle: each automation gets its own narrow identity, not a shared god-credential.

**Role in the design:** Every piece of infrastructure below authenticates as a service account, never as a shared password or a developer's personal login. This is also what makes the audit trail meaningful later (Step 8) — "who did this" resolves to a specific, narrowly-scoped identity.

**Team action:** Create one service account per automation/service (not one shared account for everything), grant only the roles it needs (e.g. `roles/secretmanager.secretAccessor` on one secret, not project-wide).

---

## Step 4 — Secrets: Secret Manager

**What:** GCP Secret Manager — a managed store for credentials, API keys, and tokens, with versioning and IAM-scoped access.

**What it solves:** Credentials (Verint API keys, GTT API tokens, database passwords) must never live in code, config files, or environment variables checked into git. Secret Manager is the single place they live; services fetch them at runtime via IAM, and rotating a credential doesn't require a code change or redeploy.

**Role in the design:** Every automation that needs a credential reads it from Secret Manager at startup, using its service account's permission to that specific secret — connecting the identity model (Step 3) to the actual credentials.

---

## Step 5 — Compute: where automations actually run

**What:** The most likely fit for this team's workload is **Cloud Run** (for request-driven or short scheduled jobs) and/or **Cloud Run Jobs** (for batch/scheduled tasks that run to completion and stop) — plus **Cloud Scheduler** to trigger jobs on a cron.

| Service | What it is | What it solves | When to use it here |
|---|---|---|---|
| **Cloud Run** | Fully managed container hosting; scales to zero when idle | No servers to patch/manage; pay only while a request is being handled | A service that responds to on-demand triggers (e.g. "user clicked run" from Floor View) |
| **Cloud Run Jobs** | Managed containers that run once to completion, not request-driven | Batch work (e.g. a reconciliation pass) that doesn't need to sit listening for traffic | Scheduled or on-demand automation runs |
| **Cloud Scheduler** | Managed cron | Kicks off a Cloud Run Job on a schedule without a human or a server having to remember to do it | Nightly/hourly automations |
| **Compute Engine / GKE** | Raw VMs / Kubernetes | Needed only for long-lived stateful processes that don't fit the container-per-invocation model (e.g. a persistent WebSocket bridge) | Only if a specific automation genuinely needs to stay running continuously — default to Cloud Run first |

**Why this order:** Start with the simplest managed option (Cloud Run/Jobs) for every automation. Only reach for a VM or Kubernetes when a specific workload proves it needs to be always-on and stateful — that's the exception, not the default, because it's the option with the most operational burden (patching, scaling, uptime babysitting).

---

## Step 6 — Calling automations from users' computers

**What:** Users trigger automations through a thin, authenticated API — not by running scripts locally against production credentials.

**What it solves:** If every RTA/analyst runs the automation script on their own laptop, you lose: a single place to see what ran, a single place to enforce auth, consistent versions (no "it works on my machine"), and any hope of an audit trail. Centralizing execution in the cloud means the trigger is the only thing that leaves the user's machine — the credentials, the automation logic, and the data path all stay inside the GCP project.

**How it fits together:**
1. User action (a button in the Command Center UI, or a CLI wrapper) calls an HTTPS endpoint.
2. **Identity-Aware Proxy (IAP)** or the org's existing SSO sits in front of that endpoint — so "who is allowed to trigger this" reuses Telus's existing identity system instead of a bespoke login.
3. The endpoint (a Cloud Run service) validates the request and either runs the logic itself or kicks off a Cloud Run Job.
4. The automation runs using its own service account (Step 3) — never the calling user's credentials.

**Role in the design:** This is the boundary between "something a user can see and click" and "something that runs with real credentials." Keeping that boundary at the API/IAP layer, rather than on someone's laptop, is what makes Step 8 (observability) and Step 9 (audit) possible at all — you can't observe or audit something that never touched your infrastructure.

---

## Step 7 — Data: where state and results live

**What:** Likely a managed relational database (**Cloud SQL for PostgreSQL**) for structured operational data, plus **Cloud Storage** for files/artifacts (exports, logs, reports).

**What it solves:** Automations need somewhere to persist run history, reconciliation results, and configuration — separate from the transient compute that runs them (Cloud Run instances are stateless and disposable). A managed database means backups, patching, and failover are handled by GCP rather than the team.

**Role in the design:** This is the "memory" of the system — what lets the Command Center answer "what happened in the last run" or "what's the current state of account X" without re-computing it every time.

---

## Step 8 — Observability: knowing what's happening without watching it

**What:** Three GCP services work together here:

| Service | What it is | What it solves |
|---|---|---|
| **Cloud Logging** | Centralized, structured log ingestion from every service | Every automation writes logs (what ran, for whom, what happened) to one searchable place instead of scattered across machines |
| **Cloud Monitoring** | Metrics, dashboards, and alert policies | Turns raw logs into "is this healthy right now" — dashboards for the team, alerts (email/Slack) when something breaks, without anyone needing to tail logs manually |
| **Error Reporting** | Automatic grouping/surfacing of exceptions from logs | Catches the "silent failure" case — an automation that errors but nobody notices — by proactively surfacing new/recurring error types |

**Why this matters for a team, not just a system:** Observability is what lets a small team support many automations without one person babysitting each one. Instead of "did anyone check if the 6am job ran," the dashboard and alert answer that automatically.

**Role in the design:** Every service from Step 5 onward (compute, the trigger API, the data layer) emits structured logs with a consistent `run_id`/`actor`/`status` shape, so a single dashboard can show "all automations, are they healthy" rather than five different ad-hoc views.

---

## Step 9 — CI/CD: how code gets from a laptop to production safely

**What:** **Cloud Build** (or GitHub Actions, either works) building a container image on every merge to `main`, pushing it to **Artifact Registry**, then deploying to Cloud Run — with dev → staging → prod as separate, gated steps.

**What it solves:** Removes "someone manually deploys from their laptop" as a failure mode — every deploy is reproducible from the same pipeline, tested the same way, and traceable to a specific commit and reviewer (tying back to Step 0's branch protection).

**Role in the design:** This is the delivery mechanism that connects "code merged in GitHub" to "new version running in Cloud Run" — without it, every other piece of infrastructure above still has to be updated by hand, which doesn't scale past one or two automations.

---

## Step 10 — First end-to-end automation as the template

**What:** Before onboarding every planned automation, take **one** representative automation all the way through: trigger (Step 6) → run (Step 5) → log/alert (Step 8) → deploy via pipeline (Step 9).

**Why it exists:** It's far cheaper to find and fix a gap in this pattern once (e.g. "oh, we forgot to wire alerting on job failure") than to discover it after five automations have been onboarded the wrong way. This first pass becomes the template/checklist for every automation after it.

**Team action:** Pick the lowest-risk, highest-clarity automation as the pilot — not the most complex one. The goal here is validating the *pattern*, not proving the hardest use case first.

---

## Diagrams

| D-ID | What it shows |
|------|---------------|
| (supplementary) | Rollout Sequence — the ten steps above as a flow, with the GCP service at each stage; see [`rollout-sequence-command-center.mmd`](../diagrams/sources/rollout-sequence-command-center.mmd) |

> Note: this diagram is supplementary to the D-01…D-20 library in the [package README](../README.md#diagram-library-d-01--d-20) — it documents the bootstrap sequence for this specific rollout, not a permanent architecture view. If the team wants it formally cataloged, fold it into D-16 (Hosting Model) as a "day-1 sequence" inset.

## References

| Topic | Source of truth | Relationship |
|-------|-----------------|--------------|
| Steady-state hosting model, five cloud-neutral seams | [Volume 4 · Deployment & Operations](./Volume-4_Deployment-and-Operations.md) | extends (this doc is the path to get there) |
| Architecture principles (cloud-neutral seams, GCP-first) | [Volume 0 · Architecture Principles](../Volume-0_Product-Vision/Volume-0_Architecture-Principles.md) | extends |

<!-- Status: 🟡 starter — first pass, written for team onboarding; revise once GCP project is actually provisioned -->
