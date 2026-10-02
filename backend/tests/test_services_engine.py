"""
backend/tests/test_services_engine.py

Comprehensive Unit Test Suite for Phase 2 Services:
1. Blueprint Intake Engine & Fallback Blueprint Calibration
2. PDF Extraction Resilience
3. Anti-Phantom Evaluation Guarantee & Verbatim Citation Matching
4. Mathematical Scoring & Recommendation Gates
"""
import asyncio
import os
import tempfile
import unittest

from backend.models.schemas import (
    BinaryAssertion,
    BlueprintQuestion,
    HiringRecommendation,
    InterviewBlueprint,
    QuestionCategory,
    SeniorityLevel,
    TurnSpeaker,
)
from backend.services.blueprint_service import (
    build_fallback_blueprint,
    detect_company_archetype,
    extract_text_from_pdf,
    get_blueprint,
    save_blueprint,
)
from backend.services.evaluation_service import (
    _fallback_heuristic_assertion_eval,
    evaluate_session,
)
from backend.services.ledger_service import (
    init_db,
    record_turn,
    set_db_path,
)


class TestBlueprintService(unittest.TestCase):
    def test_company_archetype_detection(self):
        self.assertEqual(detect_company_archetype("TCS"), "IT_SERVICES")
        self.assertEqual(detect_company_archetype("Tata Consultancy Services"), "IT_SERVICES")
        self.assertEqual(detect_company_archetype("Infosys"), "IT_SERVICES")
        self.assertEqual(detect_company_archetype("Wipro"), "IT_SERVICES")
        self.assertEqual(detect_company_archetype("Accenture"), "IT_SERVICES")
        self.assertEqual(detect_company_archetype("Stripe"), "FINTECH")
        self.assertEqual(detect_company_archetype("Goldman Sachs"), "FINTECH")
        self.assertEqual(detect_company_archetype("Google"), "BIG_TECH")
        self.assertEqual(detect_company_archetype("Amazon"), "BIG_TECH")
        self.assertEqual(detect_company_archetype("Acme Analytics Labs"), "STARTUP_PRODUCT")

    def test_tcs_fallback_blueprint_calibration(self):
        bp = build_fallback_blueprint(company="TCS", role="System Engineer", seniority="Junior", primary_language="Java")
        self.assertEqual(bp.company, "TCS")
        self.assertEqual(bp.role, "System Engineer")
        self.assertIn("Enterprise Software", bp.domain)
        self.assertEqual(len(bp.questions), 6)
        # Check that Q1 tests OOPs in Java
        self.assertIn("Object-Oriented", bp.questions[0].competency)
        self.assertIn("Java", bp.questions[0].text)

    def test_fallback_blueprint_calibration(self):
        bp = build_fallback_blueprint(company="Stripe", role="AI Infrastructure Engineer", seniority=SeniorityLevel.SENIOR)
        self.assertEqual(bp.company, "Stripe")
        self.assertEqual(bp.role, "AI Infrastructure Engineer")
        self.assertEqual(len(bp.questions), 6)
        self.assertGreaterEqual(len(bp.keywords), 5)

        # Check binary assertions sum to 1.0 per question
        for q in bp.questions:
            self.assertGreaterEqual(len(q.assertions), 3)
            total_weight = sum(a.weight for a in q.assertions)
            self.assertAlmostEqual(total_weight, 1.0, places=2)

    def test_extract_text_from_invalid_pdf(self):
        # Corrupt bytes should return empty string without crashing
        result = extract_text_from_pdf(b"not a valid pdf binary content")
        self.assertEqual(result, "")

    def test_save_and_retrieve_blueprint(self):
        bp = build_fallback_blueprint("Databricks", "ML Engineer")
        session_id = "sess_bp_test_99"
        save_blueprint(session_id, bp)

        retrieved = get_blueprint(session_id)
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.company, "Databricks")


class TestEvaluationService(unittest.TestCase):
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

    def test_heuristic_assertion_eval_empty_speech(self):
        q = BlueprintQuestion(
            id="q_01",
            text="Explain distributed consensus.",
            competency="Distributed Systems",
            category=QuestionCategory.SYSTEM_DESIGN,
            assertions=[
                BinaryAssertion(name="raft_election", weight=0.5, description="Candidate explains raft leader election"),
                BinaryAssertion(name="log_replication", weight=0.5, description="Candidate explains log replication consensus")
            ],
            model_answer="Raft uses leader election..."
        )
        # Empty speech
        results = _fallback_heuristic_assertion_eval(q, "")
        self.assertEqual(len(results), 2)
        self.assertFalse(results[0].passed)
        self.assertFalse(results[1].passed)

    def test_anti_phantom_guarantee_and_scoring(self):
        session_id = "sess_eval_test_anti_phantom"
        bp = build_fallback_blueprint("Google", "AI Engineer")
        save_blueprint(session_id, bp)

        # Candidate and interviewer only complete Question 0 (q_01)
        # Interviewer asks Q0
        record_turn(
            session_id=session_id,
            speaker=TurnSpeaker.INTERVIEWER,
            text=bp.questions[0].text,
            question_index=0
        )
        # Candidate answers Q0 thoroughly
        candidate_speech = (
            "When optimizing high-throughput APIs, contiguous array memory allocation provides direct cache line locality "
            "where CPU caches can prefetch sequential elements. In contrast, pointer linked nodes introduce heap allocation "
            "overhead and O(N) traversal latency."
        )
        record_turn(
            session_id=session_id,
            speaker=TurnSpeaker.CANDIDATE,
            text=candidate_speech,
            question_index=0,
            confidence=0.95
        )

        # Questions 1 and 2 are NEVER asked by the interviewer
        # Run evaluation asynchronously
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        report = loop.run_until_complete(evaluate_session(session_id))
        loop.close()

        # Check anti-phantom guarantee:
        # Exactly 6 questions in blueprint (3 foundational + 3 deep-dive)
        self.assertEqual(len(report.question_evaluations), 6)
        
        # Q0 is VERIFIED
        self.assertEqual(report.question_evaluations[0].status, "VERIFIED")
        self.assertGreater(report.question_evaluations[0].score, 0.0)

        # Q1 through Q5 MUST be UNREACHED with weight 0.0 and score 0.0
        for unasked_idx in range(1, 6):
            self.assertEqual(report.question_evaluations[unasked_idx].status, "UNREACHED")
            self.assertEqual(report.question_evaluations[unasked_idx].weight, 0.0)
            self.assertEqual(report.question_evaluations[unasked_idx].score, 0.0)

        self.assertEqual(report.unreached_question_count, 5)

        # The candidate's overall score must be calculated ONLY over the reached question (Q0)
        # and NOT divided by 3 (which would falsely penalize them with a failing score)
        self.assertEqual(report.overall_score, report.question_evaluations[0].score)
        
        # Verify cryptographic session hash is present
        self.assertTrue(len(report.session_hash) == 64)


if __name__ == "__main__":
    unittest.main()
