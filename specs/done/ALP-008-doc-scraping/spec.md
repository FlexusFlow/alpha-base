# Feature Specification: Documentation Site Scraping

**Feature ID**: ALP-008
**Branch**: `feature/ALP-008-doc-scraping`
**Status**: Draft
**Created**: 2026-02-26

## Overview

AlphaBase's Knowledge Base currently supports two content sources: YouTube channels (video transcripts) and individual web articles. However, a significant category of knowledge — multi-page documentation sites — cannot be captured effectively. Documentation sites (e.g., product help centers, API docs, technical guides) consist of many interconnected pages organized under a navigation structure.

This feature adds the ability to scrape entire documentation sites by providing an entry point URL. The system discovers all linked pages within the documentation structure (sidebar, table of contents, internal links) and scrapes them as a unified collection into the knowledge base, making the full documentation searchable via RAG.

## Problem Statement

Users who want to add documentation sites to their knowledge base face these problems:

- **Manual page-by-page scraping**: Users must individually paste each documentation page URL using the article scraper — impractical for sites with dozens or hundreds of pages
- **Lost structure**: Even if pages are scraped individually, the hierarchical relationship between them (parent/child, section grouping) is lost
- **Incomplete coverage**: Users may miss important pages when manually identifying all URLs in a documentation site
- **No discovery mechanism**: The current system has no way to follow links within a site to find all related pages automatically

## User Scenarios & Testing

### Scenario 1: User Scrapes a Documentation Site from an Entry URL

**Given** a user is on the Knowledge Base hub
**When** the user clicks "Add Documentation", enters a documentation site URL (e.g., `https://sirv.com/help/section/360-spin/`), and submits
**Then** the system discovers all linked documentation pages under that URL scope and scrapes them as a collection

**Acceptance Criteria**:
- The user provides a single entry point URL
- The system crawls the page and discovers linked documentation pages within the same URL scope
- A preview of discovered pages is shown before scraping begins, with total page count
- The user can confirm or cancel before the bulk scrape starts
- Each page is scraped, converted to Markdown, and stored as part of the documentation collection
- Progress is reported in real-time (e.g., "Scraping page 5 of 23")

### Scenario 2: User Reviews Discovered Pages Before Scraping

**Given** the system has crawled a documentation entry URL and discovered linked pages
**When** the discovery phase completes
**Then** the user sees a list of discovered pages and can choose to proceed or cancel

**Acceptance Criteria**:
- Discovered pages are shown in a list with their titles and URLs
- The total count of pages is displayed
- The user can proceed to scrape all discovered pages
- The user can cancel without scraping
- If the page count exceeds the maximum limit (100 pages), the user is warned and only the first 100 pages are included

### Scenario 3: User Views a Scraped Documentation Collection

**Given** a user has previously scraped a documentation site
**When** the user navigates to the documentation collection in the Knowledge Base
**Then** the collection is displayed with all its pages listed hierarchically

**Acceptance Criteria**:
- The collection shows the documentation site name and source URL
- Individual pages within the collection are listed with their titles
- Users can click on any page to view its rendered Markdown content
- The collection's scrape date and page count are visible

### Scenario 4: Documentation Content Is Searchable via RAG

**Given** a user has scraped a documentation site into the knowledge base
**When** the user asks a question in the RAG chat
**Then** relevant documentation pages are retrieved and cited in the response

**Acceptance Criteria**:
- Documentation content is chunked and indexed in the vector store
- Each chunk carries metadata identifying the source documentation site and specific page
- RAG responses cite the specific documentation page (title + URL) when referencing documentation content

### Scenario 5: User Deletes a Documentation Collection

**Given** a user has a scraped documentation collection
**When** the user deletes the collection
**Then** all pages, vector store entries, and associated data are removed

**Acceptance Criteria**:
- A confirmation dialog appears before deletion
- All pages in the collection are deleted from the database
- All vector store entries for the collection's pages are removed
- The user is redirected to the Knowledge Base hub after deletion

### Scenario 6: Scraping Handles Errors Gracefully

**Given** some pages in a documentation site fail to scrape (timeouts, access errors)
**When** the bulk scrape completes
**Then** successfully scraped pages are saved and failed pages are reported

**Acceptance Criteria**:
- Partial success is supported — successfully scraped pages are kept even if some fail
- The collection shows which pages succeeded and which failed
- Failed pages display the reason for failure
- The overall collection status reflects partial completion (e.g., "18 of 23 pages scraped")
- A "Retry failed pages" action is available to re-scrape only the pages that failed without re-scraping successful ones

### Scenario 7: User Scrapes a Cookie-Protected Documentation Site

**Given** a user has uploaded cookies for a documentation site's domain
**When** the user scrapes a documentation site on that domain
**Then** cookies are injected for all page requests during the crawl

