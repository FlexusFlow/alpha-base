# AlphaBase

Full-stack YouTube knowledge base app. Scrape YouTube channels, transcribe videos, ingest them into a vector store, and query the knowledge base using RAG powered by GPT-4o. Also supports article scraping, cookie-based auth for paywalled content, Deep Memory training, and a public RAG API.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | Python 3.12+, FastAPI, LangChain, DeepLake, OpenAI, uv |
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui |
| **Database** | Supabase (PostgreSQL + Auth + Storage) |
| **Vector Store** | DeepLake Cloud with Deep Memory |
| **AI Models** | GPT-4o (chat), Anthropic Claude Haiku/Sonnet (articles), text-embedding-3-small (embeddings) |

## Features

- **YouTube scraping** — bulk-scrape channels (up to 500 videos), auto-categorize videos
- **Transcription** — youtube-transcript-api with yt-dlp fallback
- **RAG chat** — streaming responses via SSE, persistent chat projects
- **Article scraping** — Playwright-based with AI summaries (Anthropic Claude)
- **Documentation site scraping** — multi-page discovery, concurrent scraping, per-page tracking, retry failed pages
- **Cookie management** — access paywalled/private content
- **Deep Memory training** — LLM-generated training data for +22% retrieval accuracy
- **Public RAG API** — API key authentication, rate limiting (60 req/min)
- **Per-user knowledge base isolation** — dedicated DeepLake datasets per user
- **JWT auth middleware** — server-side Supabase token validation on all backend endpoints
- **Anti-bot scraper fingerprint** — realistic browser fingerprint for Cloudflare-protected sites
- **Auth** — login, signup, password reset, email verification via Supabase

## Project Structure

