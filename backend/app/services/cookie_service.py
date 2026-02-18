import logging
from urllib.parse import urlparse

from supabase import Client

logger = logging.getLogger(__name__)


def _extract_domain(url: str) -> str:
    """Extract hostname from a URL."""
    parsed = urlparse(url)
    return parsed.hostname or ""


def _normalize_domain(domain: str) -> str:
    """Normalize a domain: lowercase and strip www. prefix."""
    domain = domain.lower().strip()
    if domain.startswith("www."):
        domain = domain[4:]
    return domain


def _get_parent_domains(domain: str) -> list[str]:
    """Generate parent domain fallbacks by stripping leftmost subdomain.

    Stops when only 2 parts remain (TLD+1), e.g. 'youtube.com'.
    Example: 'music.youtube.com' -> ['youtube.com']
    """
    parts = domain.split(".")
    parents = []
    while len(parts) > 2:
        parts = parts[1:]
        parents.append(".".join(parts))
    return parents


async def get_cookies_for_domain(
    user_id: str,
    target_url: str,
    supabase: Client,
) -> str | None:
    """Fetch user's cookies for the domain of target_url from Supabase Storage.

    Returns the cookie file content as a JSON string (CookieEntry[]),
    or None if no cookies found or on any error.
    """
    try:
        domain = _normalize_domain(_extract_domain(target_url))
        if not domain:
            logger.warning("Could not extract domain from URL: %s", target_url)
            return None

        domains_to_try = [domain] + _get_parent_domains(domain)

        for d in domains_to_try:
            result = (
                supabase.table("user_cookies")
                .select("file_path")
                .eq("user_id", user_id)
                .eq("domain", d)
                .execute()
            )
            if result.data:
                file_path = result.data[0]["file_path"]
                file_bytes = supabase.storage.from_("cookie-files").download(file_path)
                cookie_content = file_bytes.decode("utf-8")
                logger.info(
                    "Found cookies for domain %s for user %s", d, user_id
                )
                return cookie_content

        logger.debug("No cookies found for domain %s for user %s", domain, user_id)
        return None

    except Exception as e:
        logger.warning(
            "Failed to download/parse cookies for URL %s: %s", target_url, e
        )
        return None
