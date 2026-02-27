import json
import logging
import re
from urllib.parse import urljoin, urlparse

from openai import AsyncOpenAI
from playwright.async_api import async_playwright, Page

from app.config import settings

logger = logging.getLogger(__name__)

MAX_PAGES = 100

# File extensions to skip
SKIP_EXTENSIONS = {
    ".pdf", ".zip", ".tar", ".gz", ".png", ".jpg", ".jpeg", ".gif",
    ".svg", ".ico", ".mp4", ".mp3", ".avi", ".mov", ".exe", ".dmg",
    ".css", ".js", ".woff", ".woff2", ".ttf", ".eot",
}

_LLM_PROMPT = """I'm going to paste the HTML (or text) of a documentation/help page.

Please extract all internal links that point to actual documentation content
(articles, guides, API references, tutorials, section indexes, etc.).

Rules:
- INCLUDE links to: help articles, guides, API docs, tutorials,
  integration pages, and section/category indexes
- EXCLUDE links to: navigation menus, login/signup, pricing, blog,
  marketing pages, social media, legal pages (privacy, terms),
  contact pages, and any external third-party URLs unrelated to the docs
- DEDUPLICATE links (show each URL only once)
- GROUP links by their logical category or section as they appear on the page
- FORMAT each entry as: URL — short description (if available)

Here is the page content:
"""



def _normalize_url(href: str, base_url: str) -> str:
    """Normalize a URL: resolve relative, strip fragment and trailing slash."""
    full_url = urljoin(base_url, href)
    parsed = urlparse(full_url)
    normalized = parsed._replace(fragment="").geturl()
    if normalized.endswith("/") and parsed.path != "/":
        normalized = normalized.rstrip("/")
    return normalized


def _has_skip_extension(url: str) -> bool:
    """Check if URL points to a file with a skippable extension."""
    path = urlparse(url).path.lower()
    return any(path.endswith(ext) for ext in SKIP_EXTENSIONS)


def _parse_urls_from_llm_response(
    response_text: str, base_url: str, base_domain: str
) -> list[dict]:
    """Parse URLs from LLM free-text response.

    Handles formats like:
    - https://example.com/docs/page — Description
    - [Page Title](https://example.com/docs/page)
    - plain URLs on their own lines
    """
    url_pattern = re.compile(r'https?://[^\s)>"\']+')
    # Also match markdown links: [text](url)
    md_link_pattern = re.compile(r'\[([^\]]*)\]\((https?://[^\s)]+)\)')

    seen: set[str] = set()
    pages: list[dict] = []

    for line in response_text.splitlines():
        line = line.strip()
        if not line:
            continue

        # Try markdown link first
        md_match = md_link_pattern.search(line)
        if md_match:
            title = md_match.group(1).strip()
            raw_url = md_match.group(2).strip()
        else:
            # Try plain URL
            url_match = url_pattern.search(line)
            if not url_match:
                continue
            raw_url = url_match.group(0).strip().rstrip(".,;:")
            # Extract description after " — " or " - "
            title = ""
            for sep in [" — ", " - ", " – "]:
                if sep in line:
                    title = line.split(sep, 1)[1].strip()
                    break

        normalized = _normalize_url(raw_url, base_url)

        # Must be same domain
        parsed = urlparse(normalized)
        if parsed.hostname and parsed.hostname != base_domain:
            continue

        # Skip file extensions
        if _has_skip_extension(normalized):
            continue

        if normalized in seen:
            continue

        seen.add(normalized)
        pages.append({"url": normalized, "title": title or ""})

    return pages


async def _get_clean_page_html(page: Page) -> str:
    """Extract page HTML with nav/header/footer/script/style tags removed.

    This reduces noise and token usage for the LLM call.
    """
    return await page.evaluate("""() => {
        const clone = document.documentElement.cloneNode(true);
        const selectors = ['head', 'nav', 'header', 'footer', 'script',
                           'style', 'noscript', 'iframe', 'svg',
                           '[role="navigation"]', '[role="banner"]',
                           '[role="contentinfo"]'];
        for (const sel of selectors) {
            clone.querySelectorAll(sel).forEach(el => el.remove());
        }
        return clone.innerHTML;
    }""")


