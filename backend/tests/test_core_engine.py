"""
backend/tests/test_core_engine.py

Comprehensive Unit Test Suite for Phase 1 Core Engine:
1. Pydantic schemas validation
2. SQLite Turn Ledger ground truth & SHA-256 session integrity
3. Calibrated Personas engine & prompt compilation
4. Dynamic Sweet-Spot math & action triggers (Nudge, Probe, Doubt)
"""
import os
import tempfile
import unittest

from backend.models.schemas import (
    BinaryAssertion,
    BlueprintQuestion,
    InterviewBlueprint,
    PersonaProfile,
    QuestionCategory,
    SeniorityLevel,
    TurnEvent,
    TurnSpeaker,
)
from backend.services.ledger_service import (
    compute_session_hash,
    get_asked_question_indices,
    get_session_turns,
    get_verified_candidate_turns,
    init_db,
    record_turn,
    set_db_path,
)
from backend.orchestrator.personas import (
    ALEX_EMPATHETIC_LEAD,
    MARCUS_SKEPTICAL_STAFF,
    PRIYA_BAR_RAISER,
    compile_persona_instructions,
    get_persona,
    list_personas,
)
from backend.orchestrator.sweet_spot import (
    ConversationalActionTracker,
    SweetSpotState,
)


class TestCoreSchemas(unittest.TestCase):
    def test_binary_assertion_valid(self):
        assertion = BinaryAssertion(
            name="mentions_idempotency_key",
            weight=0.5,
            description="Candidate specifies using idempotency keys for at-most-once delivery."
        )
        self.assertEqual(assertion.name, "mentions_idempotency_key")
        self.assertEqual(assertion.weight, 0.5)

    def test_blueprint_question_and_blueprint(self):
        q = BlueprintQuestion(
            id="q_01",
            text="How do you handle consumer group rebalancing in Kafka?",
            competency="Distributed Systems",
            category=QuestionCategory.SYSTEM_DESIGN,
            assertions=[
                BinaryAssertion(name="handles_rebalance", weight=1.0, description="Explains cooperative sticky assignor")
            ],
            model_answer="Use cooperative sticky assignor to prevent stop-the-world partition rebalances."
        )
        bp = InterviewBlueprint(
            blueprint_id="bp_test_123",
            company="Stripe",
            role="AI Systems Engineer",
            seniority=SeniorityLevel.SENIOR,
            keywords=["Kafka", "WebRTC", "Idempotency"],
            questions=[q]
        )
        self.assertEqual(len(bp.questions), 1)
        self.assertEqual(bp.seniority, SeniorityLevel.SENIOR)


class TestSQLiteTurnLedger(unittest.TestCase):
    def setUp(self):
        # Use an isolated temporary database for each test run
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db.close()
        set_db_path(self.temp_db.name)

    def tearDown(self):
        try:
            if os.path.exists(self.temp_db.name):
                os.remove(self.temp_db.name)
        except PermissionError:
            pass

    def test_record_and_retrieve_turns(self):
        session_id = "sess_unit_test_01"
        
        # Interviewer turn
        t1 = record_turn(
            session_id=session_id,
            speaker=TurnSpeaker.INTERVIEWER,
            text="Hi there! I am Alex Rivera. Let's start with our first question.",
            question_index=0
        )
        self.assertTrue(t1.verified)
        self.assertEqual(t1.speaker, TurnSpeaker.INTERVIEWER)

        # Candidate short/incomplete turn (<10 words -> not verified)
        t2 = record_turn(
            session_id=session_id,
            speaker=TurnSpeaker.CANDIDATE,
            text="Um, yeah, let me think.",
            question_index=0
        )
        self.assertFalse(t2.verified)

        # Candidate substantive turn (>=10 words, high confidence -> verified)
        t3 = record_turn(
            session_id=session_id,
            speaker=TurnSpeaker.CANDIDATE,
            text="In distributed consensus, Raft uses leader election and log replication to ensure strong consistency across nodes.",
            question_index=0,
            confidence=0.95
        )
        self.assertTrue(t3.verified)

        all_turns = get_session_turns(session_id)
        self.assertEqual(len(all_turns), 3)

        verified_candidate_turns = get_verified_candidate_turns(session_id)
        self.assertEqual(len(verified_candidate_turns), 1)
        self.assertEqual(verified_candidate_turns[0].turn_id, t3.turn_id)

    def test_anti_phantom_asked_questions(self):
        session_id = "sess_unit_test_02"
        # Interviewer asks question 0 and question 1
        record_turn(session_id, TurnSpeaker.INTERVIEWER, "Question 0 text goes here for the test.", question_index=0)
        record_turn(session_id, TurnSpeaker.INTERVIEWER, "Question 1 text goes here for the test.", question_index=1)

        asked = get_asked_question_indices(session_id)
        self.assertIn(0, asked)
        self.assertIn(1, asked)
        self.assertNotIn(2, asked)

    def test_cryptographic_session_hash(self):
        session_id = "sess_unit_test_03"
        hash1 = compute_session_hash(session_id)
        
        # Add a turn
        record_turn(session_id, TurnSpeaker.INTERVIEWER, "Welcome to the technical interview session.", question_index=0)
        hash2 = compute_session_hash(session_id)
        self.assertNotEqual(hash1, hash2)

        # Hash must be deterministic for identical records
        hash3 = compute_session_hash(session_id)
        self.assertEqual(hash2, hash3)


