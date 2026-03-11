# Data Model: KB Relevance Hint

No new database entities or schema changes required.

## Modified Data Structures

### Backend: SSE Done Event (additive)

Current:
```json
{"done": true, "sources": ["url1", "url2"], "source_types": ["kb", "kb"]}
```

Updated:
```json
{"done": true, "sources": ["url1", "url2"], "source_types": ["kb", "kb"], "kb_relevant": true}
```

- `kb_relevant`: `boolean` — `true` when KB context adequately answers the question, `false` when low relevance or zero results. Only meaningful in KB-only mode. Omitted (or `null`) in extended search mode.

### Frontend: ChatMessage (additive)

```typescript
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  sourceTypes?: string[]
  kbRelevant?: boolean      // NEW — undefined in extended search mode
  extendedSearch?: boolean   // NEW — tracks which mode produced this message
}
```

### Backend: Settings (additive)

New optional setting:
- `kb_relevance_threshold`: `float` (default `0.5`) — top vectorstore score must exceed this to mark response as "relevant". Separate from `rag_score_threshold` which filters retrieval.
