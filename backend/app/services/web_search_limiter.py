from app.services.rate_limiter import RateLimiter


class WebSearchLimiter(RateLimiter):
    """Per-user rate limiter for web search API calls.

    Reuses the sliding-window RateLimiter. Resets on server restart.
    """

    pass
