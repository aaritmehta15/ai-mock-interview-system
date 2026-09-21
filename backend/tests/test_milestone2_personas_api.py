"""
Integration Tests for Milestone 2: Personas & Orchestrator API
==============================================================
"""

import unittest
from fastapi.testclient import TestClient
from main import app
from services.blueprint_service import InterviewBlueprint, BlueprintQuestion, save_blueprint


class TestPersonasAPI(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)
        self.blueprint = InterviewBlueprint(
            blueprint_id="bp_api_test",
            role="Distributed Systems Architect",
            seniority="lead",
            company="Netflix",
            candidate_summary="Expert in streaming and distributed caches",
            questions=[
                BlueprintQuestion(
                    id="q_01",
                    competency="system_design",
                    category="system_design",
                    text="How would you design a multi-tiered cache for video playback metadata?",
                    assertions=[],
                    model_answer="Redis + EVCache tiered cache with lease-based eviction.",
                ),
                BlueprintQuestion(
                    id="q_02",
                    competency="distributed_systems",
                    category="architecture",
                    text="Explain how you handle cache stampedes when a viral video is published.",
                    assertions=[],
                    model_answer="Probabilistic early expiration and mutex locks.",
                ),
            ],
        )
        save_blueprint("test_api_session_42", self.blueprint)

    def test_get_personas_endpoint(self):
        response = self.client.get("/api/personas")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 3)

        ids = {p["id"] for p in data}
        self.assertEqual(ids, {"alex", "marcus", "priya"})

        for p in data:
            self.assertIn("name", p)
            self.assertIn("archetype", p)
            self.assertIn("badge_label", p)
            self.assertIn("accent_color", p)
            self.assertIn("difficulty", p)
            self.assertIn("pause_tolerance_seconds", p)

    def test_post_token_with_persona(self):
        response = self.client.post(
            "/api/token",
            json={
                "room_name": "test_api_session_42",
                "participant_name": "Aarit Mehta",
                "persona_id": "marcus",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("token", data)
        self.assertTrue(data["token"].startswith("eyJ"))  # valid JWT
        self.assertIn("url", data)

    def test_post_orchestrator_step_escalation(self):
        response = self.client.post(
            "/api/orchestrator/step",
            json={
                "session_id": "test_api_session_42",
                "blueprint_id": "bp_api_test",
                "persona_id": "marcus",
                "candidate_utterance": "We can put Kafka and Redis together so microservices don't block.",
                "current_question_index": 0,
                "current_probe_count": 0,
                "max_probes_per_question": 2,
                "questions_total": 2,
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["turn_action"], "escalation_probe")
        self.assertIn("kafka", data["detected_buzzwords"])
        self.assertEqual(data["persona_id"], "marcus")
        self.assertIn("guarantee idempotency", data["interviewer_utterance"])

    def test_post_orchestrator_step_nudge(self):
        response = self.client.post(
            "/api/orchestrator/step",
            json={
                "session_id": "test_api_session_42",
                "blueprint_id": "bp_api_test",
                "persona_id": "alex",
                "candidate_utterance": "Um, I don't know.",
                "current_question_index": 0,
                "current_probe_count": 0,
                "max_probes_per_question": 2,
                "questions_total": 2,
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["turn_action"], "nudge")
        self.assertEqual(data["persona_id"], "alex")


if __name__ == "__main__":
    unittest.main()
