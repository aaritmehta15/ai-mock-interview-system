import unittest
import os
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.ledger_service import ledger_service
from backend.services.blueprint_service import build_fallback_blueprint, save_blueprint

class TestInterviewChatAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.session_id = "test_chat_unit_999"
        bp = build_fallback_blueprint("Google", "Staff Software Engineer", "Staff")
        save_blueprint(self.session_id, bp)

    def tearDown(self):
        ledger_service.delete_session(self.session_id)

    def test_start_interview_greeting(self):
        res = self.client.post("/api/interview/start", json={
            "session_id": self.session_id,
            "persona_id": "alex",
            "company": "Google",
            "role": "Staff Software Engineer",
            "seniority": "Staff",
            "participant_name": "Aarit"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("interviewer_text", data)
        self.assertTrue(len(data["interviewer_text"]) > 10)
        self.assertIn("Alex Rivera", data["interviewer_text"])
        self.assertEqual(data["question_index"], 0)

        # Verify ledger has the greeting recorded
        turns = ledger_service.get_session_turns(self.session_id)
        self.assertTrue(len(turns) >= 1)
        self.assertEqual(turns[0].speaker, "interviewer")

    def test_chat_turn_progression(self):
        # 1. Start session
        self.client.post("/api/interview/start", json={
            "session_id": self.session_id,
            "persona_id": "alex",
        })

        # 2. Candidate intro
        res = self.client.post("/api/interview/chat", json={
            "session_id": self.session_id,
            "candidate_text": "Hi Alex, I'm Aarit with 4 years of experience building distributed systems in Python.",
            "persona_id": "alex"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("interviewer_text", data)
        self.assertFalse(data["is_finished"])

        # Check that candidate turn + interviewer reply were logged in ledger
        turns = ledger_service.get_session_turns(self.session_id)
        self.assertTrue(len(turns) >= 3)
        speakers = [t.speaker for t in turns]
        self.assertIn("candidate", speakers)
        self.assertIn("interviewer", speakers)

if __name__ == "__main__":
    unittest.main()

