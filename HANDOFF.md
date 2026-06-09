# CIBC RTA Automation — Engineering Handoff

> This project has a **living knowledge base** powered by MemPalace (local-first AI memory).
> Instead of reading 278 files cold, engineers can query the palace in plain language and get
> verbatim answers drawn from everything built during the POC and Demo phases.

---

## 1. What Is in the Palace

The palace contains **2,656 drawers** sourced from:

| Source | Content |
|---|---|
| 167 project files | Markdown docs, TypeScript components, Python engine, JSON rules, Mermaid diagrams |
| 23 Cursor chat sessions | Every design decision, rationale, and milestone from the POC work with Mateus |

All content lives locally at `~/.mempalace/palace`. Nothing is sent to any cloud.

---

## 2. Install MemPalace

```bash
pip install mempalace
# or, if you have uv:
uv tool install mempalace
```

Requirements: Python 3.9+, ~300 MB disk (embedding model downloads on first use).

---

## 3. Connect to Cursor (MCP)

The `.cursor/mcp.json` file in this repo already wires MemPalace as an MCP server.
After installing mempalace, **restart Cursor** and the 29 memory tools will be active.

If the binary path differs on your machine, update the `command` field in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mempalace": {
      "command": "/path/to/your/mempalace-mcp"
    }
  }
}
```

Find the correct path with: `which mempalace-mcp`

---

## 4. Day 1 — Load Your Context

Run this in your terminal before starting your first session:

```bash
mempalace wake-up
```

Or, inside any Cursor session, just ask:

> "Load the MemPalace context for CIBC RTA"

The AI will call `mempalace_status` automatically and brief you on the palace contents.

---

## 5. Day 1 — Example Queries

Paste any of these directly into Cursor chat:

### Architecture
- "Walk me through the Verint Vision Agent architecture on Azure"
- "What connectors does the RTA system use to pull data?"
- "What was the decision between Azure and GCP for deployment?"

### Automation Workflows (the 6 ABDs)
- "How does the Shift Start Morning Reconciliation workflow work?"
- "What triggers the Outage Detection and Response process?"
- "Explain the Coaching Huddle Approval flow step by step"
- "What does the ServiceNow Ticket Processing workflow do?"

### Business Rules & Data
- "What are the AUX code definitions and alert thresholds?"
- "How is LOB routing configured?"
- "What line health codes are used and what do they mean?"

### UI / Command Center
- "What React components make up the Command Center?"
- "How does the KanbanBoard component work?"
- "What scenarios are pre-built in the demo?"
- "How does the simulation engine generate cards?"

### Engineering Setup
- "What Python dependencies does the pipeline need?"
- "How do I run the simulation engine locally?"
- "What does build.sh do?"

---

## 6. Keep the Palace Fresh

After adding new docs or making implementation decisions, re-mine:

```bash
# Re-mine project files (idempotent — skips already-filed content)
mempalace mine "/path/to/CIBC - RTA Automation" --wing cibc-rta

# Search to verify
mempalace search "your new topic"
```

After significant work sessions in Cursor, mine the new transcripts:

```bash
mempalace mine \
  "/Users/mateus.teixeira/.cursor/projects/Users-mateus-teixeira-Desktop-CIBC-RTA-Automation/agent-transcripts" \
  --mode convos --wing cibc-rta --extract general
```

---

## 7. Project Structure at a Glance

```
CIBC - RTA Automation/
├── POC/                          # Main POC package
│   ├── 00_source_inputs/         # Shadowing transcripts + REDY ABD outputs
│   ├── 01_evidence_pack/         # Screenshots + business rules JSON
│   ├── 02_architecture/          # Architecture docs + Mermaid diagrams
│   ├── 03_poc_plan/              # Planning artefacts
│   ├── 04_demo_ui/               # Command Center React app (Vite)
│   ├── 05_results/               # OCR baseline + constraint reports
│   ├── 06_board_materials/       # Executive deck + value model
│   └── 07_simulation/            # Python simulation engine
├── CIBC_RTA_Demo_May/            # May demo bundle
│   ├── diagrams/mmd/             # 8 numbered Mermaid diagrams
│   └── docs/                     # Demo narrative (Andrew deck)
├── POC_Redefined/                # Refreshed React app (command-center/)
├── pipeline/                     # Python transcript/frame/index pipeline
├── .cursor/mcp.json              # MemPalace MCP wiring for Cursor
└── docs/mempalace-taxonomy.md    # Full wing/room map (see this file)
```

---

## 8. Key Contacts

| Role | Name |
|---|---|
| Product Lead / POC Author | Mateus Teixeira |

All decisions made during the POC are searchable in the palace under the `decision` and `milestone` rooms.

---

## 9. Sensitive Files — Handle with Care

- `POC_Redefined/command-center/.env.local` — may contain API keys. Do not commit.
- `node_modules/` — present under three subdirectories. Restore with `npm install`.
- `~/.mempalace/palace` — your local palace index. Not committed to source control.

---

## 10. Next Steps for Engineering

1. Install MemPalace, restart Cursor, run `mempalace wake-up`
2. Read `docs/mempalace-taxonomy.md` to understand the room structure
3. Run the Day 1 queries above to orient yourself
4. Review `POC/02_architecture/` for system design
5. Spin up the Command Center locally: `cd POC_Redefined/command-center && npm install && npm run dev`
6. Review `POC/07_simulation/README.md` to run the simulation engine
