
"""
services/chat_service.py

Conversational Interview Service:
Provides real-time interactive turn-by-turn mock interview progression.
Coordinates:
  - Personalized Persona opening greetings
  - Sequential progression through Calibrated Blueprint Questions (1 through 6)
  - Candidate introduction handling
  - Socratic follow-ups and persona-specific behavioral steering
  - Real-time persistence to the Append-Only SQLite Turn Ledger
  - Natural interview conclusion
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any, Dict, List, Optional
from groq import AsyncGroq
from dotenv import load_dotenv

from backend.models.schemas import (
    InterviewBlueprint,
    PersonaProfile,
    TurnEvent,
    TurnSpeaker,
)
from backend.services.blueprint_service import (
    get_blueprint,
    build_fallback_blueprint,
    save_blueprint,
)
from backend.services.ledger_service import ledger_service
from backend.orchestrator.personas import (
    get_persona,
    compile_persona_instructions,
    ALEX_EMPATHETIC_LEAD,
)
from backend.orchestrator.sweet_spot import ConversationalActionTracker

load_dotenv()
logger = logging.getLogger("interview.chat_service")

_DEFAULT_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
_groq_api_key = os.getenv("GROQ_API_KEY")
_groq_client = AsyncGroq(api_key=_groq_api_key, max_retries=1) if _groq_api_key else None


def _contains_devanagari(text: str) -> bool:
    """Returns True if text contains characters in the Devanagari Unicode block."""
    return bool(re.search(r'[\u0900-\u097f]', text))


def _clean_speech_text(text: str) -> str:
    """Basic cleanup for speech-to-text transcripts."""
    if not text:
        return ""
    clean = text.strip()
    # Normalize excessive spaces
    clean = re.sub(r'\s+', ' ', clean)
    return clean


async def start_interview_session(
    session_id: str,
    persona_id: str = "alex",
    company: Optional[str] = None,
    role: Optional[str] = None,
    seniority: Optional[str] = None,
    participant_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Initializes an interview session and delivers the persona's opening greeting.
    Ensures the greeting is recorded in the SQLite Turn Ledger as turn #1.
    """
    persona = get_persona(persona_id)
    bp = get_blueprint(session_id)
    
    resolved_company = company or (bp.company if bp else "") or "Google"
    resolved_role = role or (bp.role if bp else "") or "Staff Distributed Systems Engineer"
    resolved_seniority = seniority or (
        bp.seniority.value if bp and hasattr(bp.seniority, "value") else str(bp.seniority) if bp else ""
    ) or "Staff"

    if not bp:
        bp = build_fallback_blueprint(resolved_company, resolved_role, resolved_seniority)
        save_blueprint(session_id, bp)

    # Clean role title with seniority
    clean_level = resolved_seniority.split("/")[0].strip() if "/" in resolved_seniority else resolved_seniority.strip()
    if re.search(rf"\b{re.escape(clean_level)}\b", resolved_role, re.IGNORECASE):
        calibrated_role_title = resolved_role
    elif clean_level.lower() in ["mid-level", "mid"]:
        calibrated_role_title = resolved_role
    else:
        calibrated_role_title = f"{clean_level} {resolved_role}"

    display_name = (participant_name or "there").strip()
    greeting_prefix = f"Hi {display_name}!" if display_name and display_name.lower() != "there" else "Hi there!"

    greeting_text = (
        f"{greeting_prefix} I'm {persona.name}, {persona.title} at {resolved_company}. "
        f"Welcome to your technical interview for the {calibrated_role_title} position. "
        "To get started, could you briefly introduce yourself and share a bit about your background?"
    )

    # Check if greeting was already recorded to avoid duplicate entries on reconnect
    existing_turns = ledger_service.get_session_turns(session_id)
    if not existing_turns:
        ledger_service.record_turn(
            session_id=session_id,
            speaker=TurnSpeaker.INTERVIEWER,
            text=greeting_text,
            question_index=0,
            confidence=1.0,
        )
        ledger_service.upsert_session(
            session_id=session_id,
            company=resolved_company,
            role=calibrated_role_title,
            seniority=resolved_seniority,
            persona_id=persona.id,
        )

    first_q = bp.questions[0] if bp.questions else None

    return {
        "session_id": session_id,
        "interviewer_text": greeting_text,
        "stage": "intro",
        "question_index": 0,
        "current_question_text": "Candidate Introduction",
        "next_question_preview": first_q.text if first_q else None,
        "is_finished": False,
        "persona": persona.model_dump(),
        "total_questions": len(bp.questions),
        "blueprint_questions_count": len(bp.questions),
    }


