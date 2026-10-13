# RTA Command Center

> **Status: proof of concept.** Runs on **synthetic / sanitized demo data** — not production, not connected to any live client system. See [Repo scope](#repo-scope-and-whats-intentionally-excluded) below.

**RTA Command Center** is a Workforce-Management (WFM) automation product: an AI *watch-and-draft* layer that turns a Real-Time Analyst's (RTA) manual, every-15-minutes monitoring grind into a human-in-the-loop review queue. It began as a CIBC proof of concept; the architecture is deliberately built to span many clients — a **unified multi-client WFM platform**.

**The problem it attacks:** an RTA monitors 200–260 agents, hand-types every adherence/SLA alert across 5+ tools, and reconciles attendance — roughly **137 minutes of manual work per shift**. The Command Center does the watching, detecting, and drafting; the RTA reviews, edits, and decides. Nothing is sent or written without a human (or a deterministic RPA/API channel) — the AI only advises.

## Start here

| You want… | Open |
|---|---|
| **Architecture, connectors, integration topologies** | **[docs/engineering/](POC_Redefined/docs/engineering/README.md)** — the production design set |
| ↳ System architecture — the spine, cloud-neutral seams, governance invariant | [SYSTEM_ARCHITECTURE.md](POC_Redefined/docs/engineering/SYSTEM_ARCHITECTURE.md) |
| ↳ Connector catalog + the **read-only-API vs Citrix/VDI** integration diagrams | [CONNECTOR_CATALOG.md](POC_Redefined/docs/engineering/CONNECTOR_CATALOG.md) |
| ↳ Per-client configuration (the tenant manifest / control plane) | [FDAE_CONFIGURATION_LAYER.md](POC_Redefined/docs/engineering/FDAE_CONFIGURATION_LAYER.md) |
| **Run the app** | [RTA Board (the Command Center)](RTA_Board_V2/README.md) · [engineering guide](POC_Redefined/Product_and_Architecture_docs/rta-board-engineering-guide.html) |

*(All architecture diagrams are embedded as Mermaid and render inline on GitHub.)*

## Run the app

```bash
cd RTA_Board_V2
npm install
npm run dev          # → http://localhost:5174 (needs POC_Redefined/local_api.py on :5050)
```

Run the rules-core tests (Python, 44 tests):

```bash
# from the repo root
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd POC_Redefined && python -m unittest discover -s tests
```

## Strategy framing (2026-06-08 WFM Transformation Sync)

- **Unified multi-client platform**, not a single-client tool — one container image, per-client configuration (no code forks).
- **Three access tiers** segment clients and drive the capture strategy: `full` (we own/administer the tech, e.g. Google) · `partial` (web-accessible) · `none` (Citrix pixel-only, e.g. CIBC).
- **Read-only first:** the RTA workflow is ~70% read-only / ~30% write, so the roadmap automates the read-only 70% (capture → detect → draft) before write-back.
- **Reposition, don't replace:** RTAs move up-value into WFM experts; the AI removes the toil and learns from each of their decisions.

## Repo scope (and what's intentionally excluded)

This repository is the **active application + production documentation**, scrubbed of client PII:

- **Included** — the React Command Center (`RTA_Board_V2`), the Verint browser extension (`POC_Redefined/verint_extension`), the Python rules core + tests (`POC_Redefined/`), and the engineering docs (`POC_Redefined/docs/`).
- **Excluded** (kept internal, never committed) — raw client data, Verint screenshots/recordings, OCR dumps, meeting transcripts, the legacy `POC/` evidence tree, and all secrets. Demo seed data uses **synthetic names** (no real employees).

## Data honesty

Every card, agent, and number in the demo carries one of four labels — `evidence-backed` / `seeded` / `simulated` / `future-integration` (see [SCOPE.md](POC_Redefined/docs/SCOPE.md)). The app runs on four built-in scenarios today; live Verint capture is the next integration step (see the connector catalog).
