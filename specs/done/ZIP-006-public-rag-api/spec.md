# Feature Specification: Public RAG API + ClawHub Skill

**Feature ID**: ZIP-006
**Branch**: `feature/ZIP-006-public-rag-api`
**Status**: Implemented
**Created**: 2026-02-25

## Overview

AlphaBase's RAG chat system is currently accessible only through the web dashboard. This limits its utility to manual browsing sessions and prevents integration with external tools, automation workflows, and AI assistants.

This feature exposes the RAG system as a public API with API key authentication, enabling external consumers (AI assistants via ClawHub skills, third-party integrations, automation scripts) to query the knowledge base programmatically without requiring dashboard access. The existing browser-based SSE chat flow remains unchanged.

## Problem Statement

The current architecture has several limitations:

- **Dashboard-only access**: Users can only query the knowledge base through the web UI, requiring manual interaction
- **No programmatic access**: External tools and automation workflows cannot leverage the knowledge base
- **Limited integration**: AI assistants (Claude via ClawHub) cannot access AlphaBase's domain expertise
- **Authentication bottleneck**: The only way to access the RAG system is through full user authentication with Supabase session management

## User Scenarios & Testing

### Scenario 1: AI Assistant Queries Knowledge Base

**Given** an AI assistant (Claude) with a ClawHub skill configured for AlphaBase
**When** a user asks the assistant a question about trading strategies
**Then** the assistant invokes the AlphaBase RAG API with the question and includes cited sources in the response

**Acceptance Criteria**:
- The AI assistant can authenticate using an API key
- The query includes conversation history for context-aware responses
- The response includes both the answer text and source citations
- Rate limiting prevents abuse (60 requests/minute on MVP)

### Scenario 2: External Integration Access

**Given** a third-party application that wants to integrate AlphaBase knowledge
**When** the application sends a REST API request with a valid API key
**Then** it receives a structured JSON response with the answer and sources

**Acceptance Criteria**:
- The endpoint accepts standard REST requests (not SSE)
- Authentication uses standard Bearer token pattern
- Responses are synchronous JSON (not streaming)
- Usage is logged for auditing

### Scenario 3: User Creates API Key

**Given** an authenticated user in the AlphaBase dashboard
**When** the user creates a new API key with a descriptive name
**Then** the full key is shown once and can be copied, after which only a prefix is displayed

**Acceptance Criteria**:
- Keys follow the format `zt_<random>` (44+ characters)
- The full key is shown only once at creation time
- A copy button is provided for easy clipboard transfer
- The key is stored as a SHA-256 hash in the database
- Only the first 12 characters (prefix) are shown in subsequent views

### Scenario 4: User Manages API Keys

**Given** a user has multiple API keys
**When** the user views the API Keys page in the dashboard
**Then** they see a table showing all keys with metadata and management options

**Acceptance Criteria**:
- Table displays: key prefix, name, created date, last used date, active status
- User can revoke (deactivate) any key
- Revoked keys immediately stop working for API requests
- The interface clearly indicates which keys are active vs revoked

### Scenario 5: Rate Limiting Protects Service

**Given** an external consumer with a valid API key
**When** they exceed 60 requests within a minute
**Then** subsequent requests are rejected with a 429 status code

**Acceptance Criteria**:
- In-memory rate limiter tracks requests per API key
- 60 requests/minute limit enforced on MVP
- Clear error message indicates rate limit exceeded
- Rate limit resets after the time window passes

## Functional Requirements

### FR-1: API Key Management System

The system must provide secure API key creation, storage, and verification:

1. Users can create API keys with descriptive names (max 100 characters)
2. Generated keys follow the format `zt_{secrets.token_urlsafe(32)}` (44+ characters total)
3. Keys are stored as SHA-256 hashes in the database, never in plaintext
4. Key prefixes (first 12 characters) are stored separately for UI display
5. Users can list all their API keys with metadata (name, created date, last used date, active status)
6. Users can revoke keys, setting `is_active = false`
7. Revoked keys are immediately rejected by the verification system

### FR-2: Public Query Endpoint

The system must provide a synchronous, non-streaming RAG query endpoint:

1. Accept POST requests at `/v1/api/public/query`
2. Authenticate requests via `Authorization: Bearer <api_key>` header
3. Accept query parameters: question (required), history (optional array of chat messages), include_sources (optional boolean, default true)
4. Use the authenticated user's Deep Memory settings for retrieval
5. Return structured JSON responses with answer text and source citations
6. Do NOT save queries to the chat_messages table (no project_id context)
7. Log all requests to the api_usage_logs table with endpoint, status code, and timestamp