async def process_turn(
    session_id: str,
    candidate_text: str,
    persona_id: str = "alex",
) -> Dict[str, Any]:
    """
    Processes a candidate turn:
    1. Records candidate speech in SQLite Turn Ledger.
    2. Determines conversation stage (Introduction vs Blueprint Questions 1-6 vs Wrap-up).
    3. Prompts the selected AI Persona via Groq with conversation context.
    4. Records the interviewer response in SQLite Turn Ledger.
    5. Returns the response with updated question state.
    """
    clean_text = _clean_speech_text(candidate_text)
    if not clean_text:
        return {
            "session_id": session_id,
            "interviewer_text": "Take your time. Whenever you're ready, walk me through your thoughts.",
            "stage": "listening",
            "question_index": 0,
            "is_finished": False,
        }

    persona = get_persona(persona_id)
    bp = get_blueprint(session_id) or build_fallback_blueprint("Technology Firm", "Software Engineer")
    questions = bp.questions or []
    total_q_count = len(questions)

    # Retrieve existing turns BEFORE recording candidate turn to check stage
    prior_turns = ledger_service.get_session_turns(session_id)
    candidate_turns_count = sum(1 for t in prior_turns if t.speaker == TurnSpeaker.CANDIDATE)

    # Determine which question this candidate turn is answering
    # If candidate_turns_count == 0, this turn is the Candidate's Introduction!
    # If candidate_turns_count == 1, answering Question 1 (idx 0), and so on.
    answering_q_idx = candidate_turns_count

    # Record candidate turn in the ledger
    ledger_service.record_turn(
        session_id=session_id,
        speaker=TurnSpeaker.CANDIDATE,
        text=clean_text,
        question_index=answering_q_idx,
        confidence=1.0,
    )

    # Determine what question the interviewer should deliver NEXT
    # If answering_q_idx == 0: candidate just introduced themselves -> next is Question 1 (idx 0)
    # If answering_q_idx == 1: candidate answered Q1 -> next is Question 2 (idx 1)
    # ...
    # If answering_q_idx >= total_q_count: all questions completed -> conclude!
    is_intro_turn = (answering_q_idx == 0)
    is_final_turn = (answering_q_idx >= total_q_count)
    next_q_idx = min(total_q_count, answering_q_idx + 1) if not is_intro_turn else 1

    clean_level = bp.seniority.value if hasattr(bp.seniority, "value") else str(bp.seniority)
    system_prompt = compile_persona_instructions(persona, bp, bp.role, clean_level)

    # Build messages history for LLM
    all_turns = ledger_service.get_session_turns(session_id)
    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

    # Append recent conversation history (up to last 10 turns)
    recent_turns = all_turns[-10:] if len(all_turns) > 10 else all_turns
    for t in recent_turns:
        role = "assistant" if t.speaker == TurnSpeaker.INTERVIEWER else "user"
        messages.append({"role": role, "content": t.text})

    # Add specific guidance depending on stage
    if is_intro_turn:
        first_q = questions[0] if questions else None
        first_q_text = first_q.text if first_q else "How do you evaluate architectural trade-offs in distributed systems?"
        messages.append({
            "role": "system",
            "content": (
                f"Candidate just introduced themselves. "
                f"1. Acknowledge their background in ONE brief sentence matching your persona ({persona.name}). "
                f"2. Transition directly into Question 1: \"{first_q_text}\". "
                f"Keep total response strictly under 35 words."
            )
        })
    elif is_final_turn:
        messages.append({
            "role": "system",
            "content": (
                f"The candidate has answered all interview questions. "
                f"Deliver a professional closing statement thanking them for their time and concluding the interview. "
                f"Do not ask any further technical questions. Keep it strictly under 30 words."
            )
        })
    else:
        # Intermediate question turn
        target_q = questions[answering_q_idx] if answering_q_idx < total_q_count else None
        next_q = questions[answering_q_idx] if answering_q_idx < total_q_count else None
        
        # Check for Conversational Action Triggers (Escalation Probe, Doubt, Nudge)
        probe = ConversationalActionTracker.should_escalate_probe(clean_text, persona)
        doubt = ConversationalActionTracker.should_doubt(clean_text, persona)

        if probe and answering_q_idx < total_q_count - 1:
            guidance = (
                f"Candidate answered. Acknowledge their point in one phrase, then challenge them with this follow-up probe: "
                f"\"{probe}\" Keep strictly under 30 words."
            )
        elif doubt and answering_q_idx < total_q_count - 1:
            guidance = (
                f"Candidate made an absolute statement. Challenge their conviction: "
                f"\"{doubt}\" Keep strictly under 30 words."
            )
        else:
            q_num = answering_q_idx + 1
            guidance = (
                f"Candidate answered the previous question. "
                f"1. Provide a brief 1-sentence reaction matching your persona ({persona.name}). "
                f"2. Deliver Question {q_num}: \"{next_q.text if next_q else ''}\". "
                f"Keep your entire turn strictly under 35 words."
            )

        messages.append({"role": "system", "content": guidance})

    # Call Groq LLM
    try:
        res = await _groq_client.chat.completions.create(
            model=_DEFAULT_MODEL,
            messages=messages,
            max_tokens=140,
            temperature=0.3,
        )
        interviewer_reply = res.choices[0].message.content.strip()
    except Exception as e:
        logger.error("[chat_service] Groq chat generation error: %s", e)
        if is_intro_turn:
            first_q_text = questions[0].text if questions else "Let's begin with our first question."
            interviewer_reply = f"Thanks for the introduction! Great to meet you. Let's begin: {first_q_text}"
        elif is_final_turn:
            interviewer_reply = "Thank you for working through these technical challenges today. That wraps up our interview session. Have a great day!"
        else:
            current_q = questions[answering_q_idx] if answering_q_idx < total_q_count else None
            interviewer_reply = f"Understood. Let's move to our next problem: {current_q.text if current_q else 'Can you walk me through your design approach?'}"

    # Record interviewer turn in the ledger
    ledger_service.record_turn(
        session_id=session_id,
        speaker=TurnSpeaker.INTERVIEWER,
        text=interviewer_reply,
        question_index=answering_q_idx if is_intro_turn else next_q_idx,
        confidence=1.0,
    )

    stage = "concluded" if is_final_turn else ("intro_ack" if is_intro_turn else "question")
    current_q_text = (
        "Session Concluded" if is_final_turn else (
            questions[answering_q_idx].text if (not is_intro_turn and answering_q_idx < total_q_count) else
            (questions[0].text if questions else "")
        )
    )

    return {
        "session_id": session_id,
        "interviewer_text": interviewer_reply,
        "stage": stage,
        "question_index": next_q_idx,
        "total_questions": total_q_count,
        "current_question_text": current_q_text,
        "is_finished": is_final_turn,
    }
