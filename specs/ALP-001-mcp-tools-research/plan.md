# Implementation Plan: MCP Tools & Servers Research

**Branch**: `ALP-001-mcp-tools-research` | **Date**: 2026-03-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/ALP-001-mcp-tools-research/spec.md`

## Summary

Research feature evaluating the MCP (Model Context Protocol) ecosystem for AlphaBase. Key finding: **MCP is valuable for developer tooling, not for runtime application improvement.** Three already-connected MCP servers (Supabase, Playwright, Context7) provide the most value. Three new additions (Firecrawl, YouTube Transcript, Tavily) are recommended for near-term adoption. One custom MCP server (AlphaBase Knowledge Base) is a future distribution opportunity.

This plan produces a technote document and backlog entries — no code changes.

## Technical Context

**Language/Version**: N/A (documentation-only deliverable)
**Primary Dependencies**: N/A
**Storage**: N/A
**Testing**: Manual review of deliverable completeness against spec success criteria
**Target Platform**: N/A (project documentation)
**Project Type**: Research/documentation
**Performance Goals**: N/A
**Constraints**: N/A
**Scale/Scope**: Single technote + backlog updates

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Full-Stack TypeScript-First Frontend, Python Backend | N/A | No code changes |
| II. API-Boundary Separation | N/A | No code changes |
| III. Supabase as Source of Truth | N/A | No code changes |
| IV. Background Jobs with Real-Time Feedback | N/A | No code changes |
| V. Simplicity and Pragmatism | PASS | Research recommends only high-value, low-effort integrations; explicitly defers premature additions |
| VI. Per-User Data Isolation | PASS | Research assesses per-user isolation compatibility for each recommended server |

**Gate result**: PASS — research-only feature, no constitutional violations possible.

## Project Structure

### Documentation (this feature)

```text
specs/ALP-001-mcp-tools-research/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output (completed)
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (pending /speckit.tasks)
```

### Deliverables (repository)

```text
.local/.technotes/
└── NNN-mcp-tools-research.md    # Consolidated technote

specs/
└── backlog.md                    # Updated with actionable MCP items
```

**Structure Decision**: No source code structure needed — this is a documentation-only feature producing a technote and backlog updates.

## Prioritized Implementation Roadmap

Based on research findings, ordered by impact-to-effort ratio:

### Tier 1: Already Connected (No Action Needed)

| MCP Server | Status | Value |
|------------|--------|-------|
| Supabase MCP | Active in Claude Code | DB management, migration debugging, RLS inspection |
| Playwright MCP | Active in Claude Code | Scraping debug, cookie auth testing, paywall detection |
| Context7 | Active in Claude Code | Up-to-date library documentation |

### Tier 2: Near-Term Additions (Low Effort, High Impact)

| # | MCP Server | What It Solves | Effort | Impact |
|---|-----------|---------------|--------|--------|
| 1 | **YouTube Transcript MCP** | Skip Whisper for captioned videos → seconds vs minutes | Add to Claude Code config | Performance: ~10x faster for captioned videos |
| 2 | **Tavily MCP** | Better web search for extended RAG chat | Add to Claude Code config + evaluate vs Serper | UX: more relevant search results |
| 3 | **Firecrawl MCP** | Better web scraping for JS-heavy sites | Add to Claude Code config | Quality: more reliable article scraping |
| 4 | **GitHub MCP** | Automate PR/issue workflows | Add to Claude Code config | Dev workflow: faster PR management |

### Tier 3: Medium-Term Opportunities (Medium Effort)

| # | MCP Server/Concept | What It Solves | Effort | Impact |
|---|-------------------|---------------|--------|--------|
| 5 | **FastMCP → AlphaBase MCP Server** | Expose KB to external AI tools | 2-3 days: auth + per-user isolation | Distribution: new access channel |
| 6 | **MCP Memory Service** | Cross-session RAG chat memory | 1-2 days: LangGraph integration | UX: contextual continuity |

### Tier 4: Deferred (Wait for Ecosystem Maturity)

| Concept | Why Deferred |
|---------|-------------|
| DeepLake Vector Operations MCP | Wait for DeepLake's own MCP server |
| Transcript Pipeline Orchestrator MCP | FastAPI BackgroundTasks + SSE works well already |
| Postgres MCP Pro | Premature optimization; Supabase MCP covers queries |
| Knowledge Graph (Neo4j/Graphiti) | Would add new database to stack (YAGNI) |

## Complexity Tracking

No constitution violations to justify.

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Community MCP servers unmaintained | Medium | Prefer officially maintained servers (Supabase, Playwright, GitHub) |
| API key exposure via MCP | Medium | Dev-time servers use stdio (local); production servers need OAuth 2.1 |
| Context injection via upstream data | Low | Dev-time only; no user-facing MCP integration planned |
| Vendor lock-in | Low | MCP is open protocol, adopted by all major vendors |
