"""Utilities for detecting authentication-related failures in scraping responses."""

import re

# yt-dlp error message patterns that indicate auth/login failures
_YTDLP_AUTH_PATTERNS = [
    re.compile(r"Sign in to confirm", re.IGNORECASE),
    re.compile(r"HTTP Error 403", re.IGNORECASE),
    re.compile(r"login required", re.IGNORECASE),
    re.compile(r"confirm your age", re.IGNORECASE),
    re.compile(r"only available to.*members", re.IGNORECASE),
    re.compile(r"requires payment", re.IGNORECASE),
    re.compile(r"you.re not a bot", re.IGNORECASE),
]

# Cloudflare challenge page fingerprints
_CF_PATTERNS = [
    re.compile(r"<title>\s*Just a moment", re.IGNORECASE),
    re.compile(r"<title>\s*Attention Required", re.IGNORECASE),
    re.compile(r'id=["\']?challenge-running', re.IGNORECASE),
    re.compile(r'id=["\']?cf-challenge-running', re.IGNORECASE),
    re.compile(r"/cdn-cgi/challenge-platform/", re.IGNORECASE),
]


def is_cloudflare_challenge(html: str) -> bool:
    """Check if HTML content is a Cloudflare challenge page.

    Returns True if 2+ Cloudflare fingerprints are found (high confidence).
    """
    matches = sum(1 for p in _CF_PATTERNS if p.search(html))
    return matches >= 2


def is_auth_error(error: Exception) -> bool:
    """Check if an exception indicates an authentication/authorization failure.

    Works with yt-dlp DownloadError, generic exceptions with auth-related messages,
    and any exception whose string representation matches known auth patterns.
    """
    msg = str(error)
    return any(p.search(msg) for p in _YTDLP_AUTH_PATTERNS)


