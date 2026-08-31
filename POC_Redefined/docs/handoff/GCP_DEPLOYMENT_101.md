# GCP Deployment 101 — Hosting the WFM Automation Platform on Telus GCP

*Audience: complete beginners to this process — assumes no prior GCP/Telus-platform knowledge.*
*Purpose: walk through, step by step and in plain language, what happens between "we got an approved GCP environment" and "the app is live and updates itself when we push to GitHub."*
*Source: Telus's internal Simplify platform (`simplify.telus.com`) — the "golden paths" (Telus-approved standard procedures) for deploying a service and connecting CI/CD.*

---

## The big picture, in one paragraph

Right now the WFM Automation Platform runs **only on one laptop** — you start it by hand, and it stops when the laptop closes. "Deploying to GCP" means moving it to a computer that Telus manages in the cloud, that's always on, reachable by URL, and that **updates itself automatically** whenever someone pushes new code to GitHub — instead of someone manually copying files to a machine. Everything below is the machinery that makes that automatic update safe, tracked, and approved.

Think of it in four layers, built in this order:

```
1. A "home" for the app       →  the GCP Project
2. A place to run it          →  Cloud Run (a Telus-managed server)
3. A trusted door between     →  Workload Identity Federation (WIF)
   GitHub and that home
4. An assembly line that      →  GitHub Actions → Cloud Build → Cloud Deploy
   moves code from GitHub          + two automatic gates (Risk Engine, AutoCRQ)
   to that server automatically
```

We'll walk through each layer.

---

## Glossary — read this first, refer back as needed