**Acceptance Criteria**:
- Cookie availability is checked using the same domain matching as article scraping (ZIP-002)
- If cookies exist, they are automatically used for all pages in the crawl
- If no cookies exist and the site appears to require authentication, a warning is shown

## Functional Requirements

### FR-1: Documentation Discovery (LLM-Based)

The system must discover documentation pages from an entry URL:

1. Accept a single entry URL from the user
2. Load the entry page using Playwright (with cookies if available)
3. **LLM-based link extraction**: Pass the entry page HTML to an LLM with the following prompt to extract only documentation-relevant links:

   ```
   I'm going to paste the HTML (or text) of a documentation/help page.

   Please extract all internal links that point to actual documentation content
   (articles, guides, API references, tutorials, section indexes, etc.).

   Rules:
   - INCLUDE links to: help articles, guides, API docs, tutorials,
     integration pages, and section/category indexes
   - EXCLUDE links to: navigation menus, login/signup, pricing, blog,
     marketing pages, social media, legal pages (privacy, terms),
     contact pages, and any external third-party URLs unrelated to the docs
   - DEDUPLICATE links (show each URL only once)
   - GROUP links by their logical category or section as they appear on the page
   - FORMAT each entry as: URL — short description (if available)

   Here is the page content:
   [PAGE HTML]
   ```

   The LLM response is the complete list of pages to scrape. No BFS crawling or recursive link following is performed — the entry page is treated as a table of contents, and the LLM identifies all documentation links from it in a single pass.
4. Parse URLs from the LLM response and normalize them (resolve relative URLs, strip fragments and trailing slashes)
5. Deduplicate extracted URLs
6. Limit to a maximum of 100 pages per collection
7. Return the list of discovered pages with titles/descriptions and URLs for user review

### FR-2: Documentation Scrape Form

The system must provide a URL input form for documentation sites:

1. User enters a documentation entry URL
2. System validates the URL format (same SSRF protection as article scraping)
3. System checks cookie availability for the URL's domain
4. On submission, the discovery phase begins and progress is shown
5. After discovery, display the list of found pages with count for user confirmation
6. On confirmation, the bulk scrape begins as a background job
7. Real-time progress updates are provided via SSE (page N of M)

### FR-3: Bulk Page Scraping

The system must scrape all confirmed pages in a documentation collection:

1. Scrape each discovered page using the same content extraction logic as article scraping (Playwright, content selectors, noise removal, HTML-to-Markdown conversion)
2. Scrape up to 3 pages concurrently with a brief delay between batches to avoid triggering rate limiting on target sites
3. Reuse the browser session and cookies across all pages in a collection for efficiency
3. Apply the same 200KB per-page Markdown size limit as article scraping
4. Track success/failure per page individually
5. Continue scraping remaining pages if individual pages fail
6. Update overall collection status: completed, partial (some pages failed), or failed (all pages failed)
7. Support retrying only failed pages — a "Retry failed pages" action re-scrapes pages with failed status and updates the collection status accordingly

### FR-4: Documentation Collection Storage

The system must persist documentation collections and their pages:

1. A documentation collection record contains: user identity, entry URL, site name, total page count, successful page count, status, creation timestamp
2. Each documentation page record contains: collection reference, page URL, title, Markdown content, scrape status, ordering/hierarchy info
3. Duplicate entry URL submissions by the same user are allowed (each scrape creates a new collection)
4. Collections are scoped to the authenticated user (RLS enforced)
5. Deleting a collection cascades to all its pages

### FR-5: Documentation Collection View

The system must display documentation collections in the Knowledge Base:

1. Documentation collections appear on the Knowledge Base hub alongside YouTube channels and articles
2. Each collection shows: site name, page count, scrape date, status
3. Clicking a collection shows the list of pages within it
4. Clicking a page renders its Markdown content

### FR-6: Vector Store Indexing

The system must index documentation content for RAG retrieval:

1. After scraping, chunk each page's Markdown content and add to the vector store
2. Each chunk's metadata must include: collection ID, page URL, page title, documentation site name, source type ("documentation")
3. On collection deletion, remove all associated vector store entries

### FR-7: Documentation Collection Deletion

The system must support collection deletion with full cascade:

1. Delete the collection record and all associated page records
2. Remove all vector store entries for the collection's pages
3. Require user confirmation before proceeding

## Key Entities

### Documentation Collection
- User-scoped record of a scraped documentation site
- Contains: entry URL, site name, page count stats, overall scrape status
- Linked to: user identity, documentation pages

### Documentation Page
- Individual page within a documentation collection
- Contains: page URL, title, Markdown content, scrape status, display order
- Linked to: documentation collection

## Success Criteria

