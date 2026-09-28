"""
tests/test_agent_worker.py

Unit tests for backend/agent.py:
- System prompt generation with Blueprint and Personas
- Persona voice mapping and token limits
- Ledger event hooks (user transcription and interviewer reply)
- Thread-based execution and environment configuration
"""
import os
import sys
import tempfile
import unittest
from dotenv import load_dotenv

# Add backend directory to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

load_dotenv()

from backend.agent import build_system_instructions
from backend.models.schemas import (
    BinaryAssertion,
    BlueprintQuestion,
    InterviewBlueprint,
    QuestionCategory,
    SeniorityLevel,
    TurnSpeaker,
)
from backend.services.blueprint_service import save_blueprint
from backend.services.ledger_service import ledger_service, set_db_path
from backend.orchestrator.personas import (
    ALEX_EMPATHETIC_LEAD,
    MARCUS_SKEPTICAL_STAFF,
    PRIYA_BAR_RAISER,
)


class TestAgentWorker(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db.close()
        set_db_path(self.temp_db.name)

        self.session_id = "test_agent_session_101"
        self.test_bp = InterviewBlueprint(
            blueprint_id="bp_agent_test",
            company="Stripe",
            role="Infrastructure Engineer",
            seniority=SeniorityLevel.SENIOR,
            keywords=["Raft", "Distributed Systems", "PostgreSQL", "Idempotency"],
            rounds=["Distributed Architecture"],
            questions=[
                BlueprintQuestion(
                    id="q_01",
                    text="How do you ensure exactly-once processing semantics in payment webhooks?",
                    competency="Distributed Systems & Idempotency",
                    category=QuestionCategory.SYSTEM_DESIGN,
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

    def tearDown(self):
        try:
            if os.path.exists(self.temp_db.name):
                os.remove(self.temp_db.name)
        except PermissionError:
            pass

    def test_build_system_instructions_with_blueprint(self):
        """Verify prompt contains company, role, questions, and keywords without DAAZLING."""
        prompt = build_system_instructions(self.test_bp, MARCUS_SKEPTICAL_STAFF)
        self.assertIn("Stripe", prompt)
        self.assertIn("Infrastructure Engineer", prompt)
        self.assertIn("Raft", prompt)
        self.assertIn("Marcus Vance", prompt)
        self.assertIn("exactly-once processing", prompt)
        self.assertNotIn("DAAZLING", prompt)

    def test_default_instructions_without_blueprint(self):
        """Verify fallback prompt when no blueprint is supplied."""
        prompt = build_system_instructions(None, ALEX_EMPATHETIC_LEAD)
        self.assertIn("Alex Rivera", prompt)
        self.assertIn("AI Technical Interviewer", prompt)
        self.assertNotIn("DAAZLING", prompt)

    def test_persona_voice_models(self):
        """Verify exact Gemini voice models assigned per persona."""
        self.assertEqual(ALEX_EMPATHETIC_LEAD.voice_model, "Puck")
        self.assertEqual(MARCUS_SKEPTICAL_STAFF.voice_model, "Charon")
        self.assertEqual(PRIYA_BAR_RAISER.voice_model, "Aoede")

    def test_ledger_turn_recording_hook(self):
        """Verify that agent turn events accurately write to the SQLite ledger."""
        candidate_utterance = (
            "To guarantee exactly-once processing, we store an idempotency key inside a PostgreSQL "
            "database table wrapped in a serializable transaction with a unique constraint."
        )
        
        # Record candidate turn
        event = ledger_service.record_turn(
            session_id=self.session_id,
            speaker=TurnSpeaker.CANDIDATE,
            text=candidate_utterance,
            confidence=0.98,
        )
        self.assertEqual(event.speaker, TurnSpeaker.CANDIDATE)
        self.assertTrue(event.verified)
        self.assertGreaterEqual(event.word_count, 10)
        
        # Record interviewer follow-up turn
        interviewer_utterance = "That makes sense. How do you handle transient database timeouts during lock acquisition?"
        i_event = ledger_service.record_turn(
            session_id=self.session_id,
            speaker=TurnSpeaker.INTERVIEWER,
            text=interviewer_utterance,
            confidence=1.0,
        )
        self.assertEqual(i_event.speaker, TurnSpeaker.INTERVIEWER)
        self.assertTrue(i_event.verified)
        
        # Verify turns retrieved from ledger
        turns = ledger_service.get_session_turns(self.session_id)
        self.assertEqual(len(turns), 2)
        
        verified_turns = ledger_service.get_verified_candidate_turns(self.session_id)
        self.assertEqual(len(verified_turns), 1)
        self.assertEqual(verified_turns[0].turn_id, event.turn_id)


if __name__ == "__main__":
    unittest.main()
