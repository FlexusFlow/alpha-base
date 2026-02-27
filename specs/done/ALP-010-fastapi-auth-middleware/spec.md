# FastAPI Auth Middleware (Defense in Depth)

**Feature ID**: ALP-010
**Status**: Draft
**Created**: 2026-02-27

## Problem Statement

The FastAPI backend endpoints accept `user_id` from request bodies and query parameters without verifying the caller's identity. While the Next.js API routes inject the authenticated user's ID before forwarding requests, the FastAPI endpoints themselves perform no authentication. Any direct caller (bypassing the Next.js layer) can pass an arbitrary `user_id` and access or modify another user's data. This is especially dangerous because the backend uses Supabase's service-role client, which bypasses Row Level Security.

Currently, ~18 endpoints across 6 routers accept `user_id` in various forms (request body, query parameters, path parameters) with no validation that the caller is actually that user.

## Goals

- Ensure every request to protected backend endpoints is authenticated via a valid access token
- Extract the authenticated user's identity from the token rather than trusting client-supplied values
- Prevent unauthorized access to other users' data when the backend is called directly (outside the Next.js proxy)
- Maintain backward compatibility with the existing Next.js frontend flow
- Preserve the existing public API key authentication for the public query endpoint

## Non-Goals

- Migrating away from Supabase Auth (the system continues to use Supabase-issued JWTs)
- Adding role-based access control (RBAC) or permission tiers beyond user identity
- Changing the frontend authentication flow
- Modifying the Supabase RLS policies

## User Scenarios & Testing

### Scenario 1: Authenticated User via Next.js Frontend
**Given** a user is logged in through the Next.js frontend
**When** the frontend makes a request to a FastAPI endpoint via the Next.js API proxy
**Then** the request includes a valid Supabase access token, the backend validates it, extracts the user identity, and processes the request using that identity — ignoring any `user_id` in the request body

### Scenario 2: Direct API Call Without Token
**Given** an unauthenticated caller makes a direct request to a protected FastAPI endpoint
**When** no access token is provided in the request
**Then** the backend rejects the request with an appropriate error before any business logic executes

### Scenario 3: Direct API Call With Invalid Token
**Given** a caller provides an expired, malformed, or tampered access token
**When** the backend attempts to validate the token
**Then** the request is rejected with an appropriate error

### Scenario 4: Direct API Call With Valid Token But Wrong user_id
**Given** a caller provides a valid access token for User A but includes User B's `user_id` in the request body
**When** the backend processes the request
**Then** the backend uses User A's identity (from the token) and ignores the `user_id` in the request body, preventing unauthorized access to User B's data

### Scenario 5: Public API Endpoint (API Key Auth)
**Given** a caller uses the public query endpoint with a valid API key
**When** the request is made with an API key in the Authorization header
**Then** the existing API key authentication continues to work as before — JWT validation is not required for this endpoint

### Scenario 6: Unauthenticated Public Endpoints
**Given** a caller makes a request to an endpoint that does not require authentication (e.g., YouTube preview, health check)
**When** no token is provided
**Then** the request is processed normally without authentication

### Scenario 7: SSE Event Stream
**Given** an authenticated user connects to the SSE event stream
**When** the connection is established
**Then** the existing job-ID-based event streaming continues to function (events are scoped by job ID, not user identity directly)

## Functional Requirements

### FR-1: Token Validation
The system must validate access tokens on all protected endpoints. Validation must confirm the token has not expired and was issued by the trusted authentication provider (Supabase Auth). The system must reject requests with missing, expired, or invalid tokens.

### FR-2: User Identity Extraction
Upon successful token validation, the system must extract the user's unique identifier from the token claims. This extracted identity becomes the authoritative source of the user's identity for the request — replacing any `user_id` supplied in request bodies, query parameters, or path parameters.

### FR-3: Endpoint Classification
Endpoints must be classified into categories:
- **Protected**: Require token validation and user identity extraction (~18 endpoints across knowledge, articles, deep_memory, api_keys, chat, and user_cleanup routers)
- **Public with API key auth**: Use existing API key validation (public_query router)
- **Fully public**: No authentication required (YouTube preview, health check, SSE events)

### FR-4: Request Identity Override
For protected endpoints, the authenticated user's identity from the token must take precedence over any `user_id` value supplied in the request. The system must ensure business logic always operates with the token-derived identity.

### FR-5: Error Responses
Authentication failures must return clear, standardized error responses that indicate the nature of the failure (missing token, invalid token, expired token) without leaking sensitive system details.

### FR-6: Backward Compatibility
The authentication mechanism must be compatible with the existing Next.js frontend flow. The frontend already sends Supabase access tokens — the middleware must accept these tokens without requiring frontend changes.

### FR-7: Exemption Mechanism
The system must provide a clear mechanism to exempt specific endpoints from authentication (public endpoints, health checks) so that new endpoints added in the future can be explicitly marked as public or protected.

## Success Criteria

- All protected endpoints reject requests without a valid access token
- A caller cannot access another user's data by supplying a different `user_id` in the request
- The existing frontend continues to function without modification
- The public query API endpoint continues to work with API key authentication
- Authentication adds no more than 200ms of latency to any request under normal conditions
- All existing automated tests continue to pass (with necessary test setup adjustments for authentication)

## Key Entities

- **Access Token**: A signed token issued by Supabase Auth containing the user's identity and expiration
- **User Identity**: The unique user identifier extracted from a validated access token
- **Protected Endpoint**: An API endpoint that requires a valid access token to access
- **Public Endpoint**: An API endpoint that does not require authentication

## Assumptions

- The Next.js frontend already includes the Supabase access token in requests to the backend (via `Authorization` header or similar mechanism). If not, the Next.js API proxy layer will need a minor update to forward the token.
- Supabase access tokens are standard JWTs that can be validated using the Supabase JWT secret available in the backend configuration.
- The SSE events endpoint (`/v1/api/events/stream/{job_id}`) does not require JWT authentication because events are scoped by job ID (which is ephemeral and not guessable). This is an acceptable trade-off for SSE connection simplicity.
- The `youtube/preview` endpoint remains public as it performs a stateless lookup with no user-scoped data.

## Dependencies

- Supabase JWT secret must be available in the backend configuration
- Access to the Supabase Auth token format and claims structure

## Risks

- **Token forwarding gap**: If the Next.js API proxy does not currently forward the Supabase access token to the FastAPI backend, a small frontend change will be required. This should be verified during implementation.
- **Test suite impact**: Existing backend tests that call endpoints without authentication will need updates to include valid tokens or mock the authentication layer.
