# Quickstart: MCP Tools & Servers Research

## What This Feature Produces

This is a **research-only feature** — no code changes. It produces:

1. **Technote** at `.local/.technotes/NNN-mcp-tools-research.md` — consolidated findings
2. **Backlog updates** in `specs/backlog.md` — actionable MCP integration items

## How to Execute

### Task 1: Write the Technote
- Consolidate `research.md` findings into `.local/.technotes/` format
- Determine next sequential index by checking existing files
- Include: summary, evaluated servers, recommendations, risks, sources

### Task 2: Update the Backlog
- Add Tier 2 items (YouTube Transcript MCP, Tavily MCP, Firecrawl MCP, GitHub MCP) as backlog entries
- Add Tier 3 items (FastMCP AlphaBase server, MCP Memory Service) as future backlog entries
- Reference the technote in each entry

### Task 3: Move Spec to Done
- After completion: `mv specs/ALP-001-mcp-tools-research specs/done/`

## Validation

Check against spec success criteria:
- [x] SC-001: 8+ public MCP servers evaluated (30+ evaluated)
- [x] SC-002: 2+ performance improvements identified (YouTube Transcript ~10x, Tavily cleaner results)
- [x] SC-003: 2+ UX improvements identified (better search results, faster processing, cross-session memory)
- [x] SC-004: 3+ prioritized recommendations (6 recommendations across Tiers 2-3)
- [ ] SC-005: Technote written + backlog updated (pending task execution)
