"""
services/chat_service.py

Conversational Interview Service:
Provides real-time interactive turn-by-turn mock interview progression.
Coordinates:
  - Personalized Persona opening greetings
  - Sequential progression through Calibrated Blueprint Questions (1 through 6)
  - Candidate introduction handling
  - Socratic Clarification & Constraint Hints (without burning turns or advancing question index)
  - Candidate Code/Architecture Scratchpad evaluation
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


_WHISPER_HALLUCINATIONS = {
    "thank you",
    "thank you.",
    "thank you very much",
    "thank you very much.",
    "thank you so much",
    "thank you so much.",
    "thanks for watching",
    "thanks for watching.",
    "thank you for watching",
    "thank you for watching.",
    "subtitles by",
    "subtitles by the amara.org community",
    "please subscribe",
    "subscribe to my channel",
    "bye",
    "bye.",
    "silence",
    "audio",
}

_TRIVIAL_FILLERS = {
    "thank you", "thanks", "thank you so much", "okay", "ok", "yes", "got it", "i see", "sure", "alright", "yeah", "uh", "um"
}


def _contains_devanagari(text: str) -> bool:
    """Returns True if text contains characters in the Devanagari Unicode block."""
    return bool(re.search(r'[\u0900-\u097f]', text))


def _clean_speech_text(text: str) -> str:
    """Cleans speech-to-text transcripts and filters out Whisper silence hallucinations."""
    if not text:
        return ""
    clean = text.strip()
    clean = re.sub(r'\s+', ' ', clean)
    norm = re.sub(r"[^\w\s]", "", clean.lower()).strip()
    if norm in _WHISPER_HALLUCINATIONS:
        return ""
    if any(norm.startswith(h) for h in ["thanks for watching", "thank you for watching", "subtitles by"]):
        return ""
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
            turn_type="greeting",
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
    turn_type: str = "answer",
    code_snippet: Optional[str] = None,
    wpm: Optional[float] = None,
    filler_count: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Processes a candidate turn:
    1. Records candidate speech in SQLite Turn Ledger.
    2. Determines conversation stage (Introduction vs Blueprint Questions 1-6 vs Wrap-up vs Clarification).
    3. Handles Socratic Clarification & Constraint Hints WITHOUT burning turns or advancing question index.
    4. Evaluates Candidate Code/Architecture Scratchpad alongside spoken audio.
    5. Prompts the selected AI Persona via Groq with conversation context.
    6. Records the interviewer response in SQLite Turn Ledger.
    7. Returns the response with updated question state.
    """
    clean_text = _clean_speech_text(candidate_text)
    if not clean_text and not (code_snippet and code_snippet.strip()):
        if turn_type == "clarification":
            clean_text = "Could you give me a hint or clarify the constraints for this question?"
        else:
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
    candidate_answers_count = sum(1 for t in prior_turns if t.speaker == TurnSpeaker.CANDIDATE and t.turn_type == "answer")
    answering_q_idx = candidate_answers_count

    clean_level = bp.seniority.value if hasattr(bp.seniority, "value") else str(bp.seniority)
    system_prompt = compile_persona_instructions(persona, bp, bp.role, clean_level)

    # ─── CASE A: Socratic Clarification / Constraint Hint ────────────────────────
    if turn_type == "clarification":
        active_q_idx = max(0, answering_q_idx - 1) if answering_q_idx > 0 else 0
        active_q = questions[active_q_idx] if (questions and active_q_idx < total_q_count) else None
        active_q_num = active_q_idx + 1
        active_q_text = active_q.text if active_q else "the current problem requirements"

        logger.info("[chat_service] Clarification requested on Q%d for session %s", active_q_num, session_id)

        # Record candidate clarification turn
        ledger_service.record_turn(
            session_id=session_id,
            speaker=TurnSpeaker.CANDIDATE,
            text=clean_text or "Could you clarify the constraints or give a hint?",
            question_index=active_q_num,
            role="clarification",
            confidence=1.0,
            turn_type="clarification",
            code_snippet=code_snippet,
            wpm=wpm,
            filler_count=filler_count,
        )

        # Prompt LLM for Socratic Hint
        clarification_messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
        recent_turns = prior_turns[-6:] if len(prior_turns) > 6 else prior_turns
        for t in recent_turns:
            role = "assistant" if t.speaker == TurnSpeaker.INTERVIEWER else "user"
            clarification_messages.append({"role": role, "content": t.text})

        if code_snippet and code_snippet.strip():
            clarification_messages.append({
                "role": "system",
                "content": f"[Candidate Code Scratchpad]:\n```{code_snippet.strip()}```\nCandidate is asking about their written code or architecture."
            })

        clarification_messages.append({
            "role": "system",
            "content": (
                f"The candidate is asking for clarification or a constraint hint on Question {active_q_num}: \"{active_q_text}\". "
                f"Candidate's question: \"{clean_text}\". "
                f"As {persona.name}, provide a helpful, Socratic hint or clarify problem constraints "
                f"WITHOUT revealing the complete algorithmic solution or writing the code for them. Keep it strictly under 35 words. "
                f"Conclude by asking them how they'd approach Question {active_q_num}."
            )
        })

        try:
            res = await _groq_client.chat.completions.create(
                model=_DEFAULT_MODEL,
                messages=clarification_messages,
                max_tokens=140,
                temperature=0.3,
            )
            interviewer_reply = res.choices[0].message.content.strip()
        except Exception as e:
            logger.error("[chat_service] Groq clarification error: %s", e)
            interviewer_reply = "Think about the data scale and edge cases like duplicates or concurrent writes. How does that guide your design?"

        # Record interviewer hint turn without incrementing question index
        ledger_service.record_turn(
            session_id=session_id,
            speaker=TurnSpeaker.INTERVIEWER,
            text=interviewer_reply,
            question_index=active_q_num,
            role="interviewer_hint",
            confidence=1.0,
            turn_type="clarification",
        )

        return {
            "session_id": session_id,
            "interviewer_text": interviewer_reply,
            "stage": "clarification",
            "question_index": answering_q_idx,
            "total_questions": total_q_count,
            "current_question_text": active_q_text,
            "is_finished": False,
        }

    # ─── CASE B: Standard Technical Answer Turn ──────────────────────────────────
    # Guard against trivial fillers burning technical question turns
    norm_text = re.sub(r"[^\w\s]", "", clean_text.lower()).strip()
    if norm_text in _TRIVIAL_FILLERS and answering_q_idx > 0 and not (code_snippet and code_snippet.strip()):
        current_q = questions[answering_q_idx - 1] if (answering_q_idx - 1 < total_q_count) else None
        logger.info("[chat_service] Candidate sent filler phrase '%s' on Q%d; holding question without advance", clean_text, answering_q_idx)
        return {
            "session_id": session_id,
            "interviewer_text": "Take your time to structure your thoughts. Whenever you're ready, walk me through your technical approach.",
            "stage": "in_progress",
            "question_index": answering_q_idx,
            "current_question_text": current_q.text if current_q else None,
            "is_finished": False,
        }

    # Record candidate turn in the ledger
    ledger_service.record_turn(
        session_id=session_id,
        speaker=TurnSpeaker.CANDIDATE,
        text=clean_text,
        question_index=answering_q_idx,
        confidence=1.0,
        turn_type="answer",
        code_snippet=code_snippet,
        wpm=wpm,
        filler_count=filler_count,
    )

    is_intro_turn = (answering_q_idx == 0)
    is_final_turn = (answering_q_idx >= total_q_count)
    next_q_idx = min(total_q_count, answering_q_idx + 1) if not is_intro_turn else 1

    next_to_deliver_q = questions[answering_q_idx] if answering_q_idx < total_q_count else None
    next_q_num = answering_q_idx + 1

    # Build messages history for LLM
    all_turns = ledger_service.get_session_turns(session_id)
    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

    recent_turns = all_turns[-10:] if len(all_turns) > 10 else all_turns
    for t in recent_turns:
        role = "assistant" if t.speaker == TurnSpeaker.INTERVIEWER else "user"
        messages.append({"role": role, "content": t.text})

    # Inject candidate code snippet if present
    if code_snippet and code_snippet.strip():
        messages.append({
            "role": "system",
            "content": f"[Candidate Code / Scratchpad]:\n```{code_snippet.strip()}```\nCandidate submitted this code snippet alongside their spoken explanation. Directly evaluate their code implementation, syntax, or architecture diagram in your reaction."
        })

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
        probe = ConversationalActionTracker.should_escalate_probe(clean_text, persona)
        doubt = ConversationalActionTracker.should_doubt(clean_text, persona)

        if probe and answering_q_idx < total_q_count - 1:
            guidance = (
                f"Candidate answered Question {answering_q_idx}. Acknowledge their point in one phrase, then challenge them with this follow-up probe: "
                f"\"{probe}\" Keep strictly under 30 words."
            )
        elif doubt and answering_q_idx < total_q_count - 1:
            guidance = (
                f"Candidate made an absolute statement on Question {answering_q_idx}. Challenge their conviction: "
                f"\"{doubt}\" Keep strictly under 30 words."
            )
        else:
            guidance = (
                f"Candidate answered Question {answering_q_idx}. "
                f"1. Provide a brief 1-sentence reaction matching your persona ({persona.name}). "
                f"2. Deliver Question {next_q_num}: \"{next_to_deliver_q.text if next_to_deliver_q else ''}\". "
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
        turn_type="answer",
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
