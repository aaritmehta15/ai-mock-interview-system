"""
Tests for Calibrated Interviewer Personas
=========================================
"""

import unittest
from orchestrator.personas import (
    PersonaId,
    PersonaProfile,
    get_persona,
    list_personas,
    compile_persona_instructions,
    ALEX_EMPATHETIC_LEAD,
    MARCUS_SKEPTICAL_STAFF,
    PRIYA_BAR_RAISER,
)
from services.blueprint_service import InterviewBlueprint, BlueprintQuestion, BinaryAssertion


class TestPersonas(unittest.TestCase):

    def setUp(self):
        self.mock_blueprint = InterviewBlueprint(
            blueprint_id="bp_test_123",
            role="Staff Distributed Systems Engineer",
            seniority="staff",
            company="Stripe",
            candidate_summary="Experienced distributed systems developer",
            questions=[
                BlueprintQuestion(
                    id="q_01",
                    competency="system_design",
                    category="system_design",
                    text="How would you design a multi-region ledger for Stripe?",
                    assertions=[
                        BinaryAssertion(
                            name="idempotency",
                            description="Mention idempotency keys",
                            weight=0.5,
                        ),
                        BinaryAssertion(
                            name="saga",
                            description="Explain two-phase commit or saga",
                            weight=0.5,
                        ),
                    ],
                    model_answer="Staff benchmark explaining two-phase commit and idempotency.",
                )
            ],
        )

    def test_list_personas(self):
        personas = list_personas()
        self.assertEqual(len(personas), 3)
        ids = {p.id for p in personas}
        self.assertSetEqual(ids, {PersonaId.ALEX, PersonaId.MARCUS, PersonaId.PRIYA})

    def test_get_persona_by_id(self):
        alex = get_persona("alex")
        self.assertEqual(alex.id, PersonaId.ALEX)
        self.assertEqual(alex.difficulty, "Moderate")
        self.assertEqual(alex.pause_tolerance_seconds, 4.5)

        marcus = get_persona("marcus")
        self.assertEqual(marcus.id, PersonaId.MARCUS)
        self.assertEqual(marcus.difficulty, "High")
        self.assertEqual(marcus.thinking_pause_seconds, 2.0)

        priya = get_persona("priya")
        self.assertEqual(priya.id, PersonaId.PRIYA)
        self.assertEqual(priya.difficulty, "Elite")
        self.assertEqual(priya.pause_tolerance_seconds, 2.0)

    def test_get_persona_fallback(self):
        # Unknown persona string should default gracefully to Alex
        fallback = get_persona("non_existent_persona")
        self.assertEqual(fallback.id, PersonaId.ALEX)

        # None/empty string should default to Alex
        none_fallback = get_persona(None)
        self.assertEqual(none_fallback.id, PersonaId.ALEX)

    def test_compile_persona_instructions(self):
        instructions_alex = compile_persona_instructions(ALEX_EMPATHETIC_LEAD, self.mock_blueprint)
        self.assertIn("Alex Rivera", instructions_alex)
        self.assertIn("Staff Distributed Systems Engineer", instructions_alex)
        self.assertIn("Stripe", instructions_alex)
        self.assertIn("How would you design a multi-region ledger for Stripe?", instructions_alex)

        instructions_marcus = compile_persona_instructions(MARCUS_SKEPTICAL_STAFF, self.mock_blueprint)
        self.assertIn("Marcus Vance", instructions_marcus)
        self.assertIn("Trade-Offs & Failure Mode Interrogation", instructions_marcus)

        instructions_priya = compile_persona_instructions(PRIYA_BAR_RAISER, self.mock_blueprint)
        self.assertIn("Priya Sharma", instructions_priya)
        self.assertIn("Asymptotic Scale & Distributed Systems", instructions_priya)


if __name__ == "__main__":
    unittest.main()
