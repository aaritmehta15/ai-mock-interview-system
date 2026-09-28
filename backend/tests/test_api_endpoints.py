"""
backend/tests/test_api_endpoints.py

Comprehensive Integration Tests for Phase 4 FastAPI REST Endpoints:
- GET / and GET /health
- GET /api/personas
- POST /api/blueprint
- POST /api/token
- POST /api/evaluate/{session_id}
- GET /api/ledger/{session_id}
"""
import os
import sys
import tempfile
import unittest
from fastapi.testclient import TestClient

# Add repository root to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.main import app
from backend.services.ledger_service import set_db_path, record_turn
from backend.models.schemas import TurnSpeaker


class TestFastAPIEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db.close()
        set_db_path(self.temp_db.name)

    def tearDown(self):
        try:
            if os.path.exists(self.temp_db.name):
                os.remove(self.temp_db.name)
        except PermissionError:
            pass

    def test_root_and_health_endpoints(self):
        r_root = self.client.get("/")
        self.assertEqual(r_root.status_code, 200)
        self.assertEqual(r_root.json()["status"], "ok")

        r_health = self.client.get("/health")
        self.assertEqual(r_health.status_code, 200)
        self.assertEqual(r_health.json()["status"], "healthy")

        r_api_health = self.client.get("/api/health")
        self.assertEqual(r_api_health.status_code, 200)
        self.assertEqual(r_api_health.json()["status"], "healthy")

    def test_get_personas(self):
        r = self.client.get("/api/personas")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 3)
        persona_ids = [p["id"] for p in data]
        self.assertIn("alex", persona_ids)
        self.assertIn("marcus", persona_ids)
        self.assertIn("priya", persona_ids)

    def test_create_blueprint(self):
        payload = {
            "company": "Amazon",
            "role": "Software Development Engineer",
            "seniority": "Senior",
            "resume_text": "Experienced in DynamoDB, distributed consensus, and microservices.",
            "jd_text": "Looking for senior SDE with distributed systems expertise."
        }
        r = self.client.post("/api/blueprint", json=payload)
        self.assertEqual(r.status_code, 200)
        bp = r.json()
        self.assertIn("blueprint_id", bp)
        self.assertIn("questions", bp)
        self.assertGreaterEqual(len(bp["questions"]), 1)

    def test_generate_token(self):
        payload = {
            "room_name": "test-room-room-01",
            "participant_name": "Aarit Candidate",
            "persona_id": "marcus"
        }
        r = self.client.post("/api/token", json=payload)
        self.assertEqual(r.status_code, 200)
        token_data = r.json()
        self.assertIn("token", token_data)
        self.assertIn("url", token_data)
        self.assertTrue(len(token_data["token"]) > 20)

    def test_ledger_and_evaluation_flow(self):
        session_id = "sess_api_integration_99"
        
        # Record turns in ledger
        record_turn(
            session_id=session_id,
            speaker=TurnSpeaker.INTERVIEWER,
            text="Welcome to the interview. When optimizing high-throughput APIs, how do you evaluate contiguous arrays versus pointer-linked nodes?",
            question_index=0
        )
        record_turn(
            session_id=session_id,
            speaker=TurnSpeaker.CANDIDATE,
            text="Contiguous arrays benefit from CPU cache line locality and prefetching, providing O(1) indexing. Pointer linked nodes incur pointer indirection overhead and cache misses.",
            question_index=0,
            confidence=0.95
        )

        # Audit ledger endpoint
        r_ledger = self.client.get(f"/api/ledger/{session_id}")
        self.assertEqual(r_ledger.status_code, 200)
        ledger_data = r_ledger.json()
        self.assertEqual(ledger_data["turns_count"], 2)
        self.assertEqual(len(ledger_data["session_hash"]), 64)

        # Call evaluation endpoint
        r_eval = self.client.post(f"/api/evaluate/{session_id}")
        self.assertEqual(r_eval.status_code, 200)
        report = r_eval.json()
        self.assertEqual(report["session_id"], session_id)
        self.assertIn(report["recommendation"], ["STRONG HIRE", "HIRE", "BORDERLINE", "NO HIRE"])
        self.assertGreater(report["overall_score"], 0.0)
        self.assertGreaterEqual(report["unreached_question_count"], 1)


if __name__ == "__main__":
    unittest.main()
