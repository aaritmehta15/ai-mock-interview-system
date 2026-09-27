"""
agent.py

DAAZLING LiveKit Python Voice Agent Worker
Connects real-time WebRTC audio streams to Gemini Multimodal Realtime Voice API
and logs every audible turn to the append-only Turn Ledger.
"""
import asyncio
import logging
import os
import sys
from dotenv import load_dotenv

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

load_dotenv()
logger = logging.getLogger("daazling.agent")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
)
from livekit.plugins.google.beta import realtime
from livekit.plugins import deepgram, silero, openai
from services.ledger_service import ledger_service
from services.blueprint_service import get_blueprint, InterviewBlueprint
from orchestrator.personas import (
    get_persona,
    compile_persona_instructions,
    PersonaProfile,
    ALEX_EMPATHETIC_LEAD,
)

def build_system_instructions(bp: InterviewBlueprint = None, persona: PersonaProfile = None) -> str:
    """Build grounded, persona-steered system prompt from active Blueprint."""
    active_persona = persona or ALEX_EMPATHETIC_LEAD
    if bp:
        return compile_persona_instructions(active_persona, bp)

    return f"""
{active_persona.system_tone_prompt}

You are DAAZLING, an expert AI Technical Interviewer represented by {active_persona.name}, {active_persona.title} ({active_persona.archetype}).
Conduct a structured technical interview assessing systems and architecture.
Ask questions one at a time. Keep spoken turns concise (under 40 words).
""".strip()

async def entrypoint(ctx: JobContext):
    logger.info("[agent] Worker joining job %s in room %s", ctx.job.id, ctx.room.name)
    await ctx.connect()

    session_id = ctx.room.name
    bp = None
    try:
        bp = get_blueprint(session_id)
        if bp:
            logger.info("[agent] Loaded active blueprint for session %s: %s questions", session_id, len(bp.questions))
        else:
            logger.info("[agent] No pre-registered blueprint found for session %s; using standard engineering prompt", session_id)
    except Exception as e:
        logger.warning("[agent] Error looking up blueprint for session %s: %s", session_id, e)

    # Determine persona from room metadata or fallback to Alex
    persona_id = "alex"
    try:
        if ctx.room.metadata:
            import json
            meta = json.loads(ctx.room.metadata)
            persona_id = meta.get("persona_id", "alex")
    except Exception:
        pass

    persona = get_persona(persona_id)
    logger.info("[agent] Active persona configured: %s (%s) with difficulty=%s", persona.name, persona.title, persona.difficulty)
    instructions = build_system_instructions(bp, persona)

    voice_map = {
        "alex": "Puck",
        "marcus": "Charon",
        "priya": "Aoede",
    }
    voice = voice_map.get(persona_id, "Puck")

    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    deepgram_key = os.getenv("DEEPGRAM_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")

    # Priority 1: Gemini Multimodal Live API (Direct Realtime Audio-to-Audio)
    if gemini_key:
        logger.info("[agent] Initializing Gemini Multimodal Realtime Voice Model (default model, voice=%s)...", voice)
        try:
            model = realtime.RealtimeModel(
                api_key=gemini_key,
                voice=voice,
                instructions=instructions,
            )
            agent = Agent(instructions=instructions)
            session = AgentSession(llm=model)
            logger.info("[agent] Gemini Realtime model initialized successfully.")
        except Exception as e:
            logger.error("[agent] Gemini model init FAILED: %s — falling back to Groq.", e)
            gemini_key = None  # force fallback below

    if not gemini_key:
        if groq_key:
            logger.info("[agent] Using Groq LLM pipeline (STT=deepgram or none, LLM=groq).")
            groq_llm = openai.LLM(
                base_url="https://api.groq.com/openai/v1",
                api_key=groq_key,
                model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            )
            if deepgram_key:
                stt = deepgram.STT()
                tts = deepgram.TTS()
                vad = silero.VAD.load()
                agent = Agent(instructions=instructions)
                session = AgentSession(stt=stt, vad=vad, llm=groq_llm, tts=tts)
            else:
                # Groq only — no TTS available, but at least the LLM responds via text
                logger.warning("[agent] No DEEPGRAM_API_KEY — agent will respond but may not speak audio.")
                vad = silero.VAD.load()
                agent = Agent(instructions=instructions)
                session = AgentSession(vad=vad, llm=groq_llm)
        else:
            raise ValueError("No valid AI key found. Set GEMINI_API_KEY (starts with AIza) or GROQ_API_KEY in Render Environment.")

    # ─────────────────────────────────────────────────────────────────────────
    # Transcript & Turn Ledger Synchronization
    # ─────────────────────────────────────────────────────────────────────────
    @session.on("user_input_transcribed")
    def on_user_transcription(event):
        transcript = getattr(event, "transcript", "").strip()
        is_final = getattr(event, "is_final", False)
        if transcript and is_final:
            logger.info("[ledger] Candidate speech finalized (%d chars): %s", len(transcript), transcript[:60])
            ledger_service.record_turn(
                session_id=session_id,
                speaker="candidate",
                role="candidate",
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
                    logger.info("[ledger] Interviewer turn recorded: %s...", text[:60])
                    ledger_service.record_turn(
                        session_id=session_id,
                        speaker="interviewer",
                        role="interviewer",
                        text=text.strip(),
                        confidence=1.0,
                    )

    # Start session on room
    await session.start(agent=agent, room=ctx.room)
    logger.info("[agent] Session started successfully in room %s", ctx.room.name)

    # Wait for first human participant and welcome them
    participant = await ctx.wait_for_participant()
    logger.info("[agent] Participant joined: %s (%s)", participant.identity, participant.name)

    # Send warm opening greeting
    # NOTE: session.say() and session.generate_reply() return SpeechHandle (not coroutines)
    # You must call them without await, then await the handle to wait for completion.
    greeting_text = (
        f"Hi {participant.name or 'there'}! I'm {persona.name}, {persona.title}. "
        "Welcome to your technical session. Whenever you're ready, let me know and we'll dive right into our first question."
    )
    try:
        handle = session.say(greeting_text)
        await handle
        logger.info("[agent] Greeting delivered successfully.")
    except Exception as e:
        logger.error("[agent] session.say() failed: %s — trying generate_reply()", e)
        try:
            handle = session.generate_reply(
                user_input="The candidate has entered the room. Greet them warmly and introduce the first question."
            )
            await handle
        except Exception as e2:
            logger.error("[agent] generate_reply() also failed: %s", e2)

    logger.info("[agent] Ready and listening for candidate voice stream...")

def main():
    """CLI launcher for LiveKit worker."""
    url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            ws_url=url,
            api_key=api_key,
            api_secret=api_secret,
        )
    )

if __name__ == "__main__":
    main()
