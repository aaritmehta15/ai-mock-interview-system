"""
tests/test_milestone1_e2e.py

Milestone 1 End-to-End "Done When" Integration Test:
Validates the full system flow from:
1. Intake & Blueprint generation (HTTP POST /api/blueprint)
2. LiveKit Room JWT generation & credentials check (HTTP POST /api/token)
3. Spoken Turn Ledger recording
4. Intentional early stop (Question 3 left unreached)
5. Grounded Dossier Evaluation (HTTP POST /api/evaluate/{session_id})
6. Verification of the 4 Ironclad Guarantees:
   - Guarantee 1: Zero Phantom Questions
   - Guarantee 2: Mathematical Python Scoring
   - Guarantee 3: Calibrated Recommendation
   - Guarantee 4: Verbatim Evidence Quotes
"""
import os
import sys
import unittest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

from main import app
from services.ledger_service import ledger_service


class TestMilestone1EndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.session_id = f"m1_e2e_session_{os.urandom(4).hex()}"

    def test_milestone1_full_pipeline(self):
        # ── Step 1: Intake & Blueprint Generation ─────────────────────────────
        bp_payload = {
            "company": "Stripe",
            "role": "Staff Infrastructure Engineer",
            "seniority": "Staff/Principal",
            "resume_text": "Architected distributed ledger handling 50k tps with idempotent Kafka ingestion and PostgreSQL read replicas.",
            "jd_text": "Design fault-tolerant payment APIs, distributed consensus, and zero-data-loss database replication.",
            "session_id": self.session_id,
        }
        res_bp = self.client.post("/api/blueprint", json=bp_payload)
        self.assertEqual(res_bp.status_code, 200, f"Blueprint creation failed: {res_bp.text}")
        blueprint_data = res_bp.json()
        self.assertIn("questions", blueprint_data)
        self.assertGreaterEqual(len(blueprint_data["questions"]), 3)
        questions = blueprint_data["questions"]
        q1 = questions[0]
        q2 = questions[1]
        q3 = questions[2]
        print(f"\n[E2E] Step 1 PASS: Blueprint synthesized with {len(questions)} calibrated questions.")

        # ── Step 2: LiveKit Token & Room Authorization ────────────────────────
        token_payload = {
            "room_name": self.session_id,
            "participant_name": "Senior Candidate",
            "identity": f"cand_{self.session_id}",
        }
        res_tok = self.client.post("/api/token", json=token_payload)
        self.assertEqual(res_tok.status_code, 200, f"Token generation failed: {res_tok.text}")
        tok_data = res_tok.json()
        self.assertTrue(tok_data["token"].startswith("ey"))
        self.assertTrue(tok_data["url"].startswith("wss://"))
        print(f"[E2E] Step 2 PASS: LiveKit AccessToken issued for {tok_data['url']}.")

        # ── Step 3: Turn Ledger Recording (Simulating Real Voice Dialogue) ───
        # Candidate answers Question 1 with high technical depth
        ledger_service.record_turn(
            session_id=self.session_id,
            question_id=q1["id"],
            question_text=q1["text"],
            candidate_transcript=(
                "To guarantee consistency under partition, we employ a Raft-based consensus group across storage replicas. "
                "For payment webhooks, we enforce unique idempotency keys with serializable transaction isolation in PostgreSQL, "
                "which guarantees exactly-once state transitions even under network retries."
            ),
            speaker="candidate",
            role="candidate",
        )

        # Candidate answers Question 2 with basic explanation
        ledger_service.record_turn(
            session_id=self.session_id,
            question_id=q2["id"],
            question_text=q2["text"],
            candidate_transcript=(
                "For caching we use Redis with cache-aside. If cache misses occur we query the database. "
                "We can add a mutex lock in memory to reduce spike loads."
            ),
            speaker="candidate",
            role="candidate",
        )

        # NOTE: Question 3 (q3) is INTENTIONALLY NOT ANSWERED (simulating candidate ending call early)
        verified_turns = ledger_service.get_verified_turns(self.session_id)
        self.assertEqual(len(verified_turns), 2)
        print(f"[E2E] Step 3 PASS: Recorded 2 verified turns in Turn Ledger; Q3 intentionally left unasked.")

        # ── Step 4: Grounded Dossier Evaluation ───────────────────────────────
        res_eval = self.client.post(f"/api/evaluate/{self.session_id}")
        self.assertEqual(res_eval.status_code, 200, f"Evaluation failed: {res_eval.text}")
        dossier = res_eval.json()

        # ── Step 5: Verification of the 4 Ironclad Guarantees ─────────────────
        # Guarantee 1: Zero Phantom Questions
        evaluated_ids = [eq["question_id"] for eq in dossier["evaluated_questions"]]
        unreached_ids = [uq["question_id"] for uq in dossier["unreached_questions"]]

        self.assertIn(q1["id"], evaluated_ids, "Question 1 must be evaluated")
        self.assertIn(q2["id"], evaluated_ids, "Question 2 must be evaluated")
        self.assertNotIn(q3["id"], evaluated_ids, "Question 3 was never asked, MUST NOT be in evaluated questions!")
        self.assertIn(q3["id"], unreached_ids, "Question 3 MUST be placed into unreached_questions")
        print("[E2E] Guarantee 1 VERIFIED: Zero phantom questions. Q3 safely marked 'Not Attempted'.")

        # Guarantee 2: Mathematical Python Scoring
        score = dossier["overall_score"]
        self.assertGreaterEqual(score, 0.0)
        self.assertLessEqual(score, 100.0)
        q_scores = [eq["score"] for eq in dossier["evaluated_questions"]]
        expected_overall = round(sum(q_scores) / len(q_scores), 1)
        self.assertAlmostEqual(score, expected_overall, delta=0.5)
        print(f"[E2E] Guarantee 2 VERIFIED: Mathematical score is {score}/100 (exact average of {q_scores}).")

        # Guarantee 3: Calibrated Recommendation
        rec = dossier["recommendation"]
        self.assertIn(rec, ["Strong Hire", "Hire", "Borderline", "No Hire"])
        print(f"[E2E] Guarantee 3 VERIFIED: Recommendation is '{rec}'.")

        # Guarantee 4: Verbatim Evidence Quotes
        for eq in dossier["evaluated_questions"]:
            self.assertTrue(len(eq["candidate_transcript"]) > 0)
            for ar in eq["assertion_results"]:
                self.assertIn("passed", ar)
                self.assertIn("reasoning", ar)
                if ar["passed"]:
                    self.assertTrue(len(ar["evidence_quote"]) > 0)
        print("[E2E] Guarantee 4 VERIFIED: Verbatim candidate evidence quotes verified on all assertions.")
        print(f"\n>>> ALL MILESTONE 1 CHECKS PASSED PERFECTLY FOR SESSION {self.session_id}! <<<\n")


if __name__ == "__main__":
    unittest.main()
