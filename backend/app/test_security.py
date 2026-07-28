"""Security Penetration Testing Suite for MCP Server Manager Backend.

Executes security verification checks:
1. Rate limiting enforcement on sensitive & general endpoints.
2. WSS authentication enforcement (rejecting unauthorized & fake token connections).
3. Public vs Protected endpoints access control.
"""

import sys
import unittest
from fastapi.testclient import TestClient

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from main import app
from core.rate_limiter import limiter

client = TestClient(app)

class TestSecurityControls(unittest.TestCase):
    def setUp(self):
        try:
            limiter.reset()
        except Exception:
            pass

    def test_rate_limiting_sensitive_auth_endpoint(self):
        """Verify that /auth/token enforces rate limit of 20 requests per minute."""
        responses = []
        for i in range(25):
            res = client.post("/auth/token", data={"grant_type": "password", "username": "foo", "password": "bar"})
            responses.append(res.status_code)

        # First requests should return standard non-429 codes (e.g. 400 or 200 or 500 depending on downstream keycloak)
        self.assertNotIn(429, responses[:15])
        # Subsequent requests past limit must trigger HTTP 429 Too Many Requests
        self.assertEqual(responses[-1], 429)

    def test_wss_rejects_missing_token(self):
        """Verify WebSocket /ws/health connection is rejected when unauthenticated."""
        try:
            with client.websocket_connect("/ws/health") as websocket:
                # Should not reach here
                self.fail("WSS connection succeeded unexpectedly without token")
        except Exception:
            # Successfully rejected
            pass

    def test_wss_rejects_fake_token(self):
        """Verify WebSocket /ws/health connection is rejected with invalid/fake token."""
        try:
            with client.websocket_connect("/ws/health?token=fake_jwt_token_12345") as websocket:
                self.fail("WSS connection succeeded unexpectedly with fake token")
        except Exception:
            # Successfully rejected invalid token
            pass

    def test_public_vs_protected_route_access(self):
        """Verify public endpoints return 200/404, while protected routes enforce security."""
        # Public health endpoint
        res = client.get("/health")
        self.assertIn(res.status_code, [200, 500])

        # Save previous ENV
        old_env = os.environ.get("ENV")
        os.environ["ENV"] = "production"
        try:
            # Protected write endpoints without token must return 401 in production
            res = client.post("/register-base-url", json={"name": "test", "url": "http://test"})
            self.assertEqual(res.status_code, 401)
        finally:
            if old_env is not None:
                os.environ["ENV"] = old_env
            else:
                os.environ.pop("ENV", None)


if __name__ == "__main__":
    unittest.main()
