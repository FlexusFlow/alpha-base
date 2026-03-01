"""Integration tests: verify protected endpoints enforce JWT auth end-to-end.

Uses the real FastAPI app (not a minimal test app) with dependency overrides
and a mocked JWKS client. The user-cleanup endpoint is chosen because
it is simple, returns user_id in the response, and has no external side-effects
when the vectorstore service is mocked.
"""

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.dependencies import get_settings
from app.main import app
from tests.conftest import TEST_USER_ID, _mock_jwks_signing_key, make_token


class _FakeSettings:
    supabase_url = "http://localhost:54321"
    deeplake_org_id = "fake-org"
    deeplake_token = "fake-token"


_mock_jwks = MagicMock()
_mock_jwks.get_signing_key_from_jwt.return_value = _mock_jwks_signing_key()


def _make_client() -> TestClient:
    app.dependency_overrides[get_settings] = lambda: _FakeSettings()
    return TestClient(app)


def _cleanup():
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@patch("app.routers.user_cleanup.cleanup_user_vectorstore", new_callable=AsyncMock)
@patch("app.dependencies._get_jwks_client", return_value=_mock_jwks)
def test_protected_endpoint_succeeds_with_valid_token(mock_jwks, mock_cleanup):
    """A request with a valid JWT should reach the endpoint and return 200."""
    mock_cleanup.return_value = None
    client = _make_client()
    try:
        token = make_token()
        resp = client.delete(
            "/v1/api/internal/user-cleanup",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["user_id"] == TEST_USER_ID
    finally:
        _cleanup()


@patch("app.routers.user_cleanup.cleanup_user_vectorstore", new_callable=AsyncMock)
@patch("app.dependencies._get_jwks_client", return_value=_mock_jwks)
def test_protected_endpoint_rejects_missing_token(mock_jwks, mock_cleanup):
    """A request without an Authorization header should get 401."""
    client = _make_client()
    try:
        resp = client.delete("/v1/api/internal/user-cleanup")
        assert resp.status_code == 401
        assert "Authorization header missing" in resp.json()["detail"]
    finally:
        _cleanup()


@patch("app.routers.user_cleanup.cleanup_user_vectorstore", new_callable=AsyncMock)
@patch("app.dependencies._get_jwks_client", return_value=_mock_jwks)
def test_token_user_id_is_used_regardless_of_body(mock_jwks, mock_cleanup):
    """Even if a request body contained a user_id, the JWT sub claim wins."""
    mock_cleanup.return_value = None
    client = _make_client()
    try:
        token = make_token()
        resp = client.request(
            "DELETE",
            "/v1/api/internal/user-cleanup",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            content='{"user_id": "attacker-injected-id"}',
        )
        assert resp.status_code == 200
        assert resp.json()["user_id"] == TEST_USER_ID
    finally:
        _cleanup()


@patch("app.routers.user_cleanup.cleanup_user_vectorstore", new_callable=AsyncMock)
@patch("app.dependencies._get_jwks_client", return_value=_mock_jwks)
def test_expired_token_is_rejected(mock_jwks, mock_cleanup):
    """An expired JWT should be rejected with 401."""
    client = _make_client()
    try:
        token = make_token(expires_in=-3600)
        resp = client.delete(
            "/v1/api/internal/user-cleanup",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()
    finally:
        _cleanup()
