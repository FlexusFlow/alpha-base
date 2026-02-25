# ZIP-006: Public RAG API + ClawHub Skill

## Цель

Выставить RAG-чат ZipTrader как публичный API с авторизацией по API-ключам. Это позволит внешним потребителям (ClaudeBot через скилл на ClawHub, сторонние интеграции) делать запросы к базе знаний без доступа к дашборду.

## Архитектура

```
                    ┌────────────────────────┐
                    │  Существующий поток     │
                    │  Browser → Next.js →    │
                    │  POST /v1/api/chat      │
                    │  (SSE, user_id в body)  │
                    └────────────────────────┘

                    ┌────────────────────────┐
                    │  Новый публичный поток  │
                    │  ClaudeBot / cURL →     │
                    │  POST /v1/api/public/   │
                    │    query                │
                    │  (JSON, API key в       │
                    │   Authorization header) │
                    └────────────────────────┘
```

Два потока сосуществуют. Существующий SSE-чат не меняется.

---

## Фаза 1: Backend — API Key система

### 1.1 Миграция Supabase: таблица `api_keys`

```sql
CREATE TABLE public.api_keys (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,           -- SHA-256 от полного ключа
  key_prefix  TEXT NOT NULL,                  -- первые 12 символов для UI
  name        TEXT NOT NULL,                  -- пользовательская метка
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  is_active   BOOLEAN DEFAULT TRUE,

  CONSTRAINT api_keys_name_length CHECK (char_length(name) <= 100)
);

-- RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_keys_select" ON public.api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_keys_insert" ON public.api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_keys_update" ON public.api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_keys_delete" ON public.api_keys FOR DELETE USING (auth.uid() = user_id);

-- Индексы
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash);
CREATE INDEX idx_api_keys_user_active ON public.api_keys(user_id, is_active);
```

### 1.2 Миграция Supabase: таблица `api_usage_logs`

```sql
CREATE TABLE public.api_usage_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id  UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint    TEXT NOT NULL,
  status_code INT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_logs_select" ON public.api_usage_logs FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_usage_logs_key_ts ON public.api_usage_logs(api_key_id, created_at);
CREATE INDEX idx_usage_logs_user_ts ON public.api_usage_logs(user_id, created_at);
```

> Минимум полей для MVP. Без токен-каунтинга, без IP — добавим позже при необходимости.

### 1.3 Модели: `backend/app/models/api_keys.py` (новый файл)

```python
from pydantic import BaseModel, Field
from datetime import datetime


class ChatMessage(BaseModel):
    role: str
    content: str


class APIKeyCreateRequest(BaseModel):
    name: str = Field(..., max_length=100)


class APIKeyCreateResponse(BaseModel):
    """Полный ключ возвращается ОДИН раз при создании."""
    id: str
    key: str               # "zt_<random>"  — показать и больше никогда
    key_prefix: str         # "zt_abc1..."
    name: str


class APIKeyItem(BaseModel):
    id: str
    key_prefix: str
    name: str
    created_at: datetime
    last_used_at: datetime | None
    is_active: bool


class APIKeyListResponse(BaseModel):
    keys: list[APIKeyItem]


class PublicQueryRequest(BaseModel):
    """Синхронный запрос (не SSE) для внешних потребителей."""
    question: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatMessage] = []
    include_sources: bool = True


class PublicQueryResponse(BaseModel):
    answer: str
    sources: list[str] = []
```

### 1.4 Сервис: `backend/app/services/api_key_service.py` (новый файл)

Ответственности:
- `create(user_id, name) → (full_key, key_prefix, key_id)` — генерация `zt_` + 32 байта secrets.token_urlsafe, хранение SHA-256 хэша
- `verify(api_key) → {key_id, user_id, name} | None` — lookup по хэшу, проверка is_active
- `update_last_used(key_id)` — обновить last_used_at
- `list(user_id) → list[dict]`
- `revoke(user_id, key_id)` — поставить is_active=False
- `log_usage(key_id, user_id, endpoint, status_code)` — запись в api_usage_logs

Формат ключа: `zt_{secrets.token_urlsafe(32)}` — 44+ символа, префикс `zt_` для опознания.

### 1.5 Dependency: обновить `backend/app/dependencies.py`

Добавить `verify_api_key(request: Request) → dict`:
- Читает `Authorization: Bearer <key>` из хедера
- Вызывает `APIKeyService.verify(key)`
- При невалидном ключе → `HTTPException(401)`
- При успехе → возвращает `{key_id, user_id, name}`

### 1.6 Роутер: `backend/app/routers/api_keys.py` (новый файл)

Prefix: `/v1/api/keys`

| Метод | Эндпоинт | Что делает | Auth |
|-------|----------|------------|------|
| POST | `/` | Создать ключ | user_id (из body, как везде сейчас) |
| GET | `/` | Список ключей | user_id (query param) |
| DELETE | `/{key_id}` | Отозвать ключ | user_id (query param) |

> Примечание: авторизация пока через user_id в body/params — как все текущие роутеры. JWT-мидлварь добавим в отдельном тикете (бэклог).

### 1.7 Роутер: `backend/app/routers/public_query.py` (новый файл)

Prefix: `/v1/api/public`

| Метод | Эндпоинт | Что делает | Auth |
|-------|----------|------------|------|
| POST | `/query` | RAG-запрос, полный JSON-ответ | API key (Bearer) |

Логика:
1. `verify_api_key` → получаем user_id
2. Создаём `ChatService(settings, supabase)`
3. `_retrieve_context(question, user_id=user_id)` — ищем в векторсторе с учётом Deep Memory
4. `_build_messages(context, history, question)` — собираем промпт
5. Собираем полный ответ через `llm.astream()` (НЕ SSE — просто аккумулируем)
6. Логируем использование
7. Возвращаем `PublicQueryResponse(answer=..., sources=...)`

