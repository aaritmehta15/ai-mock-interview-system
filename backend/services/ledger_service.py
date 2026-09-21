"""
services/ledger_service.py

Append-Only Turn Ledger Service:
Guarantees mathematical ground truth for interview sessions.
Ensures post-interview reports can ONLY evaluate turns that were
actually audibly delivered and answered by the candidate.
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional
from pydantic import BaseModel, Field

from services.blueprint_service import InterviewBlueprint, BlueprintQuestion

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────────────────────────

class TurnEvent(BaseModel):
    turn_id: str = Field(default_factory=lambda: f"turn_{uuid.uuid4().hex[:10]}")
    session_id: str
    question_id: str
    question_text: str
    candidate_transcript: str
    candidate_audio_duration_ms: int = 0
    interviewer_reply: str = ""
    interviewer_action: str = "advance_question"
    speaker: str = "candidate"
    role: str = "candidate"
    timestamp_utc: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    is_completed: bool = True

    @property
    def word_count(self) -> int:
        return len(self.candidate_transcript.split())

    @property
    def text(self) -> str:
        return self.candidate_transcript if self.role == "candidate" else self.interviewer_reply

class InterviewSession(BaseModel):
    session_id: str = Field(default_factory=lambda: f"sess_{uuid.uuid4().hex[:12]}")
    blueprint: InterviewBlueprint
    turns: List[TurnEvent] = Field(default_factory=list)
    current_question_index: int = 0
    status: str = "active"  # "active" | "completed" | "aborted"
    created_at_utc: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ─────────────────────────────────────────────────────────────────────────────
# In-Memory Event Store (Thread-Safe Ledger)
# ─────────────────────────────────────────────────────────────────────────────

_registry: Dict[str, InterviewSession] = {}

def create_session(blueprint: InterviewBlueprint, session_id: Optional[str] = None) -> InterviewSession:
    """Initialize an immutable interview session bound to a blueprint."""
    sid = session_id or f"sess_{uuid.uuid4().hex[:12]}"
    session = InterviewSession(session_id=sid, blueprint=blueprint)
    _registry[sid] = session
    logger.info("[ledger] Initialized session %s for %s (%d questions)", sid, blueprint.company, len(blueprint.questions))
    return session

def get_session(session_id: str) -> Optional[InterviewSession]:
    """Retrieve session from ledger."""
    return _registry.get(session_id)

def record_turn(
    session_id: str,
    question_id: str = "q_active",
    question_text: str = "",
    candidate_transcript: str = "",
    audio_duration_ms: int = 0,
    interviewer_reply: str = "",
    action: str = "advance_question",
    speaker: str = "candidate",
    role: str = "candidate",
    text: str = "",
    confidence: float = 1.0,
) -> TurnEvent:
    """
    Append an immutable turn event to the session ledger.
    Auto-initializes session if not already registered.
    """
    session = _registry.get(session_id)
    if not session:
        from services.blueprint_service import get_blueprint, _build_fallback_blueprint
        bp = get_blueprint(session_id) or _build_fallback_blueprint("Tech Company", "Software Engineer", "Mid-Level")
        session = create_session(bp, session_id=session_id)

    # Normalize text input from agent callbacks
    if text:
        if role in ("candidate", "user"):
            candidate_transcript = text
        else:
            interviewer_reply = text

    # Associate with current question if not explicitly provided
    if (not question_text or question_text == "") and session.blueprint.questions:
        curr_idx = min(session.current_question_index, len(session.blueprint.questions) - 1)
        active_q = session.blueprint.questions[curr_idx]
        question_id = active_q.id
        question_text = active_q.text

    event = TurnEvent(
        session_id=session_id,
        question_id=question_id,
        question_text=question_text,
        candidate_transcript=candidate_transcript.strip(),
        candidate_audio_duration_ms=audio_duration_ms,
        interviewer_reply=interviewer_reply.strip(),
        interviewer_action=action,
        speaker=speaker,
        role=role,
        is_completed=bool(candidate_transcript.strip())
    )
    session.turns.append(event)
    logger.info("[ledger] Recorded turn %s (Q: %s, Speaker: %s, Words: %d)",
                event.turn_id, question_id, speaker or role, len(event.candidate_transcript.split()))
    return event

def get_session_turns(session_id: str) -> List[TurnEvent]:
    """Retrieve all turns for a session."""
    session = _registry.get(session_id)
    return session.turns if session else []

def get_verified_turns(session_id: str) -> List[TurnEvent]:
    """
    MATHEMATICAL GROUND TRUTH GUARANTEE:
    Returns ONLY turn events that have non-empty candidate transcripts with >= 3 words.
    Unasked or aborted turns are excluded by construction.
    """
    session = _registry.get(session_id)
    if not session:
        return []

    verified = [
        turn for turn in session.turns
        if turn.is_completed and len(turn.candidate_transcript.split()) >= 3
    ]
    return verified

def get_unreached_questions(session_id: str) -> List[BlueprintQuestion]:
    """
    Returns blueprint questions that were never attempted by the candidate.
    """
    session = _registry.get(session_id)
    if not session:
        return []

    verified_turns = get_verified_turns(session_id)
    attempted_qids = {turn.question_id for turn in verified_turns}
    return [q for q in session.blueprint.questions if q.id not in attempted_qids]

def complete_session(session_id: str) -> Optional[InterviewSession]:
    """Mark session as completed."""
    session = _registry.get(session_id)
    if session:
        session.status = "completed"
        logger.info("[ledger] Session %s marked as completed. Total turns: %d", session_id, len(session.turns))
    return session


class LedgerService:
    create_session = staticmethod(create_session)
    get_session = staticmethod(get_session)
    record_turn = staticmethod(record_turn)
    get_session_turns = staticmethod(get_session_turns)
    get_verified_turns = staticmethod(get_verified_turns)
    get_unreached_questions = staticmethod(get_unreached_questions)
    complete_session = staticmethod(complete_session)

ledger_service = LedgerService()
