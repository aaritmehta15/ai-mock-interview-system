"""
agent.py

LiveKit Real-Time Voice Agent Worker:
Connects full-duplex WebRTC audio streams to Google Gemini Multimodal Live API.
Autonomously initiates interview by greeting first as the selected persona.
Enforces thread-based execution to prevent Linux memory bloat.
Logs all spoken exchanges to the Append-Only SQLite Turn Ledger.

Performance fixes applied:
  - Pre-warm all slow imports at module load time (anyio, numpy, ssl) to prevent
    event-loop blocking stalls (828ms+ stalls observed in logs).
  - Gemini Live session uses generate_reply() for the greeting (say() requires TTS
    model; RealtimeModel does not provide a separate TTS pipeline).
  - RealtimeModel configured with fastest available model and endpointing tuned for
    low-latency turn detection.
"""
from __future__ import annotations

# ── Pre-warm imports that block the event loop on first use ────────────────────
# These imports trigger slow native library loading. Doing them at module level
# means the cost is paid at startup, not during a live audio session.
import ssl as _ssl_prewarm
try:
    _ssl_prewarm.create_default_context()  # forces SSL context construction once
except Exception:
    pass

import anyio  # noqa: F401 — forces anyio._core._sockets import before the loop runs
try:
    import numpy.fft  # noqa: F401 — forces numpy FFT native extension load
except ImportError:
    pass
# ──────────────────────────────────────────────────────────────────────────────

import asyncio
import json
import logging
import os
import re
import sys
from typing import Optional
from dotenv import load_dotenv
import groq
from google.genai import types as genai_types

# Ensure repository root is on sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

load_dotenv()
logger = logging.getLogger("interview.agent")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    encoding="utf-8",  # prevents UnicodeEncodeError on non-Latin transcripts
)

from livekit import rtc  # noqa: F401 — keep for type-checking downstream
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobExecutorType,
    WorkerOptions,
    cli,
)
from livekit.plugins.google.beta import realtime

from backend.models.schemas import InterviewBlueprint, PersonaProfile, TurnSpeaker
from backend.services.blueprint_service import get_blueprint, build_fallback_blueprint
from backend.services.ledger_service import ledger_service
from backend.orchestrator.personas import (
    ALEX_EMPATHETIC_LEAD,
    compile_persona_instructions,
    get_persona,
)


_groq_client = groq.Client(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None


def _contains_devanagari(text: str) -> bool:
    """Returns True if text contains characters in the Devanagari Unicode block (Hindi script)."""
    return bool(re.search(r'[\u0900-\u097f]', text))


def _normalize_speech_to_english(text: str) -> str:
    """
    Guarantees English output: If automated speech recognition phonetically transcribed
    accented English into Devanagari Hindi script, cleans it back into exact English words.
    """
    if not _contains_devanagari(text) or not _groq_client:
        return text
    try:
        prompt = (
            f'The candidate spoke English in an interview, but automated speech-to-text phonetically '
            f'transcribed it into Devanagari Hindi script:\n"{text}"\n'
            f'Convert this back into clean, exact English words representing what the candidate spoke. '
            f'Output ONLY the English transcription without any additional explanation, notes, or quotes.'
        )
        res = _groq_client.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b"),
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=200,
        )
        clean = res.choices[0].message.content.strip().strip('"')
        if clean and not _contains_devanagari(clean):
            logger.info("[stt-sanitizer] Cleaned Devanagari ASR to English: '%s' -> '%s'", text[:50], clean[:50])
            return clean
    except Exception as e:
        logger.warning("[stt-sanitizer] Normalization error: %s", e)
    return text


def build_system_instructions(
    bp: Optional[InterviewBlueprint] = None,
    persona: Optional[PersonaProfile] = None,
    calibrated_role: Optional[str] = None,
    seniority_name: Optional[str] = None,
) -> str:
    """Build grounded, persona-calibrated system prompt from active Blueprint."""
    active_persona = persona or ALEX_EMPATHETIC_LEAD
    active_bp = bp or build_fallback_blueprint("Technology Firm", "Software Engineer", "Staff")
    return compile_persona_instructions(active_persona, active_bp, calibrated_role, seniority_name)