Не сохраняем в `chat_messages` — у публичных запросов нет project_id.

### 1.8 Обновить `backend/app/main.py`

```python
from app.routers import api_keys, public_query
# ...
app.include_router(api_keys.router)
app.include_router(public_query.router)
```

### 1.9 Rate limiting (простой, in-memory)

В `dependencies.py` — декоратор/dependency `check_rate_limit`:
- `defaultdict(list)` с таймстампами по key_id
- 60 запросов/минуту на MVP
- `HTTPException(429)` при превышении

> Для продакшена заменим на Redis. Для MVP — достаточно.

---

## Фаза 2: Frontend — Управление API-ключами

### 2.1 Страница: `next-frontend/app/dashboard/api-keys/page.tsx`

Компоненты:
- **Таблица ключей** (TanStack Table) — key_prefix, name, created_at, last_used_at, статус, кнопка "Revoke"
- **Кнопка "Create Key"** → диалог с полем name
- **Диалог с секретом** — после создания показать полный ключ + кнопка "Copy". Предупреждение: «Ключ больше не будет показан».

Паттерн: как `/dashboard/deep-memory/page.tsx` — async server component + client island для интерактивности.

### 2.2 API-хелпер: `next-frontend/lib/api/api-keys.ts`

```typescript
export async function createAPIKey(userId: string, name: string): Promise<APIKeyCreateResponse>
export async function listAPIKeys(userId: string): Promise<APIKeyListResponse>
export async function revokeAPIKey(userId: string, keyId: string): Promise<void>
```

### 2.3 Next.js API-прокси: `next-frontend/app/api/keys/route.ts`

По существующему паттерну: Supabase auth → inject user_id → forward to FastAPI.

### 2.4 Сайдбар: обновить `components/app-sidebar.tsx`

Добавить пункт:
```typescript
{ title: "API Keys", url: "/dashboard/api-keys", icon: Key }
```

Иконка: `Key` из lucide-react.

---

## Фаза 3: Skill-файл для ClawHub

### 3.1 Файл: `skill/ziptrader-rag.md`

~30-40 строк текста, содержащий:
- **Описание**: «Запрос к базе знаний ZipTrader по инвестициям и трейдингу на основе транскрибированных YouTube-видео»
- **Когда использовать**: вопросы о трейдинге, стратегиях, акциях, когда пользователь явно просит ZipTrader
- **API endpoint**: `POST https://<domain>/v1/api/public/query`
- **Авторизация**: `Authorization: Bearer <api_key>`
- **Формат запроса/ответа**: JSON-примеры
- **Обработка ошибок**: 401, 429, 500
- **Инструкции для AI**: цитировать sources, при отсутствии ключа — попросить пользователя получить его

---

## Фаза 4: Тестирование

### 4.1 Backend-тесты: `backend/tests/test_api_keys.py`

- Генерация ключа: формат `zt_*`, хэш не равен ключу
- Верификация: валидный ключ → user_id, невалидный → None
- Отзыв: отозванный ключ не проходит verify
- Rate limit: 61-й запрос в минуту → 429

### 4.2 Backend-тесты: `backend/tests/test_public_query.py`

- Запрос без ключа → 401
- Запрос с невалидным ключом → 401
- Запрос с валидным ключом → 200 + answer + sources
- Запись в api_usage_logs после запроса

### 4.3 Ручное тестирование

- cURL с реальным ключом → проверить ответ
- Проверить в ClaudeBot (если доступен)

---

## Порядок реализации

| # | Задача | Файлы | Зависимости |
|---|--------|-------|-------------|
| 1 | SQL-миграции (api_keys, api_usage_logs) | Supabase SQL | — |
| 2 | Модели (api_keys.py) | backend/app/models/api_keys.py | — |
| 3 | Сервис API-ключей | backend/app/services/api_key_service.py | #2 |
| 4 | Dependency verify_api_key + rate limiter | backend/app/dependencies.py | #3 |
| 5 | Роутер управления ключами | backend/app/routers/api_keys.py | #3, #4 |
| 6 | Роутер публичного запроса | backend/app/routers/public_query.py | #3, #4 |
| 7 | Регистрация в main.py | backend/app/main.py | #5, #6 |
| 8 | Backend-тесты | backend/tests/ | #5, #6 |
| 9 | Frontend API-прокси | next-frontend/app/api/keys/ | #5 |
| 10 | Frontend страница API Keys | next-frontend/app/dashboard/api-keys/ | #9 |
| 11 | Обновить сайдбар | next-frontend/components/app-sidebar.tsx | #10 |
| 12 | Skill-файл | skill/ziptrader-rag.md | #6 |

---

## Что не входит в MVP

- JWT-мидлварь для внутренних эндпоинтов (отдельный тикет)
- Stripe-интеграция и платные тарифы
- Лендинг-страница
- Лимиты по токенам / биллинг
- Redis rate limiting
- Token counting в usage logs
- Expiration на ключах
- IP whitelisting
- Публикация на ClawHub (требует доступ к платформе)

---

## Связь с бэклогом

- **FastAPI Auth Middleware** — этот тикет НЕ решает общую проблему JWT-валидации для внутренних эндпоинтов. Он добавляет *параллельный* механизм авторизации (API keys) только для нового публичного эндпоинта. JWT-мидлварь остаётся в бэклоге.
- **User-Scoped Vector Store** — публичный API использует user_id из верифицированного ключа для Deep Memory settings. Когда user_id будет добавлен в метадату вектора, публичный API автоматически получит user-scoped результаты.
