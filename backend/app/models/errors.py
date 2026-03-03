class AuthenticationError(Exception):
    """Raised when a scraping or transcription operation fails due to an authentication error.

    Attributes:
        message: Human-readable error description.
        domain: The domain that rejected the request.
        error_type: Category of auth failure (http_403, cloudflare_challenge, login_required).
    """

    def __init__(self, message: str, domain: str, error_type: str):
        super().__init__(message)
        self.domain = domain
        self.error_type = error_type
