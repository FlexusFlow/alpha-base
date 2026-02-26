# API Contracts: ZIP-006 Public RAG API

## Backend (Python FastAPI) Endpoints

### POST /v1/api/keys

Create a new API key for the authenticated user.

**Request**:
```json
{
  "name": "My Integration Key",
  "user_id": "uuid"
}
```

**Response** (200 OK):
```json
{
  "id": "uuid",
  "key": "zt_abcdefgh1234567890ABCDEFGH1234567890abcdefgh",
  "key_prefix": "zt_abcdefgh12",
  "name": "My Integration Key"
}
```

**Errors**:
- 400: Invalid name (empty or > 100 characters)

**Security Note**: The `key` field contains the full API key and is returned ONLY in this response. It will never be shown again. The client must display it to the user immediately with a copy button.

---

### GET /v1/api/keys

List all API keys for the authenticated user.

**Query Parameters**:
- `user_id` (required): UUID of the authenticated user

**Response** (200 OK):
```json
{
  "keys": [
    {
      "id": "uuid",
      "key_prefix": "zt_abcdefgh12",
      "name": "My Integration Key",
      "created_at": "2026-02-25T10:30:00Z",
      "last_used_at": "2026-02-25T14:15:00Z",
      "is_active": true
    },
    {
      "id": "uuid",
      "key_prefix": "zt_xyz9876543",
      "name": "Test Key",
      "created_at": "2026-02-20T08:00:00Z",
      "last_used_at": null,
      "is_active": false
    }
  ]
}
```

**Notes**:
- Only the `key_prefix` (first 12 characters) is returned, never the full key
- `last_used_at` is `null` if the key has never been used
- `is_active: false` indicates a revoked key

---

### DELETE /v1/api/keys/{key_id}

Revoke (deactivate) an API key.

**Query Parameters**:
- `user_id` (required): UUID of the authenticated user

**Response** (200 OK):
```json
{
  "message": "API key revoked successfully"
}
```

**Errors**:
- 404: Key not found or does not belong to user

**Notes**:
- Sets `is_active = false` on the key record
- Revoked keys are immediately rejected by the verification system
- Revocation is permanent — keys cannot be re-activated

---

### POST /v1/api/public/query

Query the AlphaBase RAG system with an API key.

**Authentication**: `Authorization: Bearer zt_<api_key>`

**Request**:
```json
{
  "question": "What are the best trading strategies for beginners?",
  "history": [
    {
      "role": "user",
      "content": "Tell me about day trading"
    },
    {
      "role": "assistant",
      "content": "Day trading involves..."
    }
  ],
  "include_sources": true
}
```

**Response** (200 OK):
```json
{
  "answer": "Based on the AlphaBase videos, beginners should start with...",
  "sources": [
    "Video: Trading Strategies 101 (Chunk 5)",
    "Video: Risk Management for New Traders (Chunk 12)"
  ]
}
```

**Errors**:
- 401: Invalid or revoked API key
  ```json
  {
    "detail": "Invalid API key"
  }
  ```
- 429: Rate limit exceeded (60 requests/minute)
  ```json
  {
    "detail": "Rate limit exceeded. Try again later."
  }
  ```
- 400: Invalid request (question too long, invalid history format)
  ```json
  {
    "detail": "Question exceeds maximum length of 2000 characters"
  }
  ```
- 500: Internal server error (LLM API failure, DeepLake error)
  ```json
  {
    "detail": "Internal server error"
  }
  ```

**Notes**:
- `question`: Required, 1-2000 characters
- `history`: Optional, array of chat messages for context-aware responses
- `include_sources`: Optional, boolean (default true). If false, `sources` array is empty
- The response is synchronous (NOT streaming). The backend accumulates the full LLM response before returning
- Requests are NOT saved to `chat_messages` table (no `project_id` context)
- All requests are logged to `api_usage_logs` table
- The endpoint uses the authenticated user's Deep Memory settings for retrieval

**Rate Limiting**:
- 60 requests per minute per API key
- Sliding window based on request timestamps
- Reset time is not explicitly communicated (standard sliding window behavior)

---

## Next.js API Route Endpoints (Proxy Layer)

### POST /api/keys

Frontend proxy for creating API keys. Handles Supabase auth.

**Request**:
```json
{
  "name": "My Integration Key"
}
```

**Response** (200 OK):
```json
{
  "id": "uuid",
  "key": "zt_abcdefgh1234567890ABCDEFGH1234567890abcdefgh",
  "key_prefix": "zt_abcdefgh12",
  "name": "My Integration Key"
}
```

**Implementation Notes**:
- Authenticates user via Supabase session
- Extracts `user_id` from session
- Forwards to FastAPI `POST /v1/api/keys` with `{ name, user_id }`
- Returns response unchanged

---

### GET /api/keys

Frontend proxy for listing API keys. Handles Supabase auth.

**Response** (200 OK):
```json
{
  "keys": [...]
}
```

**Implementation Notes**:
- Authenticates user via Supabase session
- Extracts `user_id` from session
- Forwards to FastAPI `GET /v1/api/keys?user_id={user_id}`

---

### DELETE /api/keys/[keyId]

Frontend proxy for revoking API keys. Handles Supabase auth.

**Response** (200 OK):
```json
{
  "message": "API key revoked successfully"
}
```

**Implementation Notes**:
- Authenticates user via Supabase session
- Extracts `user_id` from session
- Forwards to FastAPI `DELETE /v1/api/keys/{keyId}?user_id={user_id}`

---

## Request Flow Diagrams

### Creating an API Key (Dashboard)

```
User (Browser)
    │
    └── POST /api/keys { name }
        │
        └── [Next.js Proxy: Authenticate, inject user_id]
            │
            └── POST /v1/api/keys { name, user_id }
                │
                └── [FastAPI: Generate key, hash, store]
                    │
                    └── Response { id, key, key_prefix, name }
                        │
                        └── [Frontend: Show key in modal, warn user]
```

### Querying RAG (External Integration)

```
External Client (AI Assistant, cURL, etc.)
    │
    └── POST /v1/api/public/query
        Authorization: Bearer zt_...
        { question, history, include_sources }
        │
        └── [FastAPI: Verify API key]
            │
            └── [FastAPI: Check rate limit]
                │
                └── [ChatService: Retrieve context with Deep Memory]
                    │
                    └── [ChatService: Generate answer with LLM]
                        │
                        └── [FastAPI: Log usage]
                            │
                            └── Response { answer, sources }
```
