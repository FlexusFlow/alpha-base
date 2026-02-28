import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_current_user, get_settings
from app.main import app

TEST_JWT_SECRET = "test-jwt-secret-for-unit-tests"
TEST_USER_ID = "test-user-00000000-0000-0000-0000-000000000001"


def make_token(
    user_id: str = TEST_USER_ID,
    *,
    secret: str = TEST_JWT_SECRET,
    algorithm: str = "HS256",
    audience: str = "authenticated",
    expires_in: int = 3600,
    extra_claims: dict | None = None,
) -> str:
    """Generate a Supabase-style JWT for testing."""
    payload = {
        "sub": user_id,
        "aud": audience,
        "exp": int(time.time()) + expires_in,
        "iat": int(time.time()),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, secret, algorithm=algorithm)


def make_expired_token(user_id: str = TEST_USER_ID) -> str:
    """Generate an expired JWT for testing."""
    return make_token(user_id, expires_in=-3600)


class _FakeSettings:
    """Minimal settings stub that provides only the JWT secret."""

    supabase_jwt_secret = TEST_JWT_SECRET


@pytest.fixture
def client():
    """FastAPI test client with overridden settings (JWT secret)."""

    def _override_settings():
        return _FakeSettings()

    app.dependency_overrides[get_settings] = _override_settings
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
