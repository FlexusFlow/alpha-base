---
description: Document an implemented feature in two places — technical tracking in specs/implemented-features.md and business-friendly marketing in .marketing/ZipTrader-Assistant.md.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Purpose

This skill writes to **two separate files** with different audiences and purposes:

| File | Audience | Purpose | Style |
|------|----------|---------|-------|
| `specs/implemented-features.md` | Developers, internal team | Track what was built and how | Technical, concise, includes feature IDs |
| `.marketing/ZipTrader-Assistant.md` | Sales, product owners, clients | Present product capabilities | Business-friendly, no jargon, no IDs |

## Flag Detection

Parse `$ARGUMENTS` for flags:

- **`--force`**: Run autonomously. Make all decisions yourself. Do not ask clarification questions.
- **`--init`**: First-time generation of `.marketing/ZipTrader-Assistant.md` only. Builds the **entire** marketing doc from scratch by transforming ALL existing features from `specs/implemented-features.md`. Does NOT modify `implemented-features.md`.

Strip flags from `$ARGUMENTS` before processing the remaining text as feature description/identifier.

If no flags are present: You MAY ask up to 3 clarification questions using `AskUserQuestion`. Only ask if genuinely ambiguous.

## Pre-flight Check

Before any work:

1. Check if `.marketing/ZipTrader-Assistant.md` exists
2. **If it does NOT exist and `--init` is NOT set**: Create the file with the document skeleton (see [Marketing Document Structure](#marketing-document-structure)) then proceed normally
3. **If it does NOT exist and `--init` IS set**: Create the file and proceed with init mode
4. **If it exists**: Read it to understand current content before appending

---

## Init Mode (`--init`)

This mode ONLY generates `.marketing/ZipTrader-Assistant.md`. It does NOT touch `specs/implemented-features.md`.

1. Read `specs/implemented-features.md` — the complete feature history
2. Read `.claude/plans/sales-brief.md` — for product positioning and tone
3. Read `.claude/plans/*.md` — for additional business context
4. **Transform ALL existing features** into business-friendly language, grouped by **business capability themes** (NOT by stage numbers):
   - Suggested groupings (adjust based on actual content):
     - **YouTube Knowledge Import** — channel scanning, video selection, transcription
     - **AI-Powered Chat** — conversational Q&A, source citations, streaming responses
     - **User Management & Security** — authentication, user-scoped data, permissions
     - **Knowledge Base Management** — channel organization, deletion, caching
     - **Cookie Management** — authentication cookie support for restricted content
   - Each group gets a `### Heading` with business-friendly bullets underneath
5. Write the **complete** `.marketing/ZipTrader-Assistant.md` using the marketing document structure
6. Include Platform Summary sourced from sales-brief.md
7. Include Planned Capabilities from the "Planned" section of implemented-features.md
8. If not `--force`: present draft for approval before writing

---

## Normal Mode (single feature)

Writes to **both** files.

### 1. Identify the Feature

a. **If `$ARGUMENTS` contains a feature identifier** (e.g., `ZIP-003`, a branch name, or description): use that

b. **If `$ARGUMENTS` is empty or only contains flags**:
   - Run `git branch --show-current` to detect the current feature branch
   - Extract the feature identifier (e.g., `feature/ZIP-003-article-scraping` → `ZIP-003`)
   - If not on a feature branch, ask the user (unless `--force`, then error)

### 2. Gather Context

Read these sources to understand what was implemented:

a. **Primary sources** (read all that exist):
   - `specs/{feature-id}-*/spec.md` — the feature specification
   - `specs/{feature-id}-*/plan.md` — the implementation plan
   - `specs/{feature-id}-*/tasks.md` — the task breakdown
   - `.claude/plans/*.md` — historical plans for additional context

b. **Git history** (for features already merged or in progress):
   - `git log --oneline main..HEAD` (if on feature branch)
   - Or `git log --oneline --grep="{feature-id}"` to find relevant commits

c. **Existing docs**:
   - Read `specs/implemented-features.md` for current format, stage numbering, and writing style
   - Read `.marketing/ZipTrader-Assistant.md` for current marketing content and groupings
   - Read `.claude/plans/sales-brief.md` for tone reference

### 3. Draft Both Entries

Produce **two separate drafts** — one for each file.

### 4. Ask for Approval (unless `--force`)

Present both drafts to the user side by side. Ask if they want changes before writing.

### 5. Write Both Files

See the file-specific instructions below.

### 6. Report

Output a brief summary:
- What was added to each file
- Remind the user to review and adjust wording if needed

---

## File 1: `specs/implemented-features.md` (Technical Tracking)

### Determine Stage Number

- Read the last stage heading in `specs/implemented-features.md`
- Extract the stage number (e.g., "Stage 9" → next is "Stage 10")
- If the feature logically extends an existing stage, ask the user (unless `--force`, then create a new stage)

### Format

Follow the existing format exactly:

```markdown
## Stage N: [Feature Name] ([FEATURE-ID])

- [FEATURE-ID] [Capability name] — [Technical description of what was built, can include implementation details]
- [FEATURE-ID] [Another capability] — [Description with relevant technical context]
```

### Writing Style — Technical

- **Include feature IDs** (ZIP-001, AB-0042, etc.)
- **Technical details are OK**: mention services, patterns, key implementation decisions
- **Match the existing style** in the file — look at recent Stage entries for tone
- **One capability per bullet**
- **Append before** the `## Planned (Not Yet Implemented)` section
- **Preserve all existing content** exactly as-is

---

## File 2: `.marketing/ZipTrader-Assistant.md` (Business Documentation)

### Marketing Document Structure

```markdown
# ZipTrader Platform — Feature Overview

> Business documentation for sales, product, and stakeholder audiences.
> Auto-generated from project artifacts. Review and adjust wording as needed.

---

## Platform Summary

[2-3 paragraph overview of what ZipTrader is, who it's for, and the core value proposition. Sourced from `.claude/plans/sales-brief.md`.]

---

## Feature Highlights

### [Business-Friendly Feature Group Name]

- **[Capability name]** — [1-2 sentence description of what users can now do and why it matters]
- **[Another capability]** — [Description focused on user benefit]

### [Next Feature Group]

...

---

## Planned Capabilities

[Upcoming features from specs/implemented-features.md "Planned" section, in business language]

---

*Last updated: [DATE]*
```

### Determine Placement

- Read the existing feature groups in `.marketing/ZipTrader-Assistant.md`
- Decide if the new feature fits into an **existing group** or needs a **new group**
- If unclear, ask the user (unless `--force`, then make the best decision)

### Writing Style — Business

- **NO technical jargon**: No APIs, endpoints, database tables, SQL, React, Python, middleware, RLS, SSE, BFF, Pydantic, hooks
- **NO implementation details**: No file paths, function names, class names, config options
- **NO feature IDs**: ZIP-001, AB-0042, etc. stay out of this document
- **USE business language**: "Users can...", "The system...", "When a user...", "Automatically..."
- **FOCUS on user value**: What can people DO now that they couldn't before?
- **FOCUS on business outcomes**: How does this help users/clients?
- **Match the sales-brief.md tone** — clear, benefit-driven, accessible to anyone
- **Update** the `*Last updated: [DATE]*` footer

---

## Examples

### Technical entry (implemented-features.md) — Good

```markdown
## Stage 10: Article Scraping Migration (ZIP-003)

- ZIP-003 Article scraping pipeline — Migrated article ingestion from legacy scraper to Readability-based extraction with fallback to raw HTML parsing
- ZIP-003 Article vector ingestion — Articles chunked and embedded into DeepLake alongside video transcripts, unified retrieval in RAG queries
```

### Marketing entry (ZipTrader-Assistant.md) — Good

```markdown
### Article Knowledge Import

- **Web article ingestion** — Users can now add web articles to their knowledge base alongside YouTube videos, expanding the range of sources available for AI-powered Q&A
- **Automatic content extraction** — When a user pastes an article URL, the system automatically extracts the main content, filtering out ads and navigation clutter
- **Multi-source answers** — Chat answers now draw from both video transcripts and article content, giving richer and more comprehensive responses
```

### Marketing entry — Bad (DO NOT write like this)

```markdown
- ZIP-003 Article scraping service — ArticleScraper class using BeautifulSoup4 with Readability fallback, stores extracted HTML in Supabase Storage bucket
```

---

## Key Rules

1. **Two files, two audiences** — technical tracking and business marketing are separate concerns
2. **`--init` only affects marketing doc** — never bulk-rewrite implemented-features.md
3. **Audience awareness** — sales people read marketing doc, developers read tracking doc
4. **Preserve existing content** — never modify previous entries in either file
5. **One capability per bullet** in both files
6. **Marketing doc groups by business theme**, tracking doc groups by stage number
