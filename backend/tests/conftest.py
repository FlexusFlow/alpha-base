import time
from unittest.mock import MagicMock, patch

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from fastapi.testclient import TestClient

from app.dependencies import get_current_user, get_settings
from app.main import app

TEST_USER_ID = "test-user-00000000-0000-0000-0000-000000000001"

# Generate a test ES256 key pair
_test_private_key = ec.generate_private_key(ec.SECP256R1())
_test_public_key = _test_private_key.public_key()

TEST_PRIVATE_KEY_PEM = _test_private_key.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
)
TEST_PUBLIC_KEY_PEM = _test_public_key.public_bytes(
    serialization.Encoding.PEM,
    serialization.PublicFormat.SubjectPublicKeyInfo,
)


def make_token(
    user_id: str = TEST_USER_ID,
    *,
    audience: str = "authenticated",
    expires_in: int = 3600,
    extra_claims: dict | None = None,
    use_wrong_key: bool = False,
) -> str:
    """Generate a Supabase-style ES256 JWT for testing."""
    payload = {
        "sub": user_id,
        "aud": audience,
        "exp": int(time.time()) + expires_in,
        "iat": int(time.time()),
    }
    if extra_claims:
        payload.update(extra_claims)

    if use_wrong_key:
        wrong_key = ec.generate_private_key(ec.SECP256R1())
        key = wrong_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    else:
        key = TEST_PRIVATE_KEY_PEM

    return jwt.encode(payload, key, algorithm="ES256")


def make_expired_token(user_id: str = TEST_USER_ID) -> str:
    """Generate an expired JWT for testing."""
    return make_token(user_id, expires_in=-3600)


def _mock_jwks_signing_key():
    """Create a mock signing key that returns the test public key."""
    mock_key = MagicMock()
    mock_key.key = TEST_PUBLIC_KEY_PEM
    return mock_key


class _FakeSettings:
    """Minimal settings stub for tests."""
    supabase_url = "http://localhost:54321"


@pytest.fixture
def client():
    """FastAPI test client with mocked JWKS client."""
    app.dependency_overrides[get_settings] = lambda: _FakeSettings()

    mock_jwks = MagicMock()
    mock_jwks.get_signing_key_from_jwt.return_value = _mock_jwks_signing_key()

    with patch("app.dependencies._get_jwks_client", return_value=mock_jwks):
        yield TestClient(app)

    app.dependency_overrides.clear()


@pytest.fixture
def auth_client():
    """FastAPI test client with a pre-authenticated user (dependency override)."""

    async def _override_user():
        return TEST_USER_ID

    app.dependency_overrides[get_current_user] = _override_user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def valid_token() -> str:
    return make_token()


@pytest.fixture
def expired_token() -> str:
    return make_expired_token()
