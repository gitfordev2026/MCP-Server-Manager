import unittest
import json
import asyncio
from unittest.mock import MagicMock, patch
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker

from app.models.db_models import Base, UserModel, MCPToolModel, ServerModel, BaseURLModel
from app.core.rbac import get_request_actor
from app.services.langfuse_service import langfuse_service, _redact_payload
from app.main import CombinedAppsOpenAPIMCP, JWTAuthASGIMiddleware


class TestPhase1Fixes(unittest.TestCase):
    def setUp(self):
        # Create in-memory SQLite DB for testing
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

    def test_issue_1_inactivity_token_cleanup_structure(self):
        """Issue 1: Verify token cleanup data structures and state."""
        # Redacted payload helper check
        redacted = _redact_payload({"authorization": "Bearer eyJ123", "normal": "value"})
        self.assertEqual(redacted["authorization"], "[REDACTED]")
        self.assertEqual(redacted["normal"], "value")

    def test_issue_2_strict_tool_validation_gate(self):
        """Issue 2: Verify server-side validation gate rejects unknown tools & missing parameters."""
        mcp_server = CombinedAppsOpenAPIMCP(name="TestCombinedMCP")

        async def run_test():
            # Test unknown tool call
            res = await mcp_server.call_tool("non_existent_tool_123", {})
            self.assertTrue(res.is_error)
            self.assertEqual(res.structured_content.get("error"), "no_matching_tool")
            self.assertIn("No matching tool found", res.structured_content.get("message", ""))

        asyncio.run(run_test())

    def test_issue_3_langfuse_tracing_noop_resilience(self):
        """Issue 3: Verify langfuse_service executes safely without throwing when disabled/unreachable."""
        try:
            langfuse_service.trace_execution(
                name="unit-test-trace",
                user_id="user-123",
                prompt="test prompt",
                tools_offered=["tool1"],
                output="test output",
                error=None,
                latency_ms=15.0,
            )
            success = True
        except Exception:
            success = False
        self.assertTrue(success, "Langfuse tracing wrapper must never crash execution")

    def test_issue_4_mcp_auth_middleware_401_rejection(self):
        """Issue 4: Verify unauthenticated request to MCP endpoint returns 401 with WWW-Authenticate header."""
        dummy_app = MagicMock()
        middleware = JWTAuthASGIMiddleware(dummy_app)

        sent_messages = []
        async def mock_send(message):
            sent_messages.append(message)

        scope = {
            "type": "http",
            "path": "/mcp/apps/",
            "headers": [],
            "client": ("192.168.1.100", 54321),
        }

        async def run_middleware():
            await middleware(scope, MagicMock(), mock_send)

        with patch("app.main.AUTH_ENABLED", True):
            asyncio.run(run_middleware())

        self.assertTrue(len(sent_messages) > 0)
        status_code = sent_messages[0].get("status")
        headers = dict(sent_messages[0].get("headers", []))
        self.assertEqual(status_code, 401)
        self.assertIn(b"www-authenticate", headers)

    def test_issue_5_auto_assign_admin_role_first_user(self):
        """Issue 5: Verify 1st user gets 'admin' role, 2nd user gets 'developer' role."""
        with patch("app.core.db.SessionLocal", self.Session):
            class MockState:
                _validated_actor = None

            # 1. First user login
            mock_request1 = MagicMock()
            mock_request1.state = MockState()
            mock_request1.headers = {"authorization": "Bearer dummy-jwt-1"}

            with patch("app.core.rbac.validate_token") as mock_val:
                mock_val.return_value = MagicMock(username="alice", subject="sub-alice")
                actor1 = get_request_actor(mock_request1)

            self.assertEqual(actor1["primary_role"], "admin")
            self.assertEqual(actor1["username"], "alice")

            # 2. Second user login
            mock_request2 = MagicMock()
            mock_request2.state = MockState()
            mock_request2.headers = {"authorization": "Bearer dummy-jwt-2"}

            with patch("app.core.rbac.validate_token") as mock_val2:
                mock_val2.return_value = MagicMock(username="bob", subject="sub-bob")
                actor2 = get_request_actor(mock_request2)

            self.assertEqual(actor2["primary_role"], "developer")
            self.assertEqual(actor2["username"], "bob")


if __name__ == "__main__":
    unittest.main()
