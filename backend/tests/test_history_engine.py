"""
tests/test_history_engine.py

Unit and integration tests for the Session History engine,
persistent ledger indexing, and cached evaluation retrieval.
"""
import json
import unittest
from fastapi.testclient import TestClient

from backend.main import app
from backend.models.schemas import TurnSpeaker
from backend.services.ledger_service import ledger_service


class TestHistoryEngine(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.session_id = "sess_test_history_01"

    def test_upsert_and_list_history(self):
        # 1. Upsert a test session
        s = ledger_service.upsert_session(
            session_id=self.session_id,
            company="Stripe",
            role="Staff Infrastructure Engineer",
            seniority="Staff",
            persona_id="marcus",
            overall_score=85.0,
            recommendation="STRONG HIRE",
        )
        self.assertEqual(s["session_id"], self.session_id)
        self.assertEqual(s["company"], "Stripe")
        self.assertEqual(s["overall_score"], 85.0)

        # 2. Test GET /api/history
        res = self.client.get("/api/history")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("sessions", data)
        self.assertGreaterEqual(data["total"], 1)

        found = next((item for item in data["sessions"] if item["session_id"] == self.session_id), None)
        self.assertIsNotNone(found)
        self.assertEqual(found["company"], "Stripe")
        self.assertEqual(found["role"], "Staff Infrastructure Engineer")

        # 3. Test GET /api/history/{session_id}
        res_detail = self.client.get(f"/api/history/{self.session_id}")
        self.assertEqual(res_detail.status_code, 200)
        detail = res_detail.json()
        self.assertEqual(detail["session"]["session_id"], self.session_id)
        self.assertEqual(detail["session"]["recommendation"], "STRONG HIRE")

        # 4. Test DELETE /api/history/{session_id}
        res_del = self.client.delete(f"/api/history/{self.session_id}")
        self.assertEqual(res_del.status_code, 200)
        self.assertEqual(res_del.json()["status"], "deleted")

        # Confirm 404 after delete
        res_404 = self.client.get(f"/api/history/{self.session_id}")
        self.assertEqual(res_404.status_code, 404)


if __name__ == "__main__":
    unittest.main()
