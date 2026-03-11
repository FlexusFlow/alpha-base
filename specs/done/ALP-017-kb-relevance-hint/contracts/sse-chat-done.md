# Contract: Chat SSE Done Event

## Endpoint

`POST /v1/api/chat` (existing, SSE stream)

## Done Event Schema (updated)

```json
{
  "done": true,
  "sources": ["string"],
  "source_types": ["kb" | "web"],
  "kb_relevant": true | false | null
}
```

### Field: `kb_relevant`

| Value | Meaning |
|-------|---------|
| `true` | KB context was relevant; no hint needed |
| `false` | KB context had low relevance or no results; show extended search hint |
| `null` / absent | Extended search mode — hint not applicable |

### Backward Compatibility

- Field is additive; existing clients that don't read `kb_relevant` are unaffected
- No changes to token streaming events (`{"token": "..."}`)
- No changes to request schema (`ChatRequest`)
