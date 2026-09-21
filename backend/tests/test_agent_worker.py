"""
tests/test_agent_worker.py

Unit and integration tests for backend/agent.py:
- System prompt generation with Blueprint
- Gemini Multimodal Realtime model initialization
- Ledger event hooks (user transcription and interviewer reply)
- Verified turn recording in append-only SQLite Turn Ledger
"""
import os
import sys
import unittest
from dotenv import load_dotenv

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

from agent import build_system_instructions
from services.blueprint_service import InterviewBlueprint, BlueprintQuestion, BinaryAssertion, save_blueprint
from services.ledger_service import ledger_service


class TestAgentWorker(unittest.TestCase):
    def setUp(self):
        self.session_id = "test_agent_session_101"
        self.test_bp = InterviewBlueprint(
            blueprint_id="bp_agent_test",
            company="Stripe",
            role="Infrastructure Engineer",
            seniority="Senior",
            keywords=["Raft", "Distributed Systems", "PostgreSQL", "Idempotency"],
            rounds=["Distributed Architecture"],
            questions=[
                BlueprintQuestion(
                    id="q_01",
                    text="How do you ensure exactly-once processing semantics in payment webhooks?",
                    competency="Distributed Systems & Idempotency",
                    category="system_design",
                    assertions=[
                        BinaryAssertion(name="idempotency_key", weight=0.4, description="Mentions unique idempotency keys"),
                        BinaryAssertion(name="db_transaction", weight=0.3, description="Explains atomic database transactions"),
                        BinaryAssertion(name="dedup_cache", weight=0.3, description="Uses Redis/memory deduplication window"),
                    ],
                    model_answer="Use unique idempotency keys with atomic DB row-level locking or distributed Redis lock.",
                )
            ],
        )
        save_blueprint(self.session_id, self.test_bp)

    def test_build_system_instructions(self):
        """Verify prompt contains company, role, questions, and keywords."""
        prompt = build_system_instructions(self.test_bp)
        self.assertIn("Stripe", prompt)
        self.assertIn("Infrastructure Engineer", prompt)
        self.assertIn("Raft", prompt)
        self.assertIn("exactly-once processing", prompt)
        self.assertIn("DAAZLING", prompt)

    def test_default_instructions_without_blueprint(self):
        """Verify fallback prompt when no blueprint is supplied."""
        prompt = build_system_instructions(None)
        self.assertIn("DAAZLING", prompt)
        self.assertIn("AI Technical Interviewer", prompt)

    def test_ledger_turn_recording_hook(self):
        """Verify that agent turn events accurately write to the ledger and satisfy verification thresholds."""
        candidate_utterance = "To guarantee exactly-once processing, we store an idempotency key inside a PostgreSQL database table wrapped in a serializable transaction."
        
        # Record candidate turn
        event = ledger_service.record_turn(
            session_id=self.session_id,
            speaker="candidate",
            role="candidate",
            text=candidate_utterance,
            confidence=0.98,
        )
        
        self.assertEqual(event.speaker, "candidate")
        self.assertEqual(event.role, "candidate")
        self.assertGreater(event.word_count, 10)
        
        # Record interviewer follow-up turn
        interviewer_utterance = "That makes sense. How do you handle transient database timeouts during lock acquisition?"
        i_event = ledger_service.record_turn(
            session_id=self.session_id,
            speaker="interviewer",
            role="interviewer",
            text=interviewer_utterance,
            confidence=1.0,
        )
        self.assertEqual(i_event.role, "interviewer")
        
        # Verify turns retrieved from ledger
        turns = ledger_service.get_session_turns(self.session_id)
        self.assertGreaterEqual(len(turns), 2)
        
        verified_turns = ledger_service.get_verified_turns(self.session_id)
        self.assertGreaterEqual(len(verified_turns), 1)
        self.assertEqual(verified_turns[0].speaker, "candidate")
        self.assertIn("idempotency key", verified_turns[0].text)

    def test_gemini_realtime_model_initialization(self):
        """Verify that Gemini Multimodal Realtime model initializes cleanly with environment credentials."""
        gemini_key = os.getenv("GEMINI_API_KEY")
        self.assertTrue(bool(gemini_key), "GEMINI_API_KEY must be configured in environment")
        
        from livekit.plugins.google.beta import realtime
        model = realtime.RealtimeModel(
            api_key=gemini_key,
            voice="Puck",
        )
        self.assertIsNotNone(model)
        self.assertTrue("gemini" in model.model.lower())


if __name__ == "__main__":
    unittest.main()