```
backend/                  # FastAPI backend
  app/
    routers/              # API route handlers
    services/             # Business logic
    models/               # Pydantic models
    config.py             # Settings
    main.py               # App entrypoint
  knowledge_base/         # Transcripts & vector store data
  tests/

next-frontend/            # Next.js 15 frontend
  app/                    # App Router pages & API routes
  components/             # UI components (shadcn/ui)
  lib/                    # Supabase client, API helpers, types
  supabase/migrations/    # Database migrations

specs/                    # Feature specifications
```

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Yarn](https://yarnpkg.com/)
- Supabase project
- OpenAI API key

### Backend Setup

```bash
cd backend
cp .env.example .env   # then fill in your values
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

**Required environment variables:**

```bash
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://...
SUPABASE_SERVICE_KEY=...
FE_HOST=http://localhost:3000
```

**Optional (with defaults):**

```bash
DEEPLAKE_PATH=./knowledge_base                  # local dev; use hub://<org> for cloud
ACTIVELOOP_TOKEN=                               # required for DeepLake Cloud
EMBEDDING_MODEL=text-embedding-3-small
CHAT_MODEL=gpt-4o
RAG_RETRIEVAL_K=5
RAG_SCORE_THRESHOLD=0.3
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
```

### Frontend Setup

```bash
cd next-frontend
cp .env.local.example .env.local   # then fill in your values
yarn install
yarn dev
```

**Required environment variables:**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### Database Setup

Run Supabase migrations in order:

```bash
cd next-frontend
npx supabase db push
```

## Development

```bash
# Backend
cd backend && uv run uvicorn app.main:app --reload --port 8000
cd backend && uv run pytest
cd backend && uv run ruff check .

# Frontend
cd next-frontend && yarn dev
cd next-frontend && yarn build
cd next-frontend && yarn lint
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/v1/api/knowledge/add` | Add YouTube videos |
| `GET` | `/v1/api/knowledge/jobs/{job_id}` | Job status |
| `DELETE` | `/v1/api/knowledge/channels/{channel_id}` | Delete channel |
| `POST` | `/v1/api/chat` | RAG chat (SSE streaming) |
| `POST` | `/v1/api/articles` | Scrape article |
| `POST` | `/v1/api/articles/{id}/summarize` | AI article summary |
| `POST` | `/v1/api/articles/{id}/chat` | Article Q&A |
| `POST` | `/v1/api/docs/scrape` | Scrape documentation site |
| `GET` | `/v1/api/docs/collections` | List doc collections |
| `DELETE` | `/v1/api/docs/collections/{id}` | Delete doc collection |
| `POST` | `/v1/api/api-keys` | Create API key |
| `GET` | `/v1/api/api-keys` | List API keys |
| `POST` | `/v1/api/public/query` | Public RAG API |
| `POST` | `/v1/api/deep-memory/generate` | Generate training data |
| `POST` | `/v1/api/deep-memory/train` | Train Deep Memory |

## Known Limitations

- None currently tracked.

## Deployment

**Backend** — Docker-ready:

```bash
docker build -t alphabase-backend ./backend
docker run -p 8000:8000 --env-file backend/.env alphabase-backend
```

**Frontend** — deploy to Vercel or any Next.js-compatible host.

**Infrastructure:**
- Supabase for auth, database, and file storage
- DeepLake Cloud (`hub://org/dataset`) for production vector store with Deep Memory


# AlphaBase RAG API - Usage Examples

Complete examples for consuming the AlphaBase Public RAG API.

## Prerequisites

1. **Get your API key** from the AlphaBase dashboard at `/dashboard/api-keys`
2. **API Base URL**: `https://your-domain.com` (replace with your actual domain)
3. **Endpoint**: `POST /v1/api/public/query`

---

## cURL Examples

### Basic Query

```bash
curl -X POST https://your-domain.com/v1/api/public/query \
  -H "Authorization: Bearer zt_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are the best risk management strategies for day trading?",
    "include_sources": true
  }'
```

### Query with Conversation History

```bash
curl -X POST https://your-domain.com/v1/api/public/query \
  -H "Authorization: Bearer zt_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What about stop loss strategies?",
    "history": [
      {
        "role": "user",
        "content": "Tell me about day trading"
      },
      {
        "role": "assistant",
        "content": "Day trading involves buying and selling securities within the same trading day..."
      }
    ],
    "include_sources": true
  }'
```

### Query Without Sources

```bash
curl -X POST https://your-domain.com/v1/api/public/query \
  -H "Authorization: Bearer zt_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is dollar cost averaging?",
    "include_sources": false
  }'
```

---

## Python Examples

### Using `requests` Library

```python
import requests
import json

# Configuration
API_BASE_URL = "https://your-domain.com"
API_KEY = "zt_your_api_key_here"

def query_ziptrader(question: str, history: list = None, include_sources: bool = True):
    """
    Query the AlphaBase RAG API.

    Args:
        question: The question to ask
        history: Optional conversation history
        include_sources: Whether to include source citations

    Returns:
        dict with 'answer' and 'sources' fields
    """
    url = f"{API_BASE_URL}/v1/api/public/query"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "question": question,
        "include_sources": include_sources
    }

    if history:
        payload["history"] = history

    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()  # Raise exception for 4xx/5xx status codes
        return response.json()
    except requests.exceptions.HTTPError as e:
        if response.status_code == 401:
            raise Exception("Invalid API key. Check your credentials.")
        elif response.status_code == 429:
            raise Exception("Rate limit exceeded. Please wait before retrying.")
        elif response.status_code == 400:
            raise Exception(f"Bad request: {response.json().get('detail', 'Unknown error')}")
        else:
            raise Exception(f"API error: {e}")
    except requests.exceptions.RequestException as e:
        raise Exception(f"Request failed: {e}")


# Example 1: Simple query
if __name__ == "__main__":
    result = query_ziptrader(
        question="What are the key principles of swing trading?",
        include_sources=True
    )

    print("Answer:", result["answer"])
    print("\nSources:")
    for source in result["sources"]:
        print(f"  - {source}")


# Example 2: Multi-turn conversation
def chat_with_context():
    history = []

    # First question
    result1 = query_ziptrader(
        question="What is technical analysis?",
        history=history
    )

    print("Q1:", "What is technical analysis?")
    print("A1:", result1["answer"])

    # Add to history
    history.extend([
        {"role": "user", "content": "What is technical analysis?"},
        {"role": "assistant", "content": result1["answer"]}
    ])

    # Follow-up question
    result2 = query_ziptrader(
        question="How does it differ from fundamental analysis?",
        history=history
    )

    print("\nQ2:", "How does it differ from fundamental analysis?")
    print("A2:", result2["answer"])


# Example 3: Error handling with retries
import time

def query_with_retry(question: str, max_retries: int = 3):
    """Query with automatic retry on rate limit."""
    for attempt in range(max_retries):
        try:
            return query_ziptrader(question)
        except Exception as e:
            if "Rate limit" in str(e):
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # Exponential backoff
                    print(f"Rate limited. Waiting {wait_time}s before retry...")
                    time.sleep(wait_time)
                else:
                    raise
            else:
                raise
```

---

## JavaScript/TypeScript Examples

### Using `fetch` API (Browser or Node.js 18+)

```typescript
// TypeScript interfaces
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface QueryRequest {
  question: string;
  history?: ChatMessage[];
  include_sources?: boolean;
}

interface QueryResponse {
  answer: string;
  sources: string[];
}

// Configuration
const API_BASE_URL = 'https://your-domain.com';
const API_KEY = 'zt_your_api_key_here';

/**
 * Query the AlphaBase RAG API
 */
async function queryZipTrader(
  question: string,
  history?: ChatMessage[],
  includeSources: boolean = true
): Promise<QueryResponse> {
  const url = `${API_BASE_URL}/v1/api/public/query`;

  const payload: QueryRequest = {
    question,
    include_sources: includeSources
  };

  if (history && history.length > 0) {
    payload.history = history;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));

      switch (response.status) {
        case 401:
          throw new Error('Invalid API key. Check your credentials.');
        case 429:
          throw new Error('Rate limit exceeded. Please wait before retrying.');
        case 400:
          throw new Error(`Bad request: ${error.detail}`);
        default:
          throw new Error(`API error: ${response.status} - ${error.detail}`);
      }
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Request failed');
  }
}

// Example 1: Simple query
async function simpleExample() {
  try {
    const result = await queryZipTrader(
      "What are the best strategies for managing portfolio risk?"
    );

    console.log('Answer:', result.answer);
    console.log('\nSources:');
    result.sources.forEach(source => console.log(`  - ${source}`));
  } catch (error) {
    console.error('Error:', error);
  }
}

// Example 2: Multi-turn conversation
async function conversationExample() {
  const history: ChatMessage[] = [];

  try {
    // First question
    const result1 = await queryZipTrader(
      "What is options trading?",
      history
    );

    console.log('Q1: What is options trading?');
    console.log('A1:', result1.answer);

    // Add to history
    history.push(
      { role: 'user', content: 'What is options trading?' },
      { role: 'assistant', content: result1.answer }
    );

    // Follow-up question
    const result2 = await queryZipTrader(
      "What are the main risks involved?",
      history
    );

    console.log('\nQ2: What are the main risks involved?');
    console.log('A2:', result2.answer);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Example 3: With retry logic
async function queryWithRetry(
  question: string,
  maxRetries: number = 3
): Promise<QueryResponse> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await queryZipTrader(question);
    } catch (error) {
      const isRateLimit = error instanceof Error &&
                         error.message.includes('Rate limit');

      if (isRateLimit && attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Rate limited. Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        throw error;
      }
    }
  }

  throw new Error('Max retries exceeded');
}

// Run examples
simpleExample();
conversationExample();
```

---

## Node.js with Axios

```javascript
const axios = require('axios');

const API_BASE_URL = 'https://your-domain.com';
const API_KEY = 'zt_your_api_key_here';

async function queryZipTrader(question, history = [], includeSources = true) {
  const url = `${API_BASE_URL}/v1/api/public/query`;

  const payload = {
    question,
    include_sources: includeSources
  };

  if (history.length > 0) {
    payload.history = history;
  }

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const detail = error.response.data?.detail || 'Unknown error';

      switch (status) {
        case 401:
          throw new Error('Invalid API key. Check your credentials.');
        case 429:
          throw new Error('Rate limit exceeded. Please wait before retrying.');
        case 400:
          throw new Error(`Bad request: ${detail}`);
        default:
          throw new Error(`API error: ${status} - ${detail}`);
      }
    } else if (error.request) {
      // Request made but no response
      throw new Error('No response from server');
    } else {
      // Something else happened
      throw new Error(`Request failed: ${error.message}`);
    }
  }
}

// Example usage
async function main() {
  try {
    const result = await queryZipTrader(
      "What is dividend investing and how does it work?"
    );

    console.log('Answer:', result.answer);
    console.log('\nSources:');
    result.sources.forEach(source => console.log(`  - ${source}`));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
```

---

## Response Examples

### Success Response (200 OK)

```json
{
  "answer": "Based on the AlphaBase knowledge base, risk management in day trading involves several key strategies:\n\n1. **Position Sizing**: Never risk more than 1-2% of your total capital on a single trade. This ensures that even a series of losses won't significantly impact your portfolio.\n\n2. **Stop Loss Orders**: Always set stop losses before entering a trade. Place them at technical levels, not arbitrary percentages.\n\n3. **Risk-Reward Ratio**: Aim for at least a 2:1 or 3:1 reward-to-risk ratio. This means if you're risking $100, you should be targeting at least $200-300 in profit.\n\n4. **Diversification**: Don't put all your capital in one sector or type of trade. Spread risk across different positions.\n\n5. **Trading Plan**: Have a clear plan before entering any trade, including entry point, exit point, and stop loss level.",
  "sources": [
    "Video: Risk Management Fundamentals (Chunk 12)",
    "Video: Day Trading Strategy Masterclass (Chunk 8)",
    "Video: Position Sizing Explained (Chunk 5)"
  ]
}
```

### Error Response (401 Unauthorized)

```json
{
  "detail": "Invalid API key"
}
```

### Error Response (429 Rate Limit)

```json
{
  "detail": "Rate limit exceeded. Try again later."
}
```

### Error Response (400 Bad Request)

```json
{
  "detail": "Question exceeds maximum length of 2000 characters"
}
```

---

## Best Practices

1. **Always store API keys securely** - Use environment variables, never hardcode
2. **Implement retry logic** for rate limits with exponential backoff
3. **Pass conversation history** for context-aware multi-turn conversations
4. **Handle errors gracefully** - Check for 401, 429, 400, 500 status codes
5. **Respect rate limits** - 60 requests per minute per API key
6. **Cite sources** - Always display the `sources` array to give credit
7. **Validate input** - Question length must be 1-2000 characters

---

## Environment Variable Setup

### Python (.env file)

```bash
ALPHABASE_API_URL=https://your-domain.com
ALPHABASE_API_KEY=zt_your_api_key_here
```

```python
from dotenv import load_dotenv
import os

load_dotenv()

API_BASE_URL = os.getenv('ALPHABASE_API_URL')
API_KEY = os.getenv('ALPHABASE_API_KEY')
```

### Node.js (.env file)

```bash
ALPHABASE_API_URL=https://your-domain.com
ALPHABASE_API_KEY=zt_your_api_key_here
```

```javascript
require('dotenv').config();

const API_BASE_URL = process.env.ALPHABASE_API_URL;
const API_KEY = process.env.ALPHABASE_API_KEY;
```

---

## Testing Your Integration

```bash
# Test 1: Simple query
curl -X POST https://your-domain.com/v1/api/public/query \
  -H "Authorization: Bearer ${ALPHABASE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"question": "What is stock trading?", "include_sources": true}'

# Test 2: Rate limit (run this script 61 times in <1 minute to test 429)
for i in {1..61}; do
  echo "Request $i"
  curl -X POST https://your-domain.com/v1/api/public/query \
    -H "Authorization: Bearer ${ALPHABASE_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"question": "Test", "include_sources": false}'
done

# Test 3: Invalid key (should return 401)
curl -X POST https://your-domain.com/v1/api/public/query \
  -H "Authorization: Bearer zt_invalid_key" \
  -H "Content-Type: application/json" \
  -d '{"question": "Test"}'
```

