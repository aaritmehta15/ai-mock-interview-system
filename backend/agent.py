"""
agent.py

LiveKit Real-Time Voice Agent Worker:
Connects full-duplex WebRTC audio streams to Google Gemini Multimodal Live API
(with high-velocity Groq Llama-3.3-70b fallback).
Autonomously initiates interview by greeting first as the selected persona.
Enforces thread-based execution to prevent Linux memory bloat.
Logs all spoken exchanges to the Append-Only SQLite Turn Ledger.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from dotenv import load_dotenv

# Ensure repository root is on sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

load_dotenv()
logger = logging.getLogger("interview.agent")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

from livekit import rtc
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


def build_system_instructions(bp: Optional[InterviewBlueprint] = None, persona: Optional[PersonaProfile] = None) -> str:
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

    # Determine persona from room metadata (defaulting safely to Alex)
    persona_id = "alex"
    try:
        if ctx.room.metadata:
            meta = json.loads(ctx.room.metadata)
            persona_id = meta.get("persona_id", "alex")
    except Exception as e:
        logger.warning("[agent] Metadata parse failed: %s; using default persona", e)

    persona = get_persona(persona_id)
    logger.info("[agent] Active persona: %s (%s) | Voice: %s | Max Words: %d",
                persona.name, persona.title, persona.voice_model, persona.max_words)
    instructions = build_system_instructions(bp, persona)

    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")

    # ─────────────────────────────────────────────────────────────────────────
    # Primary Voice Pipeline: Gemini Multimodal Live API (Direct Audio-to-Audio)
    # ─────────────────────────────────────────────────────────────────────────
    model = None
    if gemini_key:
        logger.info("[agent] Initializing Gemini Multimodal Live API (Voice=%s)...", persona.voice_model)
        try:
            model = realtime.RealtimeModel(
                api_key=gemini_key,
                voice=persona.voice_model,
                instructions=instructions,
            )
            agent = Agent(instructions=instructions)
            session = AgentSession(llm=model)
            logger.info("[agent] Gemini Multimodal Live model ready.")
        except Exception as e:
            logger.error("[agent] Gemini Live initialization failed: %s — falling back to Groq.", e)
            gemini_key = None

    # Fallback Pipeline: Groq Llama-3.3-70b (sub-400ms TTFT)
    if not gemini_key:
        if not groq_key:
            raise ValueError("No valid AI API key found. Please provide GEMINI_API_KEY or GROQ_API_KEY in backend/.env.")
        
        from livekit.plugins import deepgram, silero, openai
        logger.info("[agent] Initializing Groq Fallback Pipeline (LLM=llama-3.3-70b-versatile)...")
        groq_llm = openai.LLM(
            base_url="https://api.groq.com/openai/v1",
            api_key=groq_key,
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        )
        vad = silero.VAD.load()
        deepgram_key = os.getenv("DEEPGRAM_API_KEY")
        if deepgram_key:
            stt = deepgram.STT()
            tts = deepgram.TTS()
            agent = Agent(instructions=instructions)
            session = AgentSession(stt=stt, vad=vad, llm=groq_llm, tts=tts)
        else:
            agent = Agent(instructions=instructions)
            session = AgentSession(vad=vad, llm=groq_llm)

    # ─────────────────────────────────────────────────────────────────────────
    # Real-Time Ledger Synchronization Hooks
    # ─────────────────────────────────────────────────────────────────────────
    @session.on("user_input_transcribed")
    def on_user_transcription(event):
        transcript = getattr(event, "transcript", "").strip()
        is_final = getattr(event, "is_final", False)
        if transcript and is_final:
            logger.info("[ledger] Candidate speech recorded (%d words): %s", len(transcript.split()), transcript[:60])
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
                    logger.info("[ledger] Interviewer spoken turn recorded: %s", text[:60])
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
    # Autonomous Opening Greeting: Interviewer ALWAYS speaks first
    # ─────────────────────────────────────────────────────────────────────────
    # Check if participant is already connected, or await incoming participant
    participant = None
    if ctx.room.remote_participants:
        participant = next(iter(ctx.room.remote_participants.values()))
        logger.info("[agent] Found existing participant in room: %s (%s)", participant.identity, participant.name)
    else:
        logger.info("[agent] Awaiting candidate connection...")
        participant = await ctx.wait_for_participant()
        logger.info("[agent] Candidate connected: %s (%s)", participant.identity, participant.name)

    # Brief 500ms grace sleep to allow candidate WebRTC audio playback track to negotiate
    await asyncio.sleep(0.5)

    greeting_text = (
        f"Hi {participant.name or 'there'}! I'm {persona.name}, {persona.title}. "
        "Welcome to your technical session. Whenever you're ready, let me know and we'll dive right into our first question."
    )

    try:
        logger.info("[agent] Delivering autonomous opening greeting as %s...", persona.name)
        handle = session.say(greeting_text)
        await handle
        logger.info("[agent] Autonomous opening greeting delivered successfully.")
    except Exception as e:
        logger.error("[agent] session.say() greeting failed: %s — trying generate_reply fallback", e)
        try:
            handle = session.generate_reply(
                user_input="The candidate has entered the room. Greet them warmly and introduce the first question."
            )
            await handle
        except Exception as e2:
            logger.error("[agent] generate_reply fallback failed: %s", e2)

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
        )
    )


if __name__ == "__main__":
    main()