async def entrypoint(ctx: JobContext):
    logger.info("[agent] Worker connecting to room: %s (Job ID: %s)", ctx.room.name, ctx.job.id)
    await ctx.connect()

    session_id = ctx.room.name

    # If candidate hasn't arrived yet, await their connection so participant metadata is populated
    if not ctx.room.remote_participants:
        logger.info("[agent] Awaiting candidate connection for room %s...", session_id)
        await ctx.wait_for_participant()
        logger.info("[agent] Candidate joined room %s", session_id)

    # Determine persona, company, role, and seniority from participant and room metadata
    persona_id = "alex"
    company_from_meta = ""
    role_from_meta = ""
    seniority_from_meta = ""
    try:
        # Check room metadata
        if ctx.room.metadata:
            meta = json.loads(ctx.room.metadata)
            persona_id = meta.get("persona_id", persona_id)
            company_from_meta = meta.get("company", "")
            role_from_meta = meta.get("role", "")
            seniority_from_meta = meta.get("seniority", "")
        # Check participant metadata (the primary source from JWT token)
        for p in ctx.room.remote_participants.values():
            if p.metadata:
                try:
                    pmeta = json.loads(p.metadata)
                    pid = pmeta.get("persona_id", "")
                    if pid:
                        persona_id = pid
                    if pmeta.get("company"):
                        company_from_meta = pmeta.get("company")
                    if pmeta.get("role"):
                        role_from_meta = pmeta.get("role")
                    if pmeta.get("seniority"):
                        seniority_from_meta = pmeta.get("seniority")
                    if pid:
                        break
                except Exception:
                    pass
        logger.info("[agent] Resolved metadata: persona='%s', company='%s', role='%s', seniority='%s'",
                    persona_id, company_from_meta, role_from_meta, seniority_from_meta)
    except Exception as e:
        logger.warning("[agent] Metadata parse failed: %s; using defaults", e)

    bp = get_blueprint(session_id)
    if not bp:
        logger.info("[agent] No pre-registered blueprint for session %s; using calibrated fallback", session_id)
        bp = build_fallback_blueprint(
            company_from_meta or "Technology Firm",
            role_from_meta or "Software Engineer",
            seniority_from_meta or "Staff",
        )

    persona = get_persona(persona_id)
    company_name = bp.company or company_from_meta or "our engineering team"
    base_role_name = bp.role or role_from_meta or "Software Engineer"
    seniority_name = (
        seniority_from_meta
        or (bp.seniority.value if hasattr(bp.seniority, "value") else str(bp.seniority))
        or "Staff"
    )

    # Calibrate role title with seniority (e.g. "Staff AI Infrastructure Engineer", "Senior Backend Engineer")
    clean_level = seniority_name.split("/")[0].strip() if "/" in seniority_name else seniority_name.strip()
    if re.search(rf"\b{re.escape(clean_level)}\b", base_role_name, re.IGNORECASE):
        calibrated_role_title = base_role_name
    elif clean_level.lower() in ["mid-level", "mid"]:
        calibrated_role_title = base_role_name
    else:
        calibrated_role_title = f"{clean_level} {base_role_name}"

    logger.info(
        "[agent] Active persona: %s (%s) | Company: %s | Role: %s | Level: %s | Voice: %s | Max Words: %d",
        persona.name, persona.title, company_name, calibrated_role_title, seniority_name, persona.voice_model, persona.max_words,
    )

    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not gemini_key:
        raise ValueError("GEMINI_API_KEY is required. Set it in backend/.env.")

    # ─────────────────────────────────────────────────────────────────────────
    # Stage 1 Opening Greeting: Professional introduction + asks candidate to introduce themselves
    # ─────────────────────────────────────────────────────────────────────────
    greeting_text = (
        f"Hi there! I'm {persona.name}, {persona.title} at {company_name}. "
        f"Welcome to your technical interview for the {calibrated_role_title} position. "
        "To get started, could you briefly introduce yourself and share a bit about your background?"
    )

    instructions = build_system_instructions(bp, persona, calibrated_role_title, seniority_name)
    instructions_with_greeting = (
        instructions
        + f"\n\n---\nSESSION START: When the session begins, your VERY FIRST spoken output must be exactly:\n\"{greeting_text}\"\nThen wait for the candidate to introduce themselves."
    )

    # Technical vocabulary biasing to boost English ASR accuracy for candidate speech
    vocab = [
        "HNSW", "ANN", "WebSocket", "WebSockets", "Kafka", "Redis",
        "load balancer", "backpressure", "stateless", "Kubernetes",
        "gRPC", "RPC", "sharding", "replication", "partitioning",
        "consistency", "throughput", "latency",
    ]
    if bp.keywords:
        vocab.extend(bp.keywords)

    input_audio_transcription = genai_types.AudioTranscriptionConfig(
        language_codes=["en-US", "en"],
        custom_vocabulary=vocab[:50],
    )

    logger.info("[agent] Initializing Gemini Multimodal Live API (model=gemini-2.5-flash-native-audio-preview-12-2025, voice=%s, language=en-US)...", persona.voice_model)

    model = realtime.RealtimeModel(
        api_key=gemini_key,
        model="gemini-2.5-flash-native-audio-preview-12-2025",
        voice=persona.voice_model,
        instructions=instructions_with_greeting,
        language="en-US",
        input_audio_transcription=input_audio_transcription,
    )
    agent = Agent(instructions=instructions_with_greeting)
    session = AgentSession(
        llm=model,
        # 0.8s minimum gives candidates time to pause and structure complex technical responses without being interrupted
        min_endpointing_delay=0.8,
        max_endpointing_delay=2.5,
    )
    logger.info("[agent] Gemini Multimodal Live model ready.")

    # ─────────────────────────────────────────────────────────────────────────
    # Real-Time Ledger Synchronization Hooks (with English Normalization Guard)
    # ─────────────────────────────────────────────────────────────────────────
    @session.on("user_input_transcribed")
    def on_user_transcription(event):
        transcript = getattr(event, "transcript", "").strip()
        is_final = getattr(event, "is_final", False)
        if transcript and is_final:
            async def _process_candidate_turn(raw_text: str):
                clean_text = raw_text
                if _contains_devanagari(raw_text) and _groq_client:
                    try:
                        clean_text = await asyncio.to_thread(_normalize_speech_to_english, raw_text)
                    except Exception as err:
                        logger.warning("[stt-sanitizer] Background normalization failed: %s", err)
                word_count = len(clean_text.split())
                logger.info("[ledger] Candidate speech recorded (%d words): %s", word_count, clean_text[:80])
                ledger_service.record_turn(
                    session_id=session_id,
                    speaker=TurnSpeaker.CANDIDATE,
                    text=clean_text,
                    confidence=1.0,
                )
            asyncio.create_task(_process_candidate_turn(transcript))

    @session.on("conversation_item_added")
    def on_conversation_item(event):
        item = getattr(event, "item", None)
        if item:
            role = getattr(item, "role", "")
            text = getattr(item, "text_content", "") or getattr(item, "content", "")
            if isinstance(text, str) and text.strip():
                if role in ("assistant", "agent"):
                    logger.info("[ledger] Interviewer spoken turn recorded (%d words)", len(text.split()))
                    ledger_service.record_turn(
                        session_id=session_id,
                        speaker=TurnSpeaker.INTERVIEWER,
                        text=text.strip(),
                        confidence=1.0,
                    )

    # Start session on WebRTC room
    await session.start(agent=agent, room=ctx.room)
    logger.info("[agent] WebRTC session active in room %s", ctx.room.name)

    # Brief 300ms grace sleep to allow WebRTC audio negotiation
    await asyncio.sleep(0.3)

    logger.info("[agent] Triggering autonomous opening greeting as %s (%s at %s)...", persona.name, calibrated_role_title, company_name)
    try:
        handle = session.generate_reply(
            user_input="Session started. Begin the interview with your opening greeting now.",
        )
        await asyncio.wait_for(handle, timeout=12.0)
        logger.info("[agent] Autonomous opening greeting delivered successfully.")
    except asyncio.TimeoutError:
        logger.warning("[agent] Opening greeting timed out after 12s; continuing to listen for candidate audio.")
    except Exception as e:
        logger.error("[agent] generate_reply greeting failed: %s", e)

    logger.info("[agent] Listening for candidate audio stream...")


def main():
    """CLI launcher for LiveKit agent worker."""
    url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            job_executor_type=JobExecutorType.THREAD,
            ws_url=url,
            api_key=api_key,
            api_secret=api_secret,
            # Pre-warm the agent process so imports don't block on first job
            prewarm_fnc=_prewarm,
        )
    )


def _prewarm(proc):
    """Pre-warm the agent process: trigger all slow imports before the first job."""
    logger.info("[agent] Pre-warming imports...")
    try:
        import numpy.fft  # noqa: F401
        import anyio  # noqa: F401
        import ssl
        ssl.create_default_context()
        logger.info("[agent] Pre-warm complete.")
    except Exception as e:
        logger.warning("[agent] Pre-warm partial failure (non-fatal): %s", e)


if __name__ == "__main__":
    main()
