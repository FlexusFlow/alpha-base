from collections import defaultdict
from datetime import datetime, timedelta, timezone


class RateLimiter:
    """Simple in-memory sliding-window rate limiter.

    For production, replace with Redis-based implementation.
    """

    def __init__(self, max_requests: int = 60, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window = timedelta(seconds=window_seconds)
        self._timestamps: dict[str, list[datetime]] = defaultdict(list)

    def is_allowed(self, key_id: str) -> bool:
        """Return True if the request is within rate limits."""
        now = datetime.now(timezone.utc)
        cutoff = now - self.window

        # Prune expired timestamps
        self._timestamps[key_id] = [
            ts for ts in self._timestamps[key_id] if ts > cutoff
        ]

        if len(self._timestamps[key_id]) >= self.max_requests:
            return False

        self._timestamps[key_id].append(now)
        return True
