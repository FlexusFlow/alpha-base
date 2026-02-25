# Feature Specification: Article Scraping Migration

**Feature ID**: ZIP-003
**Branch**: `feature/ZIP-003-article-scraping-migration`
**Status**: Draft
**Created**: 2026-02-22

## Overview

Migrate the complete article scraping and AI analysis pipeline from the `medium-legal-scrapper` project into AlphaBase's existing Next.js frontend. This brings article fetching, viewing, summarization, Q&A chat, and PDF export into the Knowledge Base alongside the existing YouTube channel functionality.

Users will be able to paste any article URL, have the system scrape and convert its content to Markdown, then interact with the article through AI-powered summaries and conversational Q&A — all within the same Knowledge Base hub they already use for YouTube content.

## Problem Statement

AlphaBase's Knowledge Base currently supports only YouTube channels as a content source. Users who want to capture, organize, and analyze web articles must use a separate application (`medium-legal-scrapper`). This creates:

- Fragmented workflows — users switch between two apps for related knowledge tasks
- Duplicated infrastructure — cookie management, AI chat, and authentication exist in both projects
- A "Coming soon" placeholder on the Knowledge Base hub that has never been fulfilled
- No single unified knowledge base across content types (video + article)

## User Scenarios & Testing

### Scenario 1: User Scrapes an Article from a Public URL

**Given** a user is on the Knowledge Base hub
**When** the user clicks "Add Article", enters a public article URL, and submits
**Then** the system scrapes the article, extracts content as Markdown, and saves it to the user's article library

**Acceptance Criteria**:
- The article title, source URL, and Markdown content are stored
- The user receives immediate confirmation that scraping has started
- When scraping completes, the user is notified and can navigate to the article viewer
- The article appears in the user's article list on the Knowledge Base hub

### Scenario 2: User Scrapes a Paywalled Article with Cookies

**Given** a user has previously uploaded cookies for the article's domain (via cookie management)
**When** the user submits the article URL
**Then** the system checks for available cookies, injects them into the scraping browser, and retrieves the full article content

**Acceptance Criteria**:
- The system checks cookie availability for the article's domain before scraping
- If cookies exist, they are automatically used (no extra user action required)
- If no cookies exist, a warning is shown with options to proceed without cookies or cancel
- Domain matching follows the same parent-domain fallback as ZIP-002 (e.g., `medium.com` cookies match `*.medium.com`)

### Scenario 3: User Views a Saved Article

**Given** a user has previously scraped articles
**When** the user navigates to a saved article
**Then** the article is displayed as rendered Markdown with title, source link, and creation date

**Acceptance Criteria**:
- Markdown renders with proper formatting (headings, lists, code blocks, links, images)
- A link to the original source URL is displayed
- Creation date is shown
- Raw Markdown source is shown as fallback if rendering fails

### Scenario 4: User Generates an AI Summary

**Given** a user is viewing a saved article
**When** the user clicks "Summarize"
**Then** the system generates a concise AI summary and displays it on the article page

**Acceptance Criteria**:
- Summary is generated using the article's content as context
- Summary is cached — subsequent views show the cached summary without re-generating
- A loading indicator is shown during generation
- The summary persists across sessions (stored in the database)

### Scenario 5: User Asks Questions About an Article

**Given** a user is viewing a saved article
**When** the user types a question in the chat interface and sends it
**Then** the system responds with an answer grounded in the article's content

**Acceptance Criteria**:
- The article content is used as context for answering
- Chat history is preserved across page reloads
- Users can clear chat history
- Multiple questions can be asked in sequence within the same conversation

### Scenario 6: User Downloads an Article as PDF

**Given** a user is viewing a saved article
**When** the user clicks "Download PDF"
**Then** a PDF file is generated from the article content and downloaded to the user's device

**Acceptance Criteria**:
- PDF includes the article title as header
- Content formatting is preserved reasonably (headings, paragraphs)
- File is named using the article title (sanitized for filesystem)

### Scenario 7: User Deletes an Article

**Given** a user is viewing their article list or an individual article
**When** the user clicks "Delete" and confirms the action
**Then** the article and all associated data (summary, chat messages) are permanently removed

**Acceptance Criteria**:
- A confirmation dialog appears before deletion
- Deletion removes the article record, cached summary, and all chat messages
- The user is redirected to the article list after deletion
- A toast notification confirms deletion

### Scenario 8: Scraping Fails Gracefully

**Given** a user submits a URL that cannot be scraped (invalid URL, site blocks scraping, network error)
**When** the scraping attempt fails
**Then** the user receives a clear error message explaining what went wrong

**Acceptance Criteria**:
- Invalid URLs are caught before initiating scraping
- Network/timeout errors show a user-friendly message (not technical stack traces)
- The user can retry with the same or different URL
- Failed scrapes are marked with status `failed` and error details are visible in the article list

## Clarifications

### Session 2026-02-22

- Q: Should article scraping be restricted to specific URL patterns, or should any URL be accepted? → A: Accept any public URL; block private/internal IP ranges and localhost (SSRF protection)
- Q: What is the maximum article content size the system should accept and store? → A: 200KB of Markdown content (~50,000 words)
- Q: Should the scraping request have a timeout, and if so, how long? → A: Respond immediately with "in progress" status; scrape asynchronously and notify the user when the article is ready

## Functional Requirements

### FR-1: Article Fetch Form

The system must provide a URL input form accessible from the Knowledge Base hub:

