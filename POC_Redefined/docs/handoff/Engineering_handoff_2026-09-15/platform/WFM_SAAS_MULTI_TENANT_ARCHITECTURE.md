# From Local Demo to Multi-Tenant SaaS — WFM Automation Platform

*Audience: the team about to deploy this on Telus infrastructure for the first time — assumes no prior GCP, Kubernetes, Terraform, or Telus-platform experience.*
*Purpose: explain, didactically, what "becoming a SaaS for 20 Golden Tier accounts" actually requires — the target architecture, the gap from where we are today, the Telus services involved and why each one matters, and the specific questions we need answered (mainly by Viviana's team) before we can move forward.*
*Companion documents: [GCP_DEPLOYMENT_101.md](GCP_DEPLOYMENT_101.md) (single-tenant GCP deployment basics — read that first if the words "GCP Project," "Cloud Run," or "WIF" are new to you), [DEMO_DEPLOYMENT_CHECKLIST.md](DEMO_DEPLOYMENT_CHECKLIST.md) (the local 3-account demo we ran before any of this).*

---

## Read this first — the one confusing naming collision

Telus's own documentation uses the word **"tenant"** to mean *our team's GCP project* (as in, "create your GCP tenant project"). We are about to use the word **"tenant"** to mean *a client account* (Epic Games, Roblox, Corelogic, Zillow...). These are two completely different things that happen to share a name.

Throughout this document:
- **"Telus tenant project"** = the one GCP project our whole platform lives in (we likely only need *one* of these, or a small handful for prod/non-prod).
- **"Client tenant"** or just **"tenant"** = one of our ~20 Golden Tier client accounts, each of whom must see only their own data.

All of the multi-tenancy work described below happens **inside** our one Telus tenant project — it's an application-level concern, not something Telus's infrastructure does for us automatically.

---

## Part 1 — Glossary

*(Builds on the glossary in GCP_DEPLOYMENT_101.md — only new or SaaS-specific terms are repeated here.)*

| Term | Plain-language meaning |
|------|------------------------|
| **Client tenant** | One of our client accounts (Epic Games, Zillow, Corelogic...). Each needs its own data, its own credentials, and must never see another tenant's information. |
| **Tenant manifest** | A config file (JSON) that says everything specific to one client tenant — which features they get, which Verint/GTT credentials to use, which region their data lives in. The *code* is identical for every tenant; only the manifest differs. This is the core design decision already made for this platform (see Part 3, Principle P3). |
| **Multi-tenancy** | Running one shared application that safely serves many separate customers at once, each unaware of the others. The opposite of "one deployment per customer," which doesn't scale to 20+ accounts. |
| **Tenant isolation** | The guarantee that Client A's data, credentials, and requests never leak into Client B's view. Can be enforced at different layers (network, database, identity/token) — see Part 3. |
| **`tenant_id` claim** | A piece of information embedded in a user's login token that says "this session belongs to Epic Games." Every request checks this before returning any data — this is how the platform tells tenants apart at runtime. |
| **Row-level security / schema-per-tenant / project-per-tenant** | Three different strategies for keeping tenants' data apart in a database. *Row-level*: one shared table, every row tagged with a tenant ID, filtered on every query. *Schema-per-tenant*: separate schema (a "sub-database") per tenant in one database. *Project-per-tenant*: a completely separate GCP project per tenant — most isolated, most operational overhead. **Which one we use is not yet decided** — see the open questions in Part 5. |
| **Credential vault / Secret Manager** | Where actual passwords/API keys/service-account credentials live — never in code, never in a config file committed to Git. The app asks the vault for a secret **by reference** (a name/path) at the moment it needs it. |
| **`credentialRef`** | The reference (not the actual secret) stored in a tenant's manifest — e.g. `secrets://epicgames/verint`. The real Verint password for Epic Games lives in Secret Manager; the manifest just points at it. |
| **Kong (API Gateway)** | The system that sits in front of all Telus-hosted services and routes incoming requests to the right backend. Relevant to us because Kong supports **host-based routing** — meaning it can be configured to know that `epicgames.wfm-platform.telus.com` and `zillow.wfm-platform.telus.com` are the same app, different tenants. |
| **ADR (Architectural Decision Record)** | A short Telus document that captures one specific architecture decision and its rationale — e.g. "we will use Secret Manager, not environment variables, for secrets" (ADR299/377). These are the source of truth for "what's the Telus-approved way to do X." |
| **Parameter Manager** | A newer GCP tool that sits on top of Secret Manager, letting an app fetch a whole bundle of config + secrets in one call, scoped per-app. Relevant to us because a tenant manifest is exactly this kind of "bundle of config + secret references" — Parameter Manager may be a better fit than raw Secret Manager once we have 20 tenants' worth of config to manage. |
| **Kraken** | Telus International's internal employee master data record system — one shared database of *every* TI employee, sourced from Workday, managed by **Viviana's team**. We use it to resolve an agent's Workday ID (needed to reconcile Verint records with GTT attendance records), because we don't have direct Workday access. **It is not tenant-scoped** — it's one flat system covering Telus's entire book of business, not partitioned by client. |
| **GTT** | Global Time Tracker — produces the attendance/reconciliation reports. Currently accessed with **one shared service-account key** for all demo accounts. |
| **Verint** | The client's workforce management system of record (read-only access). Currently accessed with **one shared login per environment**, not one login per client tenant. |
| **Golden Tier** | The ~20 highest-priority client accounts this platform is meant to eventually serve as a full SaaS product (per the Golden Cluster cost model work) — Epic Games, Roblox, Corelogic, Zillow, and others. |

---

## Part 2 — Where we are today vs. where a SaaS needs to be

| Dimension | Today (local demo) | Needed for SaaS (20 Golden Tier accounts) |
|---|---|---|
| **Where it runs** | One laptop, started by hand | Telus GCP, always-on, auto-deployed from GitHub (see GCP_DEPLOYMENT_101.md) |
| **How many accounts it knows about** | Effectively one (Epic Games hardcoded); Roblox/Corelogic added ad hoc for a demo | All ~20 Golden Tier accounts, addable without a code change |
| **Verint credentials** | One shared login, used manually in a browser | One credential per client tenant, referenced by the tenant's manifest, stored in Secret Manager — **provisioning/rotation plan not yet designed** |
| **GTT credentials** | One shared service-account key file on a laptop (`GTT_JSON/`) | One (or clearly scoped) service-account credential per tenant or per tenant-group, in Secret Manager, accessed via Workload Identity Federation — **not yet designed** |
| **Kraken access** | Not connected yet at all | One shared, read-only, rate-limited connection (Kraken itself isn't tenant-scoped) — **access not yet granted (see Part 5)** |
| **Who sees what** | Whoever's at the laptop sees whatever account is currently configured | Each client's users see only their own tenant's data, enforced by `tenant_id`-scoped authentication |
| **Data storage isolation** | N/A — no real persistent multi-account storage yet | Needs an explicit decision: row-level security vs. schema-per-tenant vs. project-per-tenant (not yet decided — Part 5) |
| **Adding a new client** | Manual code edits in 3 files | Author one new tenant manifest, zero code changes (already the design principle — see Part 3) |
| **Deployment** | `npm run dev` by hand | GitHub Actions → Cloud Build → Cloud Deploy, auto-triggered on merge (see GCP_DEPLOYMENT_101.md) |

The important thing this table shows: **the target design already exists on paper** (tenant manifests, credential-by-reference, `tenant_id` scoping). What's missing is the *operational* plan for running that design at 20-tenant scale for three specific external systems: Verint, GTT, and Kraken.

---

## Part 3 — Services and architecture decisions (the "why," not just the "what")

This section is the didactic core — for each piece, what it is, why we need it, what problem it solves, and why it matters specifically for turning this into a production SaaS.

### 3.1 The tenant manifest model (Principle P3)

**What it is:** Instead of writing separate code (or forking the repo) for each client, we build **one container image**. Every difference between Epic Games and Zillow — what features they get, what credentials to use, what region their data lives in — is described in a small JSON file (a "manifest") that the app reads at startup or per-request.

**Why this matters for a SaaS:** Without this, adding client #21 means touching code, which means a code review, a deploy, and a risk of breaking client #1–20 in the process. With a manifest model, onboarding a new client is a config change — reviewable, low-risk, and doesn't require an engineer who understands the whole codebase.

**Status:** Already the documented architecture principle (P3, in the existing Volume-2/Volume-3 architecture docs). This part isn't a gap — it's the foundation everything else below builds on.

### 3.2 Credential-by-reference + Secret Manager (and Parameter Manager)

**What it is:** A tenant's manifest never contains an actual password. It contains a *pointer* — `secrets://epicgames/verint` — and the app resolves that pointer against **GCP Secret Manager** at runtime, using its own service identity (not a human's login) to prove it's allowed to read it.

**Why it matters:** This is the direct fix for the exact risk we've been managing by hand — a GTT key sitting in a file on a laptop, or a bearer token pasted in a chat. If a manifest or a log file leaks, there's no secret in it to steal — only a reference, which is useless without also compromising the vault's access controls.

**Telus's current guidance (ADR299, ADR377, ADR466):** pull secrets from Secret Manager at runtime, never store them in environment variables or code. **Parameter Manager** (ADR466, approved 2026) is a newer layer on top of Secret Manager purpose-built for "fetch a whole bundle of config + secrets in one call, scoped per app" — worth evaluating directly against our tenant-manifest shape, since that's almost exactly what it's designed for.

**Status:** The *pattern* is designed (manifest schema already has `credentialRef` fields). The *provisioning process* for 20 tenants' worth of real Verint/GTT credentials is not yet designed — see Part 5.

### 3.3 Workload Identity Federation (WIF)

**What it is:** Covered in depth in GCP_DEPLOYMENT_101.md — the mechanism that lets our deployment pipeline (and our running application) prove its identity to GCP without a stored password.

**Why it matters here specifically:** WIF is how our app's Cloud Run service gets permission to read Secret Manager in the first place. It's the "who's allowed to open the vault" layer underneath the "what's in the vault" layer described above.

### 3.4 Identity/token-based tenant isolation (`tenant_id` claim)

**What it is:** When a user logs in, their session token carries a `tenant_id` claim (e.g. `"epicgames"`). Every API request is checked against this before any data is returned — a valid Epic Games session literally cannot fetch Zillow's records, because the check happens before the request reaches the application logic.

**Why it matters:** This is the actual mechanism that answers your original question — "how do I make sure what Epic Games sees is different from Zillow." It's enforced at the front door (the API gateway), not hoped-for deep in application code where a bug could leak data.

**Status:** Documented as the design (Volume-3, trust boundary D-14). Not yet built or tested at multi-tenant scale — today there's effectively one implicit tenant.

### 3.5 Database-level tenant isolation

**What it is:** Even with `tenant_id`-scoped API access, the underlying data store needs its own isolation strategy. Three real options, in increasing order of isolation *and* operational cost:
1. **Row-level security** — one shared database, every row tagged with a tenant ID, every query filtered. Cheapest to operate, but a single bug in the filtering logic can leak data across tenants.
2. **Schema-per-tenant** — one database, separate schema per client. Stronger isolation, moderate operational cost (schema migrations run 20 times).
3. **Project-per-tenant** — a fully separate GCP project per client. Strongest isolation, highest cost and complexity — usually reserved for clients with hard compliance/data-residency requirements.

**Why it matters:** This is a real, consequential decision with no universally "right" answer — it depends on how strict the Golden Tier clients' data-handling requirements are (some, like a bank, may contractually require stronger isolation than others).

**Status:** **Not yet decided.** This is one of the most important open questions in Part 5 — likely not for Viviana's team, but for whoever owns the platform's data architecture.

### 3.6 Kong API Gateway + host-based routing

**What it is:** Kong sits in front of Telus-hosted services and routes traffic. It supports **host-based routing** — meaning a request to `epicgames.ourapp.telus.com` and one to `zillow.ourapp.telus.com` can be routed to the same backend service while still telling it which tenant is calling.

**Why it matters:** This gives us an option for how clients *access* the platform (a distinct-feeling URL per client) without requiring a separate deployment per client. Worth exploring once we're past the "does the core multi-tenant flow work" stage.

### 3.7 Terraform and Kubernetes — the "why" of tools you haven't used before

**Terraform** (introduced already in GCP_DEPLOYMENT_101.md): instead of clicking through a web console to set up permissions, secrets access, or infrastructure, we write it as text files in the `tf-infra` repo. **Why this matters for a SaaS specifically:** when you have to replicate the same setup pattern 20 times (once per client's credential scope, for example), having it as reviewable, repeatable code — rather than 20 people manually clicking through consoles slightly differently each time — is what keeps the system consistent and auditable.

**Kubernetes / GKE**: a system for running many containers together, used at Telus for the "standard" production path (shared clusters, divided into namespaces per team). **For this app specifically, we're recommending Cloud Run over GKE** (see GCP_DEPLOYMENT_101.md) because a stateless web app with no persistent compute-heavy workload doesn't need Kubernetes's complexity. If per-tenant *compute* isolation ever becomes a requirement (e.g., one client needs guaranteed dedicated CPU), that's when GKE namespaces would become relevant — not before.

### 3.8 Risk Engine / AutoCRQ / protected branches

Already covered in GCP_DEPLOYMENT_101.md — the automated approval-and-audit-trail layer for any change to a production service. **Why it matters more once we're a SaaS:** with 20 paying-adjacent clients depending on uptime, "an unreviewed change broke production for everyone" is a much bigger blast radius than in a single-account demo. ADR420 (protected branches + secret scanning) is directly relevant too — it's the enforcement that a `credentialRef` never accidentally gets replaced with a real secret in a commit.

---

## Part 4 — How this actually becomes a SaaS (the sequence)

1. **Decide the database isolation strategy** (Part 3.5) — this affects everything downstream, so it should be settled first, in consultation with whoever owns data architecture (not Viviana's team — this is likely an internal/WFM architecture decision).
2. **Design and test the credential provisioning process** for one *new* tenant end-to-end — i.e., "what are the exact steps to onboard tenant #4 (say, Zillow) with its own Verint login, GTT scope, and Secret Manager entries" — and write it down as a repeatable runbook, not tribal knowledge.
3. **Resolve the Kraken access question** (Part 5) — since it's a shared, non-tenant-scoped system, this is a one-time integration, not a per-tenant repeat, but it needs to be nailed down before reconciliation reporting works for *any* tenant beyond a manual demo.
4. **Build and test `tenant_id`-scoped authentication** for at least two tenants side by side, specifically trying to break it (a QA/security exercise: can a Epic Games session ever see Zillow data, deliberately trying to make it happen).
5. **Wire the GCP deployment pipeline** (per GCP_DEPLOYMENT_101.md) so the whole thing deploys automatically, then repeat step 2's onboarding runbook for a second and third real tenant to prove it's actually repeatable and not just "worked once."
6. **Only then**, consider scaling to the full 20 — at that point it's an operational rollout, not an architecture question.

---

## Part 5 — Questions we need answered before going further

### From Viviana's team specifically (Kraken)

1. **Is Kraken's employee data filterable by client/account today**, or is it genuinely one flat dataset requiring us to filter on our side after pulling it? This determines whether we need row-level filtering logic in our own code, or whether Kraken can scope a query for us.
2. **What is the process and timeline to get a service account granted read access** to the Kraken employee master (this is the AD-002 dependency already flagged as open in the BRD)?
3. **What are the rate limits / usage quotas** on Kraken access, and do they change based on how many Golden Tier accounts' worth of lookups we're running through it concurrently?
4. **Is there a data governance or compliance review required** before Kraken data is used inside a client-facing (external, non-Telus-internal) reporting flow — since Kraken holds Telus *employee* PII, and our downstream consumers are client-facing dashboards?
5. **Who is the technical point of contact for integration questions** (auth method, response schema, SLAs) once access is granted, versus who owns the access-approval decision?

### For whoever owns Verint's vendor/account relationship

6. Does Verint's own account/org model support **one login per client tenant** cleanly, or would we be provisioning within a single Verint org and relying entirely on our own filtering to separate tenants?
7. What is Verint's position (contractually or technically) on **automated, non-human service accounts** logging in — today we use a human-driven browser session; is a proper API/service-account integration available or does it require a different licensing tier?

### For whoever owns GTT's vendor/account relationship

8. Does the existing GTT service account (`td-sa-wfm-gtt-reports02`) support **scoping by `functionalArea`/`sites` per request** safely for 20 concurrent tenants, or does each tenant need its own distinct service account?
9. What is the **rotation policy and SLA** for GTT credentials, and who do we contact when a key needs replacing outside of Maximiliano's involvement (i.e., is there a team, not just one person, we can rely on at SaaS scale)?

### Internal (not vendor-facing) — to resolve before or alongside the above

10. Who owns the **database isolation strategy decision** (Part 3.5) — is this a decision the WFM architecture team makes, or does it need security/compliance sign-off given real client data is involved?
11. Do any of the 20 Golden Tier accounts have **contractual data-residency or isolation requirements** stronger than "logically separated" (e.g., requiring physically separate infrastructure)? This could force project-per-tenant for at least some clients even if row-level security is fine for most.
12. What's the **actual threat model** we're designing against — accidental cross-tenant data leakage from a bug, or a more adversarial scenario (one client's compromised credentials being used to access another's data)? The isolation strategy chosen in Part 3.5 should match the real risk, not be over- or under-built relative to it.

---

## Appendix A — Row-level vs. schema-per-tenant vs. project-per-tenant, explained

*(Expands on Part 3.5. Referenced from a team walkthrough on 2026-08-26 — kept here so we can come back to it when the database isolation decision (open question #10/#11) is actually made.)*

Think of it as a spectrum: how much do you physically separate tenants' data, versus how much do you just *promise* to keep them apart in software? Each step right costs more to run, but leaks are harder to cause by accident.

### 1. Row-level security — "one shared room, everyone's stuff labeled"

**What it is:** One database, one set of tables, shared by everyone. Every row has a `tenant_id` column. Epic Games' agent records and Zillow's agent records live in the *same table*, right next to each other — the only thing telling them apart is that column.

```
agents table:
| id | tenant_id  | name          | ... |
|----|------------|---------------|-----|
| 1  | epicgames  | Diego Salazar | ... |
| 2  | zillow     | Maria Lopez   | ... |
| 3  | epicgames  | Ana Torres    | ... |
```

Every single query has to include `WHERE tenant_id = 'epicgames'` — either the app adds it every time, or (better) the database itself enforces it automatically per session (Postgres calls this "row-level security" natively).

**Analogy:** A shared filing cabinet where every folder has a colored sticker. Nothing stops someone from grabbing the wrong folder — they just usually don't, because the labels are always checked.

**Pros:** Cheapest to run. One database to patch, back up, monitor. Adding tenant #21 is just... inserting rows with a new `tenant_id`.

**Cons:** The isolation lives entirely in *code discipline*. If one developer writes one query and forgets the `WHERE tenant_id = ...` filter, that query returns every tenant's data mixed together. This is the scenario where a genuine, embarrassing cross-client data leak happens — not from an attack, but from a missed filter in a routine feature.

### 2. Schema-per-tenant — "one building, separate locked units"

**What it is:** Still one database server, but each tenant gets its own **schema** (think of a schema as a mini-database-within-a-database — its own set of tables, same names, but walled off). Epic Games' `agents` table and Zillow's `agents` table are structurally identical but live in totally separate namespaces: `epicgames.agents` vs `zillow.agents`.

**Analogy:** One apartment building, but each tenant has their own locked unit with their own furniture. You can't wander into someone else's apartment by accident — you'd need their key.

**Pros:** A missing `WHERE` clause can't leak data across tenants anymore, because the *connection itself* is scoped to one schema — there's no query that can accidentally see both. Meaningfully safer than row-level for the "oops" scenario.

**Cons:** Now schema migrations (like adding a new column) have to run once *per tenant schema* — 20 times instead of once. More operational moving parts: connection routing needs to know which schema to point each request at. Still shares the same physical database server, so a database-level outage or a noisy-neighbor tenant hammering the server can still affect everyone.

### 3. Project-per-tenant — "separate buildings entirely"

**What it is:** Each tenant gets a **completely separate infrastructure stack** — potentially its own GCP project, its own database instance, sometimes its own compute. Epic Games' entire environment (database, secrets, maybe even its own copy of the app) is physically distinct from Zillow's.

**Analogy:** Not an apartment in the same building — a separate house on a separate street. Even if one house burns down, it doesn't affect the neighbors.

**Pros:** The strongest isolation there is. A bug, an outage, a security incident, even a rogue employee — the blast radius is contained to one tenant. This is what you reach for when a client has a *contractual or regulatory* requirement for dedicated infrastructure (common in banking, healthcare, government contracts).

**Cons:** Expensive and heavy to operate. 20 tenants = 20 databases, 20 sets of infrastructure to patch, monitor, and pay for. Onboarding a new tenant is now closer to "stand up a new mini-deployment" than "insert a config row."

### How to actually choose

You don't have to pick just one for all 20 accounts — a common real-world pattern is:

- **Row-level for most tenants** — the default, cheap, fine for clients with no special contractual requirement.
- **Project-per-tenant reserved for the exception** — if, say, one Golden Tier client's contract specifically demands dedicated infrastructure or data residency, they get that treatment while everyone else stays on the shared model.

This is exactly why open question #11 matters — "do any of the 20 Golden Tier accounts have contractual data-residency or isolation requirements stronger than logically separated" — because the honest answer might be "row-level for 18 of them, project-per-tenant for 2," not one blanket answer for all 20.

---

## Where to go for more detail

| Topic | Reference |
|---|---|
| GCP project setup, Cloud Run, WIF basics, CI/CD pipeline | [GCP_DEPLOYMENT_101.md](GCP_DEPLOYMENT_101.md) |
| The 3-account local demo we ran before any of this | [DEMO_DEPLOYMENT_CHECKLIST.md](DEMO_DEPLOYMENT_CHECKLIST.md) |
| Secret Manager guidance | ADR299, ADR377, ADR466 (search by number in Simplify) |
| Protected branches / secret scanning | ADR420 |
| Repo structure for multiple services | ADR351 (poly-repo preferred; monorepo AutoCRQ not yet supported) |
| Existing tenant-manifest design | Volume-2 / Volume-3 architecture docs, `docs/engineering/FDAE_CONFIGURATION_LAYER.md`, diagram D-07 |