async def _filter_links_with_llm(
    page_html: str, base_url: str
) -> list[dict] | None:
    """Send page HTML to LLM to extract documentation-relevant links.

    Returns list of {url, title} dicts, or None if LLM call fails.
    """
    base_domain = urlparse(base_url).hostname

    try:
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.chat.completions.create(
            model=settings.doc_link_filter_model,
            messages=[
                {"role": "user", "content": _LLM_PROMPT + page_html}
            ],
            temperature=0,
        )
        content = response.choices[0].message.content or ""

        print ("content")
        print (content)

        logger.info(
            "LLM link filter response (%d chars):\n%s",
            len(content), content,
        )

        if not content.strip():
            logger.warning("LLM returned empty response for link filtering")
            return None

        pages = _parse_urls_from_llm_response(content, base_url, base_domain)
        logger.info(
            "Parsed %d documentation URLs from LLM response", len(pages)
        )

        if not pages:
            logger.warning("LLM response contained no parseable URLs")
            return None

        return pages

    except Exception as e:
        logger.warning("LLM link filtering failed: %s", e)
        return None


def _extract_same_domain_links_fallback(
    links: list[dict], base_url: str, base_domain: str
) -> list[dict]:
    """Fallback: return all same-domain links filtered by extension only."""
    seen: set[str] = set()
    pages: list[dict] = []

    for link in links:
        href = link.get("href", "")
        if not href:
            continue

        normalized = _normalize_url(href, base_url)
        parsed = urlparse(normalized)

        if parsed.hostname and parsed.hostname != base_domain:
            continue
        if _has_skip_extension(normalized):
            continue
        if not parsed.path or parsed.path == "#":
            continue
        if normalized in seen:
            continue

        seen.add(normalized)
        pages.append({"url": normalized, "title": link.get("text", "")})

    return pages


async def discover_pages(
    url: str, cookies_json: str | None = None
) -> dict:
    """Discover documentation pages using LLM-based link extraction.

    Loads the entry page, sends its HTML to an LLM to identify documentation
    links. No BFS crawling — the entry page is treated as a table of contents.

    Args:
        url: Entry URL for the documentation site.
        cookies_json: Optional JSON string of cookies (CookieEntry[] format).

    Returns:
        dict with keys: entry_url, scope_path, site_name, pages, total_count,
                        truncated, original_count, has_cookies
    """
    parsed = urlparse(url)
    base_domain = parsed.hostname
    # scope_path kept for DB compatibility (NOT NULL column)
    scope_path = parsed.path
    if not scope_path.endswith("/"):
        scope_path += "/"

    browser = None
    try:
        pw = await async_playwright().start()
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context()

        has_cookies = False
        if cookies_json:
            try:
                cookies = json.loads(cookies_json)
                if cookies:
                    await context.add_cookies(cookies)
                    has_cookies = True
            except (json.JSONDecodeError, Exception) as e:
                logger.warning("Failed to parse/inject cookies: %s", e)

        page = await context.new_page()
        await page.goto(url, timeout=15_000, wait_until="domcontentloaded")

        title = await page.title() or ""
        title = title.strip()
        site_name = title or urlparse(url).hostname or "Documentation"

        # Get cleaned page HTML (nav/header/footer removed) for LLM
        page_html = await _get_clean_page_html(page)

        # Try LLM-based extraction first
        pages = await _filter_links_with_llm(page_html, url)

        # Fallback: extract all same-domain links if LLM fails
        if pages is None:
            logger.info("Falling back to same-domain link extraction for %s", url)
            links = await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('a[href]'))
                    .map(a => ({ href: a.href, text: a.textContent?.trim() || '' }))
            }""")
            pages = _extract_same_domain_links_fallback(
                links, url, base_domain
            )

        await page.close()
        await context.close()

        total_found = len(pages)
        truncated = total_found > MAX_PAGES
        original_count = total_found if truncated else None

        return {
            "entry_url": url,
            "scope_path": scope_path,
            "site_name": site_name or "Documentation",
            "pages": pages[:MAX_PAGES],
            "total_count": min(total_found, MAX_PAGES),
            "truncated": truncated,
            "original_count": original_count,
            "has_cookies": has_cookies,
        }

    finally:
        if browser:
            await browser.close()
