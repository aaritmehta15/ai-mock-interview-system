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
import sys
from typing import Optional
from dotenv import load_dotenv

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


def build_system_instructions(
    bp: Optional[InterviewBlueprint] = None,
    persona: Optional[PersonaProfile] = None,
) -> str:
    """Build grounded, persona-calibrated system prompt from active Blueprint."""
    active_persona = persona or ALEX_EMPATHETIC_LEAD
    active_bp = bp or build_fallback_blueprint("Technology Firm", "Software Engineer")
    return compile_persona_instructions(active_persona, active_bp)


async def entrypoint(ctx: JobContext):
    logger.info("[agent] Worker connecting to room: %s (Job ID: %s)", ctx.room.name, ctx.job.id)
    await ctx.connect()

    session_id = ctx.room.name
    bp = get_blueprint(session_id)
    if not bp:
        logger.info("[agent] No pre-registered blueprint found for session %s; using calibrated fallback", session_id)
        bp = build_fallback_blueprint("Technology Firm", "Software Engineer")

    # Determine persona from participant metadata.
    # The token endpoint stores persona_id in the participant JWT (.with_metadata()),
    # NOT in room metadata — so we must read it from the participant, not ctx.room.metadata.
    persona_id = "alex"
    try:
        # First try room metadata (may be set in some deployments)
        if ctx.room.metadata:
            meta = json.loads(ctx.room.metadata)
            persona_id = meta.get("persona_id", "alex")
        # Then check all current participants' metadata (the real source)
        for p in ctx.room.remote_participants.values():
            if p.metadata:
                try:
                    pmeta = json.loads(p.metadata)
                    pid = pmeta.get("persona_id", "")
                    if pid:
                        persona_id = pid
                        break
                except Exception:
                    pass
        logger.info("[agent] Resolved persona_id='%s' from participant metadata", persona_id)
    except Exception as e:
        logger.warning("[agent] Metadata parse failed: %s; using default persona", e)

    persona = get_persona(persona_id)
    logger.info(
        "[agent] Active persona: %s (%s) | Voice: %s | Max Words: %d",
        persona.name, persona.title, persona.voice_model, persona.max_words,
    )

    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    # ─────────────────────────────────────────────────────────────────────────
    # Build greeting — embedded directly into system instructions so Gemini
    # Live delivers it as its FIRST utterance via generate_reply().
    # ─────────────────────────────────────────────────────────────────────────
    greeting_text = (
        f"Hi there! I'm {persona.name}, {persona.title}. "
        "Welcome to your technical interview session with Apex. "
        f"{persona.signature_phrase} "
        "Whenever you're ready, let me know and we'll dive right into our first question."
    )

    # Inject the greeting as the literal first turn in the system instructions.
    # This ensures Gemini Live speaks it as part of session setup — zero latency
    # waiting for a user turn to trigger the first response.
    instructions = build_system_instructions(bp, persona)
    instructions_with_greeting = (
        instructions
        + f"\n\n---\nSESSION START: When the session begins, your VERY FIRST spoken output must be exactly:\n\"{greeting_text}\"\nThen wait for the candidate to respond."
    )

    # ─────────────────────────────────────────────────────────────────────────
    # Primary Voice Pipeline: Gemini Multimodal Live API
    # Using gemini-live-2.5-flash-native-audio — the fastest LiveAPI model.
    # ─────────────────────────────────────────────────────────────────────────
    if not gemini_key:
        raise ValueError("GEMINI_API_KEY is required. Set it in backend/.env.")

    logger.info("[agent] Initializing Gemini Multimodal Live API (model=gemini-live-2.5-flash-native-audio, voice=%s)...", persona.voice_model)

    model = realtime.RealtimeModel(
        api_key=gemini_key,
        model="gemini-2.5-flash-native-audio-preview-12-2025",  # fastest Gemini API native audio model
        voice=persona.voice_model,
        instructions=instructions_with_greeting,
        # Tune endpointing for lower latency:
        # Shorter silence detection = faster response after candidate stops talking
    )
    agent = Agent(instructions=instructions_with_greeting)
    session = AgentSession(
        llm=model,
        # Tighten endpointing: respond after 400ms silence instead of 800ms default
        min_endpointing_delay=0.3,
        max_endpointing_delay=0.6,
    )
    logger.info("[agent] Gemini Multimodal Live model ready.")

    # ─────────────────────────────────────────────────────────────────────────
    # Real-Time Ledger Synchronization Hooks
    # ─────────────────────────────────────────────────────────────────────────
    @session.on("user_input_transcribed")
    def on_user_transcription(event):
        transcript = getattr(event, "transcript", "").strip()
        is_final = getattr(event, "is_final", False)
        if transcript and is_final:
            word_count = len(transcript.split())
            logger.info("[ledger] Candidate speech recorded (%d words)", word_count)
            ledger_service.record_turn(
                session_id=session_id,
                speaker=TurnSpeaker.CANDIDATE,
                text=transcript,
                confidence=1.0,
            )

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

    # ─────────────────────────────────────────────────────────────────────────
    # Autonomous Opening Greeting: Interviewer ALWAYS speaks first.
    # With RealtimeModel, session.say() requires a TTS model — instead we use
    # generate_reply() which triggers Gemini Live to produce the first spoken
    # response immediately, delivering the greeting from the instructions.
    # ─────────────────────────────────────────────────────────────────────────
    participant = None
    if ctx.room.remote_participants:
        participant = next(iter(ctx.room.remote_participants.values()))
        logger.info("[agent] Found existing participant in room: %s", participant.identity)
    else:
        logger.info("[agent] Awaiting candidate connection...")
        participant = await ctx.wait_for_participant()
        logger.info("[agent] Candidate connected: %s", participant.identity)

    # Brief 300ms grace sleep (reduced from 500ms) to allow WebRTC audio negotiation
    await asyncio.sleep(0.3)

    logger.info("[agent] Triggering autonomous opening greeting as %s...", persona.name)
    try:
        handle = session.generate_reply(
            user_input="Session started. Begin the interview with your opening greeting now.",
        )
        await handle
        logger.info("[agent] Autonomous opening greeting delivered successfully.")
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
