"""
tests/test_ledger.py — Unit tests for Append-Only Turn Ledger
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.blueprint_service import (
    InterviewBlueprint,
    BlueprintQuestion,
    BinaryAssertion
)
from services.ledger_service import (
    create_session,
    record_turn,
    get_verified_turns,
    get_unreached_questions,
    complete_session
)

def test_ground_truth_ledger():
    print("--- Running test_ground_truth_ledger ---")
    
    # 1. Create a 3-question blueprint
    bp = InterviewBlueprint(
        blueprint_id="bp_test_ledger",
        company="Uber",
        role="Backend Engineer",
        seniority="Senior",
        keywords=["Kafka", "Postgres", "Redis"],
        rounds=["System Design"],
        questions=[
            BlueprintQuestion(
                id="q_01",
                text="How do you partition geospatial ride requests in real time?",
                competency="Geospatial Sharding",
                category="system_design",
                assertions=[
                    BinaryAssertion(name="geohash", weight=0.4, description="Cites H3 or Geohash spatial index"),
                    BinaryAssertion(name="sharding", weight=0.3, description="Explains sharding by city or quadtree bucket"),
                    BinaryAssertion(name="hotspots", weight=0.3, description="Handles airport surge hotspots")
                ],
                model_answer="Uber uses H3 hexagonal hierarchical spatial indexes..."
            ),
            BlueprintQuestion(
                id="q_02",
                text="How would you design idempotency for driver billing deductions?",
                competency="Financial Transaction Consistency",
                category="architecture",
                assertions=[
                    BinaryAssertion(name="idempotency_key", weight=0.4, description="Uses unique idempotency token"),
                    BinaryAssertion(name="acid", weight=0.3, description="Explains transactional isolation"),
                    BinaryAssertion(name="retries", weight=0.3, description="Safely handles network timeouts")
                ],
                model_answer="Use unique client request tokens stored in Postgres with unique constraints..."
            ),
            BlueprintQuestion(
                id="q_03",
                text="Planned question that the candidate NEVER reaches because time ran out.",
                competency="Unreached Competency",
                category="architecture",
                assertions=[],
                model_answer="..."
            )
        ]
    )

    # 2. Start session
    session = create_session(bp)
    sid = session.session_id

    # 3. Candidate answers Q1
    record_turn(
        session_id=sid,
        question_id="q_01",
        question_text=bp.questions[0].text,
        candidate_transcript="We can use Uber's H3 hierarchical hexagonal spatial index to shard drivers by cell. For hotspots like airports, we sub-divide dynamically.",
        audio_duration_ms=8500,
        interviewer_reply="Good. Now let's move to driver payouts.",
        action="advance_question"
    )

    # 4. Candidate answers Q2
    record_turn(
        session_id=sid,
        question_id="q_02",
        question_text=bp.questions[1].text,
        candidate_transcript="We generate a UUID idempotency key on the mobile client. The payments service inserts this in a Postgres table with a UNIQUE constraint within an ACID transaction.",
        audio_duration_ms=9200,
        interviewer_reply="Understood.",
        action="advance_question"
    )

    # 5. An accidental empty turn (e.g. mic cough or background noise)
    record_turn(
        session_id=sid,
        question_id="q_03",
        question_text=bp.questions[2].text,
        candidate_transcript="uh...",
        audio_duration_ms=1000,
        interviewer_reply="",
        action="nudge"
    )

    complete_session(sid)

    # 6. Verify mathematical guarantees
    verified = get_verified_turns(sid)
    unreached = get_unreached_questions(sid)

    # Verified MUST contain exactly 2 questions (q_01, q_02), NOT q_03!
    assert len(verified) == 2, f"Expected exactly 2 verified turns, got {len(verified)}"
    assert verified[0].question_id == "q_01"
    assert verified[1].question_id == "q_02"
    assert all(turn.question_id != "q_03" for turn in verified), "CRITICAL: Phantom question q_03 leaked into verified turns!"

    # Unreached MUST identify q_03
    assert len(unreached) == 1, f"Expected 1 unreached question, got {len(unreached)}"
    assert unreached[0].id == "q_03"

    print(f"[OK] Ground Truth Verified: {len(verified)} turns evaluated, {len(unreached)} unreached questions isolated.")
    print(f"[OK] Phantom questions mathematically impossible by construction.")

if __name__ == "__main__":
    test_ground_truth_ledger()
    print("ALL LEDGER TESTS PASSED! [OK]")