- **SC-1**: Users can add a complete documentation site to their knowledge base by providing a single URL, with all pages scraped within 5 minutes for sites with up to 50 pages
- **SC-2**: The discovery phase identifies at least 90% of navigable documentation pages for sites with standard HTML navigation (sidebar, breadcrumbs, table of contents)
- **SC-3**: Scraped documentation content is retrievable via RAG chat — questions about documented features return relevant, correctly cited answers
- **SC-4**: Partial scraping failures do not block the overall operation — successfully scraped pages remain usable
- **SC-5**: Users can view, browse, and delete documentation collections as cohesive units within the Knowledge Base
- **SC-6**: Documentation collections of up to 100 pages load and display within 3 seconds in the collection view

## Assumptions

1. The existing article scraping infrastructure (Playwright, content extraction, Markdown conversion) can be reused for individual documentation pages with minimal modification
2. Documentation sites primarily use standard HTML navigation patterns (links in `<nav>`, `<aside>`, sidebar elements, or main content area) that can be crawled without JavaScript rendering of dynamic navigation
3. The 100-page limit per collection is sufficient for most documentation sites; very large documentation sites (e.g., full API references with hundreds of pages) may need to be scraped in sections
4. Cookie management (ZIP-001/ZIP-002) works for documentation sites the same way it works for articles
5. The entry page serves as a table of contents — the LLM extracts all documentation links from it in a single pass. No recursive BFS crawling is needed because documentation index pages typically link to all relevant sub-pages directly
6. Background job processing (Principle IV: BackgroundTasks + JobManager SSE) handles the longer-running multi-page scrape jobs
7. An LLM call (using a fast, cost-efficient model) can reliably distinguish documentation links from navigation/marketing links on the entry page. The LLM receives the page HTML and returns a structured list of documentation URLs

## Dependencies

- **ZIP-003** (Article Scraping Migration): Provides the Playwright-based scraping pipeline, content extraction logic, and Markdown conversion. **Status: Complete.**
- **ZIP-001/ZIP-002** (Cookie Management): Provides cookie storage, domain matching, and injection for authenticated scraping. **Status: Complete.**

## Out of Scope

- Automatic periodic re-scraping of documentation sites for content updates
- Version tracking or diff detection between scrapes of the same documentation site
- Full-text search across documentation pages (outside of RAG)
- Documentation page editing after scraping
- Exporting documentation collections as PDF bundles
- Scraping dynamically-rendered single-page application (SPA) documentation (e.g., sites that load all content via client-side JavaScript without server-rendered HTML links)
- AI summarization or Q&A scoped to a single documentation collection (uses the global RAG chat)
- Selective page scraping (deselecting individual pages from the discovery list)

## Clarifications

### Session 2026-02-26

- Q: Should crawl scope use strict path prefix, parent path, or full domain? → A: Same domain + parent path — entry `/help/section/360-spin/` scopes to `/help/section/*`, capturing sibling sections.
- Q: Should pages be scraped sequentially or in parallel? → A: Limited parallel — up to 3 concurrent page scrapes with a brief delay between batches to balance speed vs. politeness.
- Q: What happens when a user scrapes the same documentation URL again? → A: Allow duplicates — each scrape creates a new collection. User can delete old ones manually.
- Q: Can users retry just failed pages or must they re-scrape the entire collection? → A: Retry failed only — a "Retry failed pages" action re-scrapes only pages with failed status.

### Session 2026-02-27

- Q: How to filter documentation links from non-documentation links (header/footer nav, marketing, login) on the entry page? → A: Use LLM-based classification. The entry page HTML is sent to a fast LLM with a prompt that classifies each link as documentation content or not. Path-scope filtering alone fails because documentation index pages often link to articles under different path prefixes (e.g., `/help/section/getting-started/` links to `/help/articles/*`). The LLM approach is more robust than heuristic CSS selector targeting (which varies per site) or maintaining stop-lists.
- Q: Should scope path be parent-path or entry URL path? → A: Entry URL path. Scope = the provided page URL path (e.g., `/help/section/getting-started/`). LLM filtering handles the entry page; path scope applies only to deeper pages (depth > 0).
- Q: Do we still need BFS crawling and scope path filtering if LLM extracts all doc links from the entry page? → A: No. Remove BFS crawling entirely. The LLM returns the complete list of documentation pages from the entry page in a single pass. Remove `_compute_scope_path()`, `_is_valid_doc_link()`, and the BFS loop. The entry page is treated as a table of contents — no recursive link following needed.
- Q: How should the collection name (site_name) be derived from the entry page? → A: Use the full `<title>` text of the entry page as-is. The previous `_extract_site_name()` function split on separators (` - `, ` | `, etc.) and took the last segment, which lost useful context. Fall back to hostname if title is empty.
