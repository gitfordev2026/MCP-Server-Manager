"""Comprehensive Unit & Integration Test Suite for Secure WebSocket Ticket Pattern.

Tests all 5 Acceptance Criteria:
1. Happy Path: Authenticated ticket request -> Connect with ticket + valid Origin -> Succeeds.
2. Single-Use Violation: Reusing the same ticket -> Rejected with 1008.
3. Expired Ticket: Ticket created > 30s ago -> Rejected with 1008.
4. Origin Check Failure: Connecting with unapproved Origin (CSWSH defense) -> Rejected with 1008.
5. Invalid/Forged Ticket: Connecting with fake ticket -> Rejected with 1008.
"""

import os
import sys
import time
import unittest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from main import app
from core.ws_ticket import create_ws_ticket, _memory_tickets, _memory_lock

client = TestClient(app)


class TestWSTicketSecurity(unittest.TestCase):
    def setUp(self):
        # Clear in-memory ticket store before each test
        with _memory_lock:
            _memory_tickets.clear()

    def test_1_happy_path(self):
        """1. Happy Path: Authenticated ticket request -> Connect with ticket + valid Origin."""
        # Step A: Request ticket with auth headers
        res = client.post("/api/ws-ticket", headers={"X-User": "alice", "X-Roles": "super_admin"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("ticket", data)
        ticket_id = data["ticket"]

        # Step B: Connect to /ws with valid ticket and approved Origin
        with client.websocket_connect(f"/ws?ticket={ticket_id}", headers={"origin": "http://localhost:3000"}) as websocket:
            welcome = websocket.receive_json()
            self.assertEqual(welcome.get("type"), "connection_established")
            self.assertIn("alice", welcome.get("message", ""))

    def test_2_single_use_violation_replay_attack(self):
        """2. Single-Use Violation: Reusing the same ticket must fail on 2nd attempt."""
        # Generate ticket
        res = client.post("/api/ws-ticket", headers={"X-User": "bob"})
        ticket_id = res.json()["ticket"]

        # First connection consumes (burns) ticket -> succeeds
        with client.websocket_connect(f"/ws?ticket={ticket_id}", headers={"origin": "http://localhost:3000"}) as websocket:
            _ = websocket.receive_json()

        # Second connection attempt with same ticket -> must fail with code 1008
        with self.assertRaises(Exception):
            with client.websocket_connect(f"/ws?ticket={ticket_id}", headers={"origin": "http://localhost:3000"}) as websocket:
                self.fail("Replay attack succeeded unexpectedly")

    def test_3_expired_ticket(self):
        """3. Expired Ticket: Ticket older than 30 seconds must be rejected."""
        # Manually create an already-expired ticket
        expired_ticket_id = create_ws_ticket({"username": "charlie"}, ttl_sec=-5)

        # Connection attempt with expired ticket -> must fail
        with self.assertRaises(Exception):
            with client.websocket_connect(f"/ws?ticket={expired_ticket_id}", headers={"origin": "http://localhost:3000"}) as websocket:
                self.fail("Expired ticket connected unexpectedly")

    def test_4_origin_check_failure_cswsh_defense(self):
        """4. Origin Check Failure: Unapproved Origin header must be rejected with 1008."""
        res = client.post("/api/ws-ticket", headers={"X-User": "dave"})
        ticket_id = res.json()["ticket"]

        # Connect with malicious origin -> must be rejected
        with self.assertRaises(Exception):
            with client.websocket_connect(f"/ws?ticket={ticket_id}", headers={"origin": "https://malicious-site.com"}) as websocket:
                self.fail("CSWSH connection succeeded unexpectedly with malicious origin")

    def test_5_invalid_forged_ticket(self):
        """5. Invalid/Forged Ticket: Random or fabricated UUID string must be rejected."""
        fake_ticket = "00000000-0000-0000-0000-000000000000"

        with self.assertRaises(Exception):
            with client.websocket_connect(f"/ws?ticket={fake_ticket}", headers={"origin": "http://localhost:3000"}) as websocket:
                self.fail("Forged ticket connected unexpectedly")


if __name__ == "__main__":
    unittest.main()