class TestPersonasEngine(unittest.TestCase):
    def test_persona_profiles_integrity(self):
        personas = list_personas()
        self.assertEqual(len(personas), 3)
        
        alex = get_persona("alex")
        self.assertEqual(alex.name, "Alex Rivera")
        self.assertEqual(alex.voice_model, "Puck")
        self.assertEqual(alex.pause_tolerance, 4.5)

        marcus = get_persona("marcus")
        self.assertEqual(marcus.name, "Marcus Vance")
        self.assertEqual(marcus.voice_model, "Charon")
        self.assertEqual(marcus.pause_tolerance, 2.5)

        priya = get_persona("priya")
        self.assertEqual(priya.name, "Priya Sharma")
        self.assertEqual(priya.voice_model, "Aoede")
        self.assertEqual(priya.pause_tolerance, 2.0)

    def test_compile_persona_instructions(self):
        q = BlueprintQuestion(
            id="q_01",
            text="Explain Redis cluster split-brain scenarios.",
            competency="Distributed Systems",
            category=QuestionCategory.SYSTEM_DESIGN,
            assertions=[],
            model_answer="Redis cluster uses majority quorum..."
        )
        bp = InterviewBlueprint(
            blueprint_id="bp_p_test",
            company="Netflix",
            role="Staff SDE",
            seniority=SeniorityLevel.STAFF,
            keywords=["Redis", "Quorum"],
            questions=[q]
        )
        prompt = compile_persona_instructions(MARCUS_SKEPTICAL_STAFF, bp)
        self.assertIn("Marcus Vance", prompt)
        self.assertIn("Netflix", prompt)
        self.assertIn("Explain Redis cluster split-brain scenarios.", prompt)
        self.assertIn("GREET FIRST", prompt)


class TestSweetSpotTracker(unittest.TestCase):
    def test_bayesian_evidence_update(self):
        tracker = SweetSpotState(session_id="sess_sw_01")
        self.assertEqual(tracker.running_score, 70.0)
        self.assertEqual(tracker.confidence, 0.3)

        # Candidate provides a strong answer (+15 points)
        score, conf = tracker.update_evidence(score_delta=15.0)
        # S_1 = 70 + (15 * 0.3) = 74.5
        self.assertAlmostEqual(score, 74.5, places=2)
        # C_1 = 0.3 + 0.08 = 0.38
        self.assertAlmostEqual(conf, 0.38, places=2)

    def test_nudge_trigger(self):
        alex = ALEX_EMPATHETIC_LEAD
        # Under threshold -> False
        self.assertFalse(ConversationalActionTracker.should_nudge(pause_seconds=2.0, candidate_text="I am analyzing the cache", persona=alex))
        # Exceeds threshold -> True
        self.assertTrue(ConversationalActionTracker.should_nudge(pause_seconds=5.0, candidate_text="I am analyzing the cache", persona=alex))
        # Explicit hesitation -> True
        self.assertTrue(ConversationalActionTracker.should_nudge(pause_seconds=1.0, candidate_text="Um, I don't know the exact formula", persona=alex))

    def test_escalation_probe_trigger(self):
        marcus = MARCUS_SKEPTICAL_STAFF
        alex = ALEX_EMPATHETIC_LEAD
        
        # Alex (Moderate) does not escalate probe
        probe_alex = ConversationalActionTracker.should_escalate_probe("We will use Kafka and Redis", alex)
        self.assertIsNone(probe_alex)

        # Marcus (High) escalates probe on Kafka
        probe_marcus = ConversationalActionTracker.should_escalate_probe("We will put Kafka in front for message buffering", marcus)
        self.assertIsNotNone(probe_marcus)
        self.assertIn("rebalancing", probe_marcus)

    def test_doubt_interrogation_trigger(self):
        marcus = MARCUS_SKEPTICAL_STAFF
        doubt = ConversationalActionTracker.should_doubt("Our database setup is completely bulletproof", marcus)
        self.assertIsNotNone(doubt)
        self.assertIn("Are you sure?", doubt)


if __name__ == "__main__":
    unittest.main()
