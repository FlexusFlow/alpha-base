"""Tests for the get_current_user authentication dependency."""

import time
from unittest.mock import MagicMock, patch

import jwt
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.dependencies import get_current_user, get_settings
from tests.conftest import (
    TEST_USER_ID,
    TEST_PRIVATE_KEY_PEM,
    TEST_PUBLIC_KEY_PEM,
    _mock_jwks_signing_key,
    make_token,
)

# ---------------------------------------------------------------------------
# Minimal test app that uses get_current_user
# ---------------------------------------------------------------------------

test_app = FastAPI()


class _FakeSettings:
    supabase_url = "http://localhost:54321"


test_app.dependency_overrides[get_settings] = lambda: _FakeSettings()


@test_app.get("/protected")
async def protected_route(user_id: str = Depends(get_current_user)):
    return {"user_id": user_id}


mock_jwks = MagicMock()
mock_jwks.get_signing_key_from_jwt.return_value = _mock_jwks_signing_key()


def _get_client():
    with patch("app.dependencies._get_jwks_client", return_value=mock_jwks):
        return TestClient(test_app)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_valid_token_returns_user_id():
    token = make_token()
    client = _get_client()
    with patch("app.dependencies._get_jwks_client", return_value=mock_jwks):
        resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["user_id"] == TEST_USER_ID


def test_missing_authorization_header():
    client = _get_client()
    with patch("app.dependencies._get_jwks_client", return_value=mock_jwks):
        resp = client.get("/protected")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Authorization header missing"


def test_malformed_header_no_bearer_prefix():
    token = make_token()
    client = _get_client()
    with patch("app.dependencies._get_jwks_client", return_value=mock_jwks):
        resp = client.get("/protected", headers={"Authorization": f"Token {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid authorization header format"


def test_expired_token():
    token = make_token(expires_in=-3600)
    client = _get_client()
    with patch("app.dependencies._get_jwks_client", return_value=mock_jwks):
        resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Authentication token has expired"


def test_invalid_token_garbage():
    client = _get_client()
    with patch("app.dependencies._get_jwks_client", return_value=mock_jwks):
        resp = client.get("/protected", headers={"Authorization": "Bearer not-a-jwt"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid authentication token"


def test_wrong_key():
    token = make_token(use_wrong_key=True)
    client = _get_client()
    with patch("app.dependencies._get_jwks_client", return_value=mock_jwks):
        resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid authentication token"


def test_wrong_audience():
    token = make_token(audience="anon")
    client = _get_client()
    with patch("app.dependencies._get_jwks_client", return_value=mock_jwks):
        resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid authentication token"


def test_missing_sub_claim():
    payload = {
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    token = jwt.encode(payload, TEST_PRIVATE_KEY_PEM, algorithm="ES256")
    client = _get_client()
    with patch("app.dependencies._get_jwks_client", return_value=mock_jwks):
        resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid authentication token"


def test_different_user_id():
    other_user = "other-user-00000000-0000-0000-0000-000000000002"
    token = make_token(other_user)
    client = _get_client()
    with patch("app.dependencies._get_jwks_client", return_value=mock_jwks):
        resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["user_id"] == other_user
