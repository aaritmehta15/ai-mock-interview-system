"""
tests/test_evaluation.py

Unit and integration tests for Offline Grounded Dossier Evaluator:
- Verifies deterministic mathematical scoring (Python-computed)
- Verifies binary assertion evidence extraction
- Verifies the Zero Phantom Question guarantee (unreached questions are never hallucinated or scored)
- Verifies API endpoint POST /api/evaluate/{session_id}
"""
import os
import sys
import unittest
import asyncio
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

from fastapi.testclient import TestClient
from main import app
from services.blueprint_service import InterviewBlueprint, BlueprintQuestion, BinaryAssertion, save_blueprint
from services.ledger_service import ledger_service, create_session, record_turn
from services.evaluation_service import (
    calculate_question_score,
    determine_recommendation,
    generate_interview_dossier,
    AssertionResult,
)


class TestEvaluationService(unittest.TestCase):
    def setUp(self):
        self.session_id = "test_eval_sess_404"
        self.blueprint = InterviewBlueprint(
            blueprint_id="bp_eval_test",
            company="Airbnb",
            role="Backend Engineer",
            seniority="Senior",
            keywords=["PostgreSQL", "B-Tree", "Indexes", "Partitioning", "Caching"],
            rounds=["Database Systems", "API Architecture", "Concurrency"],
            questions=[
                BlueprintQuestion(
                    id="q_db",
                    text="How do B-tree indexes speed up range queries in PostgreSQL, and when might a sequential scan be preferred by the query planner?",
                    competency="Database Storage & Query Optimization",
                    category="technical_dsa",
                    assertions=[
                        BinaryAssertion(name="ordered_tree", weight=0.3, description="Explains sorted leaf nodes linked for range traversal"),
                        BinaryAssertion(name="log_complexity", weight=0.3, description="Cites O(log N) lookup cost to find range boundary"),
                        BinaryAssertion(name="planner_cost", weight=0.4, description="Identifies sequential scan efficiency when reading large table percentages due to disk I/O"),
                    ],
                    model_answer="B-trees maintain balanced, sorted leaf pages with bidirectional pointers for fast O(log N) scans. Sequential scans are cheaper when selecting high percentages of rows due to sequential vs random page fetch costs.",
                ),
                BlueprintQuestion(
                    id="q_cache",
                    text="Explain cache invalidation strategies and how you mitigate the Thundering Herd / Cache Stampede problem.",
                    competency="Distributed Caching & Concurrency",
                    category="system_design",
                    assertions=[
                        BinaryAssertion(name="invalidation_pattern", weight=0.3, description="Contrasts write-through vs cache-aside"),
                        BinaryAssertion(name="mutex_lock", weight=0.4, description="Mentions distributed mutex or single-flight loader pattern"),
                        BinaryAssertion(name="probabilistic_early_expiry", weight=0.3, description="Cites XFetch or probabilistic background refresh before TTL expiration"),
                    ],
                    model_answer="Use cache-aside with TTL. Mitigate stampedes using distributed mutex locking (e.g. Redis Redlock) or probabilistic early recomputation (XFetch algorithm).",
                ),
                BlueprintQuestion(
                    id="q_unreached",
                    text="Describe how you structure idempotent payment webhook handlers.",
                    competency="Payment Reliability",
                    category="system_design",
                    assertions=[
                        BinaryAssertion(name="idempotency_key", weight=0.5, description="Uses unique idempotency token"),
                        BinaryAssertion(name="db_lock", weight=0.5, description="Employs database transaction isolation"),
                    ],
                    model_answer="Store idempotency key in database with unique constraint.",
                ),
            ],
        )
        save_blueprint(self.session_id, self.blueprint)
        create_session(self.blueprint, session_id=self.session_id)

    def test_deterministic_scoring_math(self):
        """Verify python scoring calculation without floating point drift."""
        # 100% pass
        all_passed = [
            AssertionResult(name="a1", weight=0.3, passed=True, evidence_quote="q1", reasoning="r1"),
            AssertionResult(name="a2", weight=0.3, passed=True, evidence_quote="q2", reasoning="r2"),
            AssertionResult(name="a3", weight=0.4, passed=True, evidence_quote="q3", reasoning="r3"),
        ]
        self.assertEqual(calculate_question_score(all_passed), 100.0)

        # Partial pass (0.3 + 0.4 = 0.7 -> 70.0%)
        partial = [
            AssertionResult(name="a1", weight=0.3, passed=True, evidence_quote="q1", reasoning="r1"),
            AssertionResult(name="a2", weight=0.3, passed=False, evidence_quote="q2", reasoning="r2"),
            AssertionResult(name="a3", weight=0.4, passed=True, evidence_quote="q3", reasoning="r3"),
        ]
        self.assertEqual(calculate_question_score(partial), 70.0)

        # Zero pass
        none_passed = [
            AssertionResult(name="a1", weight=0.5, passed=False, evidence_quote="q1", reasoning="r1"),
            AssertionResult(name="a2", weight=0.5, passed=False, evidence_quote="q2", reasoning="r2"),
        ]
        self.assertEqual(calculate_question_score(none_passed), 0.0)

    def test_recommendation_thresholds(self):
        """Verify standardized rubric recommendation outputs."""
        self.assertEqual(determine_recommendation(92.0), "Strong Hire")
        self.assertEqual(determine_recommendation(85.0), "Strong Hire")
        self.assertEqual(determine_recommendation(74.5), "Hire")
        self.assertEqual(determine_recommendation(60.0), "Borderline")
        self.assertEqual(determine_recommendation(45.0), "No Hire")

    def test_dossier_zero_phantom_questions(self):
        """
        Critical Test: Candidate only answers Question 1 and Question 2.
        Question 3 is NEVER reached.
        Verify that Question 3 is placed in unreached_questions and NOT scored.
        """
        # Candidate answers Q1 thoroughly
        record_turn(
            session_id=self.session_id,
            question_id="q_db",
            question_text="B-tree index question",
            candidate_transcript="In PostgreSQL, B-trees keep leaf nodes ordered and linked so range queries achieve O(log N) lookup time. The query planner prefers sequential scan when a large portion of the table is read to avoid costly random disk reads.",
            speaker="candidate",
            role="candidate",
        )

        # Candidate answers Q2 partially
        record_turn(
            session_id=self.session_id,
            question_id="q_cache",
            question_text="Cache stampede question",
            candidate_transcript="We typically use a cache-aside pattern where we check Redis first. When there is a cache stampede, we can use a distributed mutex lock to let only one process recompute.",
            speaker="candidate",
            role="candidate",
        )

        # Run dossier generation
        dossier = asyncio.run(generate_interview_dossier(self.session_id))

        # Check evaluations
        self.assertEqual(len(dossier.evaluated_questions), 2)
        evaluated_qids = [eq.question_id for eq in dossier.evaluated_questions]
        self.assertIn("q_db", evaluated_qids)
        self.assertIn("q_cache", evaluated_qids)
        self.assertNotIn("q_unreached", evaluated_qids)

        # Verify Q3 is explicitly categorized as unreached with NO penalty score
        self.assertEqual(len(dossier.unreached_questions), 1)
        self.assertEqual(dossier.unreached_questions[0].question_id, "q_unreached")

        # Verify score is in valid range
        self.assertGreater(dossier.overall_score, 0.0)
        self.assertIn(dossier.recommendation, ["Strong Hire", "Hire", "Borderline", "No Hire"])
        self.assertGreaterEqual(len(dossier.strengths), 1)

    def test_evaluate_api_endpoint(self):
        """Verify HTTP POST /api/evaluate/{session_id} returns calibrated dossier."""
        # Answer Q1
        record_turn(
            session_id=self.session_id,
            question_id="q_db",
            question_text="B-tree index question",
            candidate_transcript="B-trees provide sorted leaf pages for fast O(log N) traversal. When reading many rows, sequential scan is faster.",
            speaker="candidate",
            role="candidate",
        )
        
        client = TestClient(app)
        res = client.post(f"/api/evaluate/{self.session_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        
        self.assertEqual(data["session_id"], self.session_id)
        self.assertEqual(data["company"], "Airbnb")
        self.assertIn("overall_score", data)
        self.assertIn("evaluated_questions", data)
        self.assertIn("unreached_questions", data)
        self.assertEqual(len(data["unreached_questions"]), 2)  # q_cache and q_unreached


if __name__ == "__main__":
    unittest.main()