# Soft-paywall detection: sites that return 200 but serve truncated content
# when cookies are missing/expired. Checked via Playwright page.evaluate().
#
# Detection layers:
#   1. CSS class selectors (site-specific + paywall service providers)
#   2. Data attributes and element IDs
#   3. Text signals in page content (EN, DE, FR)
#   4. Meta tags and JSON-LD structured data
#   5. External paywall service scripts (Piano.io, Pelcro, etc.)
#   6. Content truncation heuristics (read-time vs actual length, gradient overlays)
PAYWALL_DETECT_JS = """() => {
    const text = document.body ? document.body.innerText : "";
    const html = document.documentElement ? document.documentElement.innerHTML : "";

    // --- Layer 1: CSS class selectors ---
    const classSelectors = [
        '[class*="metered"]',
        '[class*="paywall"]', '[class*="Paywall"]',
        '[class*="gate"]',
        '[class*="locked"]', '[class*="Locked"]',
        '[class*="premium"]', '[class*="Premium"]',
        '[class*="subscriber"]',
        '[class*="regwall"]',
        '[class*="leaky"]',
        '[class*="restrict"]',
        '[class*="truncat"]',
        '[class*="content-overlay"]',
        '[class*="piano"]',
    ];
    const matchedClass = classSelectors.find(s => !!document.querySelector(s));

    // --- Layer 2: Data attributes and IDs ---
    const attrSelectors = [
        '[id*="paywall"]',
        '[id*="regwall"]',
        '[id*="piano"]',
        '[data-testid="paywall"]',
        '[data-paywall]',
        '[data-piano-id]',
        '[data-content-tier="locked"]',
        '[data-content-tier="metered"]',
    ];
    const matchedAttr = attrSelectors.find(s => !!document.querySelector(s));

    // --- Layer 3: Text signals (EN, DE, FR) ---
    const textSignals = [
        "Member-only story",
        "members-only story",
        "Members only",
        "Subscribe to read",
        "Subscribe to continue reading",
        "Unlock this story",
        "Unlock this article",
        "Sign in to read",
        "Log in to read the full",
        "Create a free account to read",
        "This article is for subscribers only",
        "This content is available to registered users",
        "Premium content",
        "Premium article",
        "Get unlimited access",
        "Start your free trial",
        "Already a member? Sign in",
        "Continue reading with a subscription",
        "You've reached your limit of free articles",
        "You have 0 free articles remaining",
        "Exclusive content",
        "Paid content",
        "Read the rest of this story",
        "Dieser Artikel ist nur für Abonnenten",
        "Jetzt lesen mit",
        "Réservé aux abonnés",
        "Contenu exclusif",
    ];
    const lowerText = text.toLowerCase();
    const matchedText = textSignals.find(s => lowerText.includes(s.toLowerCase()));

    // --- Layer 4: Meta tags and JSON-LD ---
    let metaPaywall = false;
    const metaContentTier = document.querySelector(
        'meta[property="article:content_tier"], meta[name="article:content_tier"]'
    );
    if (metaContentTier) {
        const val = (metaContentTier.getAttribute("content") || "").toLowerCase();
        if (val === "metered" || val === "locked" || val === "premium") {
            metaPaywall = true;
        }
    }
    if (!metaPaywall) {
        const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const s of ldScripts) {
            try {
                const ld = JSON.parse(s.textContent);
                if (ld.isAccessibleForFree === false) { metaPaywall = true; break; }
                if (ld.isAccessibleForFree === "False") { metaPaywall = true; break; }
            } catch(e) {}
        }
    }

    // --- Layer 5: External paywall service scripts ---
    const paywallServices = [
        "tinypass.com",
        "cdn.piano.io",
        "js.pelcro.com",
        "cdn.cxense.com",
        "smartwall.io",
        "poool.fr",
        "pico.tools",
        "memberful.com",
    ];
    const scripts = Array.from(document.querySelectorAll("script[src]"));
    const matchedService = paywallServices.find(svc =>
        scripts.some(sc => (sc.getAttribute("src") || "").includes(svc))
    );

    // --- Layer 6: Content truncation heuristics ---
    let truncationDetected = false;
    const article = document.querySelector("article");
    if (article) {
        const articleText = article.innerText || "";
        const readTimeMatch = text.match(/(\\d+)\\s*min read/i);
        if (readTimeMatch) {
            const expectedMinRead = parseInt(readTimeMatch[1], 10);
            const wordsPerMin = 230;
            const expectedWords = expectedMinRead * wordsPerMin;
            const actualWords = articleText.split(/\\s+/).length;
            if (expectedWords > 0 && actualWords < expectedWords * 0.3) {
                truncationDetected = true;
            }
        }
    }
    const hasGradientOverlay = !!document.querySelector(
        '[class*="fade-out"], [class*="gradient-overlay"], [class*="content-fade"]'
    );
    const hasBlurOverlay = !!document.querySelector('[class*="blur"]');

    // --- Combine results ---
    // Require at least one strong signal to avoid false positives.
    // Strong: text signal, CSS class, data attr, meta tag
    // Weak (supporting): paywall service script, truncation, gradient/blur
    const strongSignals = [matchedText, matchedClass, matchedAttr, metaPaywall ? "meta" : null]
        .filter(Boolean);
    const weakSignals = [matchedService, truncationDetected ? "truncated" : null,
        hasGradientOverlay ? "gradient" : null, hasBlurOverlay ? "blur" : null]
        .filter(Boolean);

    if (strongSignals.length === 0 && weakSignals.length < 2) return null;

    const reason = matchedText
        || (matchedClass ? "paywall class: " + matchedClass : null)
        || (matchedAttr ? "paywall element: " + matchedAttr : null)
        || (metaPaywall ? "meta content_tier: locked/metered" : null)
        || (matchedService ? "paywall service: " + matchedService : null)
        || (truncationDetected ? "content truncated vs read-time" : null)
        || "paywall indicators detected";
    return reason;
}"""