### FR-3: Rate Limiting

The system must prevent abuse through rate limiting:

1. Implement in-memory rate limiting (60 requests/minute per API key)
2. Track request timestamps per key_id using defaultdict
3. Return HTTP 429 when limit exceeded
4. Include clear error messages indicating rate limit status

### FR-4: Usage Logging

The system must track API usage for auditing and diagnostics:

1. Log every public API request to `api_usage_logs` table
2. Store: api_key_id, user_id, endpoint, status_code, timestamp
3. Support filtering by api_key_id and user_id
4. Automatically update `last_used_at` timestamp on api_keys table

### FR-5: Dashboard UI for Key Management

The system must provide a user-friendly interface for API key management:

1. New page at `/dashboard/api-keys` accessible from sidebar
2. Display keys in a table using TanStack Table component
3. Show "Create Key" button that opens a dialog for entering key name
4. After creation, display full key in a modal with copy button and security warning
5. Table includes "Revoke" action for each active key
6. Follow existing dashboard patterns (async server component + client islands)

### FR-6: ClawHub Skill File

The system must provide a skill file for AI assistant integration:

1. Create `skill/alphabase-rag.md` with ~30-40 lines
2. Include: description, when to use, API endpoint URL, authentication pattern, request/response examples, error handling guidance
3. Provide clear instructions for AI on citing sources and handling missing API keys

## Key Entities

### API Key
- **id**: UUID (primary key)
- **user_id**: UUID (foreign key to auth.users)
- **key_hash**: Text (SHA-256 hash, unique)
- **key_prefix**: Text (first 12 characters for UI display)
- **name**: Text (user-provided label, max 100 characters)
- **created_at**: Timestamp with timezone
- **last_used_at**: Timestamp with timezone (nullable)
- **is_active**: Boolean (default true)

### API Usage Log
- **id**: UUID (primary key)
- **api_key_id**: UUID (foreign key to api_keys, nullable if key deleted)
- **user_id**: UUID (foreign key to auth.users)
- **endpoint**: Text (e.g., "/v1/api/public/query")
- **status_code**: Integer (HTTP response code)
- **created_at**: Timestamp with timezone

## Success Criteria

- **SC-1**: External AI assistants can successfully query AlphaBase's knowledge base using API keys with <2 second median response time
- **SC-2**: API key creation, display, and revocation flow completes in under 30 seconds for users
- **SC-3**: Rate limiting correctly rejects requests exceeding 60/minute without affecting other users
- **SC-4**: The public API endpoint coexists with the existing SSE chat without any changes to dashboard chat functionality
- **SC-5**: API keys remain secure: full keys are never stored in plaintext, never logged, and only shown once at creation
- **SC-6**: Usage logs enable administrators to track API consumption per user and per key

## Assumptions

1. The existing ChatService can be reused for RAG retrieval without modification
2. Deep Memory settings are user-scoped and work correctly when passed a user_id from the API key
3. In-memory rate limiting is sufficient for MVP (Redis migration deferred to future work)
4. ClawHub skill file format matches the ~30-40 line markdown structure described in plan
5. Only one Supabase migration is needed to create both tables (api_keys and api_usage_logs)

## Dependencies

- **ZIP-004 Deep Memory Training**: The public API uses Deep Memory for enhanced retrieval accuracy
- **Existing ChatService**: The public query endpoint reuses the existing RAG pipeline

## Out of Scope

- JWT middleware for internal dashboard endpoints (separate backlog item)
- User-scoped vector store filtering (separate backlog item)
- Stripe integration and paid tiers
- Landing page for public API marketing
- Token-level usage tracking and billing
- Redis-based distributed rate limiting
- Expiration dates on API keys
- IP whitelisting
- Publishing skill to ClawHub platform (requires platform access)

## Clarifications

### Session 2026-02-25

- Q: Should the public endpoint use SSE streaming like the dashboard chat? → A: No. Use synchronous JSON responses for simpler integration with external tools.
- Q: Should public queries be saved to chat_messages table? → A: No. They have no project_id context and should not pollute the chat history.
- Q: What format should API keys follow? → A: Prefix `zt_` + 32 bytes from `secrets.token_urlsafe` = 44+ character keys. Prefix makes them recognizable.
- Q: How should rate limiting work on MVP? → A: In-memory defaultdict tracking timestamps per key_id. 60 requests/minute limit. Redis deferred to production.
- Q: Should the ClawHub skill be published? → A: Out of scope for MVP. Only create the skill file; publishing requires platform access.
