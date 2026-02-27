# Quickstart: ALP-009 Anti-Bot Browser Fingerprint

## What's changing

Single file modification to `backend/app/services/article_scraper.py`:
1. Set a realistic Chrome user-agent on the Playwright browser context
2. Add a 2-second post-load delay for JS rendering

## How to test

```bash
# Start the backend
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Test with a Medium article (previously failed with Cloudflare block)
curl -X POST http://localhost:8000/v1/api/articles/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://medium.com/@example/some-article"}'

# Verify the response contains actual article content, not a Cloudflare challenge page
```

## Verification checklist

- [ ] Medium article URL returns article content (not Cloudflare challenge)
- [ ] Non-protected site article URL still works correctly
- [ ] Scrape time is acceptable (within ~3s of previous baseline)
