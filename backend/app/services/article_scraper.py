import asyncio
import json
import logging

from markdownify import markdownify
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

MAX_CONTENT_BYTES = 200 * 1024  # 200KB

CONTENT_SELECTORS = [
    "article",
    '[role="article"]',
    ".article-content",
    ".post-content",
    ".entry-content",
    ".content-body",
    "main",
    ".main-content",
    "body",
]

NOISE_SELECTORS = [
    "script",
    "style",
    "nav",
    "footer",
    "aside",
    "header",
    "[class*='ad']",
    "[class*='comment']",
    "[class*='sidebar']",
    "[class*='cookie']",
    "[class*='popup']",
    "[class*='modal']",
    "[class*='newsletter']",
    "[class*='share']",
    "[class*='social']",
]

CHROME_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


async def scrape_article(
    url: str, cookies_json: str | None = None
) -> dict:
    """Scrape an article URL and return extracted content as Markdown.

    Args:
        url: The article URL to scrape.
        cookies_json: Optional JSON string of cookies to inject (CookieEntry[] format).

    Returns:
        dict with keys: title, content_markdown, is_truncated

    Raises:
        Exception with descriptive message on failure.
    """
    browser = None
    try:
        pw = await async_playwright().start()
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(user_agent=CHROME_USER_AGENT)

        if cookies_json:
            try:
                cookies = json.loads(cookies_json)
                if cookies:
                    await context.add_cookies(cookies)
            except (json.JSONDecodeError, Exception) as e:
                logger.warning("Failed to parse/inject cookies: %s", e)

        page = await context.new_page()
        await page.goto(url, timeout=30_000, wait_until="domcontentloaded")
        await asyncio.sleep(2)  # Allow JS-rendered content to appear

        # Strip noise elements
        for selector in NOISE_SELECTORS:
            try:
                await page.evaluate(
                    f"""() => {{
                        document.querySelectorAll('{selector}').forEach(el => el.remove());
                    }}"""
                )
            except Exception:
                pass

        # Extract title: og:title > h1 > title
        title = await _extract_title(page)

        # Find content element using selector priority
        content_html = None
        for selector in CONTENT_SELECTORS:
            element = await page.query_selector(selector)
            if element:
                content_html = await element.inner_html()
                if content_html and content_html.strip():
                    break
                content_html = None

        if not content_html or not content_html.strip():
            raise Exception("Could not extract article content from the page")

        # Convert HTML to Markdown
        content_markdown = markdownify(
            content_html, heading_style="ATX", strip=["img"]
        )
        content_markdown = content_markdown.strip()

        if not content_markdown:
            raise Exception("Article content is empty after conversion")

        # Enforce 200KB limit
        is_truncated = False
        content_bytes = content_markdown.encode("utf-8")
        if len(content_bytes) > MAX_CONTENT_BYTES:
            truncated = content_bytes[:MAX_CONTENT_BYTES].decode("utf-8", errors="ignore")
            last_break = truncated.rfind("\n\n")
            if last_break > 0:
                content_markdown = truncated[:last_break]
            else:
                content_markdown = truncated
            is_truncated = True

        await context.close()

        return {
            "title": title,
            "content_markdown": content_markdown,
            "is_truncated": is_truncated,
        }

    except Exception:
        raise
    finally:
        if browser:
            await browser.close()


async def _extract_title(page) -> str | None:
    """Extract title from page using priority: og:title > h1 > title tag."""
    # Try og:title
    try:
        og_title = await page.evaluate(
            """() => {
                const meta = document.querySelector('meta[property="og:title"]');
                return meta ? meta.getAttribute('content') : null;
            }"""
        )
        if og_title and og_title.strip():
            return og_title.strip()
    except Exception:
        pass

    # Try h1
    try:
        h1 = await page.query_selector("h1")
        if h1:
            text = await h1.inner_text()
            if text and text.strip():
                return text.strip()
    except Exception:
        pass

    # Try title tag
    try:
        title = await page.title()
        if title and title.strip():
            return title.strip()
    except Exception:
        pass

    return None