1. User enters an article URL
2. System validates the URL format and rejects private/internal IP ranges, localhost, and non-HTTP(S) schemes
3. System checks cookie availability for the URL's domain via the existing cookie store
4. If no cookies exist for the domain, display a warning with "Proceed without cookies" and "Cancel" options
5. On submission, immediately confirm the scraping job has started (e.g., toast or inline status)
6. The user is free to navigate away; scraping proceeds in the background
7. When scraping completes, notify the user (e.g., in-app notification, article list status update, or toast if still on page)
8. On failure, notify the user with a clear error message; article record remains with status `failed` and error details visible in article list

### FR-2: Article Content Extraction

The system must extract article content from web pages:

1. Launch a headless browser and navigate to the target URL
2. If cookies are available, inject them before navigation
3. Wait for page content to load
4. Extract the article body by trying content selectors in priority order: `article`, `[role="article"]`, `.article-content`, `.post-content`, `.entry-content`, `.content-body`, `main`, `.main-content`, fallback to `body`
5. Strip non-content elements (scripts, styles, ads, navigation, footer, comments)
6. Extract the page title from `<title>`, `<h1>`, or Open Graph meta tags
7. Convert extracted HTML to Markdown
8. Save only 200KB of Markdown (~50,000 words) with a user-friendly size limit message

### FR-3: Article Storage

The system must persist scraped articles:

1. Each article record contains: user identity, source URL, title, Markdown content, optional AI summary, creation timestamp
2. Articles are scoped to the authenticated user (enforced by row-level security)
3. Duplicate URL submissions by the same user are allowed (each scrape creates a new record)

### FR-4: Article List View

The system must display the user's saved articles:

1. Show a list/table of articles with title, source domain, and creation date
2. Support pagination for large collections
3. Each row links to the article viewer
4. Provide a delete action per article (with confirmation)

### FR-5: Article Viewer

The system must display a single article with full functionality:

1. Render article content as Markdown with proper formatting
2. Show article metadata (title, source URL as clickable link, creation date)
3. Provide action buttons: Download PDF, Summarize, Ask Questions, Delete

### FR-6: AI Summary Generation

The system must generate and cache AI summaries:

1. Accept the article content as input context
2. Generate a concise summary using an AI model
3. Store the summary in the article record for future retrieval
4. Return the cached summary on subsequent requests without re-generation

### FR-7: Article Q&A Chat

The system must support conversational Q&A about articles:

1. Use the article content as system context for AI responses
2. Store chat messages (user and assistant) linked to the article and user
3. Support loading chat history for a previously started conversation
4. Support clearing chat history for an article

### FR-8: PDF Export

The system must generate downloadable PDF files from articles:

1. Include the article title as the document header
2. Convert article content to a formatted PDF
3. Trigger browser download with a filename derived from the article title

### FR-9: Article Deletion

The system must support article deletion with cascade:

1. Delete the article record
2. Delete all associated chat messages
3. Clear any cached summary (part of article record deletion)
4. Require user confirmation before proceeding

## Key Entities

### Article
- User-scoped record of a scraped web article
- Contains: source URL, title, Markdown content, optional AI summary
- Linked to: user identity, chat messages

### Article Chat Message
- Individual message in a Q&A conversation about an article
- Contains: role (user or assistant), message content, timestamp
- Linked to: article, user identity

## Success Criteria

- **SC-1**: Users receive immediate confirmation after submitting a URL; the article is available in the Knowledge Base within 30 seconds for typical web pages
- **SC-2**: Articles from the top 20 most common article/blog platforms render correctly with proper heading hierarchy, lists, and formatting
- **SC-3**: AI summaries are generated within 10 seconds and accurately capture the article's key points
- **SC-4**: Q&A responses are contextually grounded in the article content — answers reference information present in the article
- **SC-5**: The article list loads within 2 seconds for users with up to 500 saved articles
- **SC-6**: Cookie-authenticated scraping successfully retrieves content that fails without cookies on paywalled sites
- **SC-7**: All article data (content, summary, chat) is completely removed upon deletion with no orphaned records

## Assumptions

1. Article scraping will run in the Python backend (FastAPI BackgroundTasks + Playwright) to comply with constitution Principle IV (async jobs must use backend JobManager + SSE). The source project's Playwright logic will be ported to Python
2. AI features (summarize, chat) will use the Anthropic SDK directly from Next.js API routes, similar to the source project — this is simpler than routing through the Python backend for text-only operations
3. Cookie management (ZIP-001) and cookie domain matching patterns (ZIP-002) are already implemented and available for reuse
4. The Knowledge Base hub page already has a placeholder for "Add Article" that can be activated
5. Supabase RLS policies will be created for the new tables following the same patterns as existing tables (user_id = auth.uid())
6. Article scraping is an asynchronous operation — the user receives immediate confirmation and is notified when the article is ready, following the same background job pattern used for YouTube transcription

## Dependencies

- **ZIP-001** (Cookie Management): Provides cookie upload, storage, and retrieval infrastructure. **Status: Complete.**
- **ZIP-002** (Cookie Consumption): Provides domain matching and cookie file download patterns. **Status: Complete.**

## Out of Scope

- Batch article scraping (scraping multiple URLs at once)
- Article categorization or tagging
- Full-text search across articles
- Article sharing between users
- Automatic periodic re-scraping of articles for content updates
- RSS feed integration
- Browser extension for "save to AlphaBase"
- Rich media extraction (embedded videos, interactive elements)
- Article content editing after scraping
