"""
Tests for LangGraph Conversational State Machine
================================================
"""

import unittest
from orchestrator.state_graph import (
    build_interview_graph,
    step_interview_turn,
    warmup_node,
    analyze_candidate_turn,
    InterviewState,
)
from orchestrator.personas import get_persona, PersonaId
from services.blueprint_service import InterviewBlueprint, BlueprintQuestion, BinaryAssertion, save_blueprint


class TestStateGraph(unittest.TestCase):

    def setUp(self):
        self.blueprint = InterviewBlueprint(
            blueprint_id="bp_sg_test",
            role="Backend Infrastructure Engineer",
            seniority="senior",
            company="Airbnb",
            candidate_summary="Strong Python & cloud architect",
            questions=[
                BlueprintQuestion(
                    id="q_01",
                    competency="system_design",
                    category="system_design",
                    text="How would you architect a distributed key-value store?",
                    assertions=[
                        BinaryAssertion(
                            name="consistent_hashing",
                            description="Uses consistent hashing with virtual nodes",
                            weight=0.5,
                        ),
                        BinaryAssertion(
                            name="replication",
                            description="Explains quorum read/write configuration",
                            weight=0.5,
                        ),
                    ],
                    model_answer="Consistent hashing + Dynamo quorum replication.",
                ),
                BlueprintQuestion(
                    id="q_02",
                    competency="algorithms",
                    category="technical_dsa",
                    text="How would you detect cycles in a directed graph?",
                    assertions=[],
                    model_answer="Tarjan's algorithm or DFS with visited states.",
                ),
            ],
        )
        save_blueprint("test_sg_sess_1", self.blueprint)

    def test_warmup_greetings_by_persona(self):
        # Alex greeting
        state_alex: InterviewState = {
            "session_id": "test_sg_sess_1",
            "blueprint_id": "bp_sg_test",
            "persona_id": "alex",
            "current_question_index": 0,
            "current_probe_count": 0,
            "max_probes_per_question": 2,
            "stage": "warmup",
            "last_candidate_utterance": "",
            "turn_action": "",
            "interviewer_utterance": "",
            "questions_total": 2,
            "detected_buzzwords": [],
        }
        res_alex = warmup_node(state_alex)
        self.assertIn("Alex", res_alex["interviewer_utterance"])
        self.assertIn("Backend Infrastructure Engineer", res_alex["interviewer_utterance"])

        # Marcus greeting
        state_marcus = dict(state_alex)
        state_marcus["persona_id"] = "marcus"
        res_marcus = warmup_node(state_marcus)
        self.assertIn("Marcus Vance", res_marcus["interviewer_utterance"])
        self.assertIn("systems and architectural depth", res_marcus["interviewer_utterance"])

        # Priya greeting
        state_priya = dict(state_alex)
        state_priya["persona_id"] = "priya"
        res_priya = warmup_node(state_priya)
        self.assertIn("Priya Sharma", res_priya["interviewer_utterance"])
        self.assertIn("distributed scale", res_priya["interviewer_utterance"])

    def test_analyze_turn_terse_triggers_nudge(self):
        persona = get_persona("alex")
        action = analyze_candidate_turn(
            utterance="Um, I'm not really sure.",
            probe_count=0,
            max_probes=2,
            persona=persona,
            is_last_question=False,
        )
        self.assertEqual(action, "nudge")

    def test_analyze_turn_buzzword_triggers_escalation(self):
        persona = get_persona("alex")
        action = analyze_candidate_turn(
            utterance="I would just use Redis as a cache and Kafka for streaming the events between services.",
            probe_count=0,
            max_probes=2,
            persona=persona,
            is_last_question=False,
        )
        self.assertEqual(action, "escalation_probe")

    def test_analyze_turn_absolute_claim_triggers_doubt(self):
        persona = get_persona("marcus")
        action = analyze_candidate_turn(
            utterance="My architecture will guarantee zero latency and is 100% bulletproof against crashes.",
            probe_count=0,
            max_probes=2,
            persona=persona,
            is_last_question=False,
        )
        self.assertEqual(action, "doubt")

    def test_analyze_turn_substantive_answer_advances(self):
        persona = get_persona("alex")
        action = analyze_candidate_turn(
            utterance=(
                "We can partition the keyspace using consistent hashing with 256 virtual nodes per physical host. "
                "For read and write operations, we configure an N=3, R=2, W=2 quorum system so that R + W > N, "
                "which guarantees monotonic read consistency while handling node failover gracefully."
            ),
            probe_count=1,
            max_probes=2,
            persona=persona,
            is_last_question=False,
        )
        self.assertEqual(action, "advance_question")

    def test_analyze_turn_final_question_concludes(self):
        persona = get_persona("marcus")
        action = analyze_candidate_turn(
            utterance="We use Tarjan's strongly connected components algorithm which operates in linear O(V + E) time.",
            probe_count=1,
            max_probes=2,
            persona=persona,
            is_last_question=True,
        )
        self.assertEqual(action, "conclude")

    def test_step_interview_turn_full_pipeline(self):
        # Test stepping turn with an escalation probe response
        res = step_interview_turn(
            session_id="test_sg_sess_1",
            blueprint_id="bp_sg_test",
            persona_id="marcus",
            candidate_utterance="I will put Kafka in front of everything to decouple the microservices.",
            current_question_index=0,
            current_probe_count=0,
            max_probes_per_question=2,
            questions_total=2,
        )
        self.assertEqual(res["turn_action"], "escalation_probe")
        self.assertIn("kafka", res["detected_buzzwords"])
        self.assertEqual(res["persona_id"], "marcus")
        self.assertIn("guarantee idempotency", res["interviewer_utterance"])
        self.assertGreater(res["current_probe_count"], 0)


if __name__ == "__main__":
    unittest.main()
