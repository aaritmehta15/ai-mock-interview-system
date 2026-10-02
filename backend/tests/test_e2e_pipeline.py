"""
test_e2e_pipeline.py

End-to-End System Integration Test verifying the entire loop from
Intake & Calibrated Blueprint -> LiveKit Room Token -> Ledger Recording -> Anti-Phantom Evaluation Dossier.
"""
import unittest
import tempfile
import os
from fastapi.testclient import TestClient

from backend.main import app
import backend.services.ledger_service as ledger_service


class TestEndToEndInterviewPipeline(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db.close()
        self.orig_db_path = ledger_service.get_db_path()
        ledger_service.set_db_path(self.temp_db.name)

        self.client = TestClient(app)

    def tearDown(self):
        ledger_service.set_db_path(self.orig_db_path)
        if os.path.exists(self.temp_db.name):
            try:
                os.unlink(self.temp_db.name)
            except PermissionError:
                pass

    def test_full_mock_interview_loop(self):
        session_id = f"sess_e2e_live_{os.getpid()}"

        # ── Step 1: Health Check ─────────────────────────────────────────────
        health_resp = self.client.get("/health")
        self.assertEqual(health_resp.status_code, 200)
        self.assertEqual(health_resp.json()["status"], "healthy")

        # ── Step 2: Personas Catalog ─────────────────────────────────────────
        personas_resp = self.client.get("/api/personas")
        self.assertEqual(personas_resp.status_code, 200)
        personas = personas_resp.json()
        persona_ids = [p["id"] for p in personas]
        self.assertIn("alex", persona_ids)
        self.assertIn("marcus", persona_ids)
        self.assertIn("priya", persona_ids)

        # ── Step 3: Blueprint Generation ─────────────────────────────────────
        bp_payload = {
            "company": "Google",
            "role": "Staff Distributed Systems Engineer",
            "seniority": "Staff",
            "resume_text": "Built Raft consensus state machine replicating 50M ops/sec. Designed split-brain quorum fencing.",
            "session_id": session_id,
            "persona_id": "alex",
        }
        bp_resp = self.client.post("/api/blueprint", json=bp_payload)
        self.assertEqual(bp_resp.status_code, 200)
        blueprint_data = bp_resp.json()
        self.assertIn("questions", blueprint_data)
        self.assertGreaterEqual(len(blueprint_data["questions"]), 1)
        q1 = blueprint_data["questions"][0]
        self.assertIn("assertions", q1)

        # ── Step 4: WebRTC Token Dispensing ──────────────────────────────────
        token_payload = {
            "room_name": session_id,
            "participant_name": "Test Candidate",
            "identity": f"cand_{session_id[-6:]}",
            "persona_id": "alex",
        }
        token_resp = self.client.post("/api/token", json=token_payload)
        self.assertEqual(token_resp.status_code, 200)
        token_data = token_resp.json()
        self.assertIn("token", token_data)
        self.assertIn("server_url", token_data)

        # ── Step 5: Simulate Live Spoken Turns into Ledger ────────────────────
        # Turn 1: Interviewer greets and asks Q1
        t1 = self.client.post("/api/ledger/turn", json={
            "session_id": session_id,
            "speaker": "interviewer",
            "text": "Welcome Alex. Let's discuss your experience with distributed consensus and how Raft prevents split-brain.",
            "question_index": 0,
            "confidence": 1.0,
        })
        self.assertEqual(t1.status_code, 200)

        # Turn 2: Candidate provides verified detailed answer (>10 words)
        t2 = self.client.post("/api/ledger/turn", json={
            "session_id": session_id,
            "speaker": "candidate",
            "text": "In our architecture, we implemented Raft with strict quorum fencing and generation timestamps to guarantee single-leader invariants under WAN network partitions.",
            "question_index": 0,
            "confidence": 0.95,
        })
        self.assertEqual(t2.status_code, 200)

        # Turn 3: Interviewer probes on edge case
        t3 = self.client.post("/api/ledger/turn", json={
            "session_id": session_id,
            "speaker": "interviewer",
            "text": "What happens when a follower receives an append entries RPC with a lower term?",
            "question_index": 0,
            "confidence": 1.0,
        })
        self.assertEqual(t3.status_code, 200)

        # Turn 4: Candidate answers edge case
        t4 = self.client.post("/api/ledger/turn", json={
            "session_id": session_id,
            "speaker": "candidate",
            "text": "The follower rejects the stale RPC immediately and responds with its higher current term, forcing the sender to revert to follower state.",
            "question_index": 0,
            "confidence": 0.92,
        })
        self.assertEqual(t4.status_code, 200)

        # ── Step 6: Verify Ledger Audit & Integrity Hash ─────────────────────
        ledger_resp = self.client.get(f"/api/ledger/{session_id}")
        self.assertEqual(ledger_resp.status_code, 200)
        ledger_info = ledger_resp.json()
        self.assertEqual(ledger_info["turns_count"], 4)
        self.assertIn(0, ledger_info["asked_question_indices"])
        self.assertTrue(len(ledger_info["session_hash"]) == 64)  # SHA-256 length

        # ── Step 7: Post-Interview Evaluation & Anti-Phantom Dossier ──────────
        eval_resp = self.client.post(f"/api/evaluate/{session_id}")
        self.assertEqual(eval_resp.status_code, 200)
        report = eval_resp.json()

        # Anti-Phantom Guarantees
        self.assertEqual(report["session_id"], session_id)
        self.assertIn(report["recommendation"], ["STRONG HIRE", "HIRE", "LEAN HIRE", "BORDERLINE", "NO HIRE"])
        self.assertGreaterEqual(report["overall_score"], 0)
        self.assertEqual(report["session_hash"], ledger_info["session_hash"])

        # Check Question 0 was reached and evaluated
        q_evals = report["question_evaluations"]
        self.assertEqual(q_evals[0]["status"], "VERIFIED")

        # Check subsequent questions (if any) are marked unreached with 0 weight
        if len(q_evals) > 1:
            for unreached_q in q_evals[1:]:
                self.assertEqual(unreached_q["status"], "UNREACHED")
                self.assertEqual(unreached_q["score"], 0.0)
                self.assertEqual(unreached_q["weight"], 0.0)

        self.assertGreaterEqual(report["unreached_question_count"], len(q_evals) - 1)


if __name__ == "__main__":
    unittest.main()