| Term | Plain-language meaning |
|------|------------------------|
| **GCP** | Google Cloud Platform — the cloud provider Telus uses to run applications. Think of it as "the cloud computer." |
| **GCP Project** | A walled-off container inside GCP for one application's resources — its own billing, its own permissions, its own settings. Like renting one unit in a building instead of owning the whole building. |
| **Cloud Management Hub** | The Telus web page where you request/create a new GCP Project. You don't email IT — you click through a form. |
| **Cloud Run** | A Google service that runs your app in a container (see below) without you having to manage servers, disks, or operating systems. You give it code; it gives you a URL. This is the simplest option and the one we recommend for this app. |
| **GKE (Google Kubernetes Engine)** | A more powerful, more complex way to run many containers together (Telus's "standard" for big production services). Overkill for this app — skip it unless someone specifically asks for it. |
| **Container** | A packaged version of the app (code + everything it needs to run) that behaves identically wherever it's run. Built from a `Dockerfile`. If you don't already have one, this is a prerequisite step. |
| **Namespace** | Only relevant if using GKE (a way to keep your app's containers separate from other teams' containers on a shared cluster). Not needed for the Cloud Run path. |
| **tf-infra repository** | A GitHub repository that Telus auto-creates for you the moment your GCP Project exists. It holds **Terraform** (infrastructure-as-code) — instead of clicking buttons in a web console to set up permissions/databases/etc., you write it as text files here and it applies itself. |
| **Terraform** | A tool that turns text config files into real cloud infrastructure. You'll mostly copy-paste and adapt examples here, not write from scratch. |
| **Workload Identity Federation (WIF)** | The mechanism that lets GitHub Actions (see below) log into your GCP Project **without a password or secret key file**. Telus requires this — using a long-lived key file (like the GTT service-account key we already manage locally) is explicitly the pattern they're moving *away* from, because a leaked key file is a leaked door. WIF is a "who are you, prove it cryptographically, every time" handshake instead. |
| **GSA (Google Service Account)** | A non-human "identity" your app or pipeline uses to talk to GCP APIs. Different from your personal Telus login. |
| **KSA (Kubernetes Service Account)** | Same idea as a GSA, but for GKE only. Not relevant on the Cloud Run path. |
| **GitHub Actions** | Automation that runs directly inside your GitHub repo — e.g., "whenever code is pushed to `main`, build it and deploy it." This is the first link in the deployment chain. |
| **Cloud Build** | Google's service that takes your code and turns it into a container image. The middle link. |
| **Cloud Deploy** | Google's service that takes that container image and actually puts it onto Cloud Run (or GKE). The last link. |
| **CI/CD** | "Continuous Integration / Continuous Deployment" — the umbrella term for "push code → it automatically gets built, tested, and shipped" instead of someone doing it by hand. |
| **CI/CD Generator** | A Telus tool that writes the GitHub Actions configuration file for you, pre-wired to WIF and Telus standards, instead of you writing it from scratch. |
| **Risk Engine** | An automatic checkpoint that runs on every code merge — checks test coverage, security vulnerabilities, etc. — and either approves the deploy or blocks it for a human to review. |
| **AutoCRQ** | "Change Request" (CRQ) is Telus's formal record that a production change happened — normally something a human fills out in a ticketing system. AutoCRQ files and closes that paperwork automatically when Risk Engine approves a deploy, so nobody has to do it by hand. |
| **NCM approval** | A one-time, human sign-off (Director + change-management team) required before AutoCRQ is allowed to auto-approve *production* deployments. Until this is granted, production deploys still need a person to click approve. |
| **CMDB ID / Support Group** | Telus's internal registry entries that identify "which team owns this app" — required before AutoCRQ will work at all. |
| **Embargo** | A company-wide freeze window where deployments are blocked (e.g., during Black Friday) to avoid risking outages during high-traffic events. Worth checking before planning any go-live date. |
| **Secret Manager** | A GCP service for storing sensitive values (API keys, credentials) securely, so the app fetches them at runtime instead of the key sitting in a file in the repo. This is where the FuelIX key and the GTT service-account credential *should* end up, instead of `.env.local` and a JSON file on a laptop. |

---

## Step-by-step: from "nothing exists yet" to "it deploys itself"

### Step 1 — Get the GCP Project created

**What happens:** Someone (likely on the WFM team, since they own this initiative) goes to **Cloud Management Hub** (`cloud-management-hub.telus.com`) → **Add New Project** → **Cloud Native Application**, and picks a small list of "catalogue items" — think of these as checkboxes for "what does this app need."

**What to pick for the Command Center specifically:**
- `CICD - Google Cloud Deploy` (Cloud Run itself is available by default — no separate checkbox needed)
- `Security - Secret Manager` (to hold the FuelIX and GTT keys properly instead of local files)
- Skip anything GKE-related, Cloud SQL, and extras — the app doesn't need a database or Kubernetes.

**Why it matters:** Picking only what's needed avoids two problems: unnecessary cost, and "unused permissions" showing up later as a security audit finding.

**What you get back:** A **Project ID** (write this down, you'll need it constantly) and an auto-created GitHub repo named `tf-infra-cio-<your-project-alias>` — this is where infrastructure config lives going forward.

**Timing:** ~10–15 minutes if auto-approved; escalate in Telus's `#g-developers` Slack channel if it's still pending after 30 minutes.

---

### Step 2 — Set up Workload Identity Federation (WIF)

**What happens:** This is the step that lets GitHub "prove who it is" to GCP, so it can deploy without a stored password.

**Which path applies to us:** Since the app will use Secret Manager (Step 1), it needs the **"Option B — Manual"** WIF setup, not the fully automated one — that's the normal case for anything beyond a bare-bones app. In practice this means:
1. Open the auto-created `tf-infra-cio-<project-alias>` repo from Step 1.
2. Copy two reference files (`workload_identity.tf` and `gsa_roles.tf`) from Telus's example project, and adapt them: mainly, put in your project alias, your project ID, and list your GitHub repo name so it's allowed to deploy here.
3. `gsa_roles.tf` is a checklist of "what GCP services can this app touch" — trim it down to just `secretmanager.secretAccessor` (read the keys) and basic logging; skip Cloud SQL/Pub/Sub/Firestore roles since we don't use them.
4. "Applying" this isn't a button click — it's a **git tag**. Tagging the repo with something like `{project-alias}.v1.00` triggers Telus's automation to actually create these permissions in GCP. You watch it run in GCP Console → Cloud Build → History.

**Why it's structured this way:** This is Telus's replacement for the exact risk we've already been managing manually with the GTT service-account key file — a long-lived credential that can leak. WIF means there's no key file to leak in the first place.

---

### Step 3 — Generate the CI/CD pipeline (the GitHub Actions workflow)

**What happens:** Instead of hand-writing the automation script that says "on push to main, build and deploy," you search **"CI/CD Generator"** inside Simplify and run it. It asks a few questions and opens a **pull request** on your app repo containing:
- A GitHub Actions workflow file
- The Cloud Build / Cloud Deploy configuration to go with it

**One gotcha specific to us:** the Command Center is a **multi-service app** — a React frontend and a separate Python backend (`local_api.py`), each with (or needing) its own `Dockerfile`. The generator assumes one service. The fix: generate the pipeline once, then manually copy/adapt the build-and-deploy job block a second time for the second service. Telus's `#cicd-pipeline-support` channel exists specifically to help with this.

---

### Step 4 — Add the two safety gates: Risk Engine and AutoCRQ

These aren't optional add-ons — they're how Telus keeps "code auto-deploys itself" from being reckless.

**Risk Engine** — checks every merge to `main` (test coverage, known vulnerabilities) before letting a deploy proceed. Setup is a small YAML file (`.platform/.riskEngineConfig.yaml` — note the exact path, a common mistake is putting it in the wrong folder) plus one extra step in the GitHub Actions workflow.

**AutoCRQ** — once Risk Engine approves something that touches production, AutoCRQ automatically files the formal "we made a production change" record in Telus's ticketing system, and closes it once the deploy succeeds. This requires some registration that isn't automatic:
- A **CMDB ID** for the app (ask WFM leadership / whoever manages the Telus-side registry for this)
- A **Support Group** entry in ITSM naming who owns this app
- At least one person with the **Change Coordinator** role in that group (usually whoever's allowed to merge PRs)
- A one-time **NCM approval** (Director-level sign-off) before fully automated production approval is switched on — until then, someone still clicks "approve" manually, which is a perfectly fine and common state to be in while this is new

**If this feels like a lot for a POC/demo tool:** it likely is more process than this app needs right now. Worth explicitly asking the WFM team whether the full Risk Engine/AutoCRQ machinery is expected for this specific app, or whether a lighter/manual approval flow is acceptable initially. The GCP Project + Cloud Run + WIF + GitHub Actions core (Steps 1–3) is very likely required either way; Step 4's formal change-control layer is the part that's negotiable.

---

### Step 5 — Prove it works end to end

Before calling this "done," Telus's own recommended check is:
1. Open a trivial pull request (even just a README edit)
2. Confirm the build passes and Risk Engine shows a status check
3. Merge it, and watch it deploy automatically to the non-production version of the app
4. Confirm AutoCRQ created its change ticket and closed it after a successful deploy
5. Only then, manually promote that same build to the production URL

This is the "dry run before the real thing" instinct we've already been applying to the live demo deployment — same principle, applied one layer up the stack.

---

## Where this leaves us right now

- Nothing above requires code changes to the Command Center itself — it's entirely about *where* the existing code runs and *how* it gets there.
- The one open blocker worth flagging early: **there's an active company-wide deployment embargo through Sep 7, 2026**, with another window Sep 11–22. Confirm whether *initial* project setup is fine during an embargo (probably yes — it's not a live-traffic change) versus the *first production deploy* (may need to wait or get an exception).
- Recommended deployment target: **Cloud Run**, not GKE — simpler, and matches what this app actually needs (no persistent database, low/no concurrent traffic today).

## Where to get help (Telus internal)

| Question | Where to ask |
|---|---|
| Which deployment path should we use? | `#g-developers` — tag `@CloudCoE Support Bot` |
| Cloud Run setup specifics | Cloud COE Cloud Run guide (search "CloudRun" in Simplify) |
| CI/CD pipeline errors, multi-service setup | `#cicd-pipeline-support` |
| Risk Engine / AutoCRQ setup | `#g-risk-engine` |
| WIF setup issues | Search "Workload Identity Federation" in Simplify |
| General Cloud COE office hours | Tue & Thu, 11:30 AM–12:30 PM EST |
