# Data Model: Query Reformulation

No new database entities, schema changes, or persistent data structures required.

## Internal Data Flow

```
User query (original) → reformulate_query() → corrected query → vectorstore.similarity_search()
                       ↓ (on failure)
                       original query → vectorstore.similarity_search()
```

The reformulated query is ephemeral — used only for the vectorstore search within the current request. It is not stored, displayed, or returned to the frontend.

## Configuration (additive)

New setting in `backend/app/config.py`:
- `query_reformulation_model`: `str` (default `"gpt-4o-mini"`) — model used for query reformulation
