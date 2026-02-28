# ALP-010 Data Model

No new database tables or entities are introduced by this feature. The authentication layer operates entirely at the request/response level.

## Modified Entities

### Settings (config.py)
New field:
- `supabase_jwt_secret: str` — JWT signing secret from Supabase project settings, used for local token validation

### Request Models — Fields Removed

The `user_id` field is removed from the following Pydantic request models (identity now comes from JWT):

| Model | File | Field Removed |
|-------|------|---------------|
| `KnowledgeAddRequest` | `models/knowledge.py` | `user_id: str` |
| `BulkDeleteRequest` | `models/knowledge.py` | `user_id: str` |
| `ArticleScrapeRequest` | `models/articles.py` | `user_id: str` |
| `GenerateRequest` | `models/deep_memory.py` | `user_id: str` |
| `TrainRequest` | `models/deep_memory.py` | `user_id: str` |
| `ProceedRequest` | `models/deep_memory.py` | `user_id: str` |
| `UpdateSettingsRequest` | `models/deep_memory.py` | `user_id: str` |
| `APIKeyCreateRequest` | `models/api_keys.py` | `user_id: str` |

### Query/Path Parameters Removed

| Router | Endpoint | Parameter Removed |
|--------|----------|-------------------|
| `knowledge` | `DELETE /channels/{channel_id}` | `user_id: str = Query(...)` |
| `api_keys` | `GET /` | `user_id: str = Query(...)` |
| `api_keys` | `DELETE /{key_id}` | `user_id: str = Query(...)` |
| `deep_memory` | `GET /runs` | `user_id` query param |
| `deep_memory` | `GET /runs/{run_id}` | `user_id` query param |
| `deep_memory` | `DELETE /runs/{run_id}` | `user_id` query param |
| `deep_memory` | `GET /settings` | `user_id` query param |
| `user_cleanup` | `DELETE /user-cleanup/{user_id}` | `user_id` path param (replaced with token identity) |

## New Dependency

### `get_current_user` (dependencies.py)
- **Input**: `Authorization: Bearer <jwt>` header
- **Output**: `str` (user UUID from JWT `sub` claim)
- **Errors**: `401 Unauthorized` with detail message
