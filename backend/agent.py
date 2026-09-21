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
from services.ledger_service import ledger_service
from services.blueprint_service import get_blueprint, InterviewBlueprint

def build_system_instructions(bp: InterviewBlueprint = None) -> str:
    """Build grounded, role-specific system prompt from the active Interview Blueprint."""
    if not bp:
        return (
            "You are DAAZLING, an expert AI Technical Interviewer at a premier technology company. "
            "Your demeanor is calm, encouraging, and rigorous. "
            "Conduct a structured technical interview. Ask questions one at a time. "
            "Listen closely to the candidate's answers, acknowledge them concisely, and ask thoughtful follow-ups "
            "if an answer is too brief or misses key architectural trade-offs."
        )

    q_list = "\n".join([f"{i+1}. {q.text} (Competency: {q.competency})" for i, q in enumerate(bp.questions)])
    kw_list = ", ".join(bp.keywords) if bp.keywords else "System Architecture, Data Structures, Scalability"

    return f"""You are DAAZLING, an expert AI Technical Interviewer conducting a {bp.seniority} {bp.role} interview for {bp.company}.
Your goal is to thoroughly assess the candidate's engineering depth and communication skills while keeping the conversation natural, encouraging, and realistic.

BLUEPRINT QUESTIONS TO COVER:
{q_list}

KEY TECHNICAL DOMAINS & KEYWORDS:
{kw_list}

INTERVIEW BEHAVIOR GUIDELINES:
1. Greet the candidate warmly and introduce yourself as DAAZLING, their technical interviewer for today.
2. Introduce Question 1 first. Let them answer fully before moving forward.
3. If their answer is vague or misses core trade-offs, ask a single targeted follow-up probe.
4. If their answer is thorough, acknowledge it with a brief encouraging remark and transition smoothly to the next question.
5. NEVER monologue. Keep your conversational responses concise (1 to 3 sentences maximum) before turning the floor back to the candidate.
6. Maintain a supportive yet rigorous tone throughout.
"""

async def entrypoint(ctx: JobContext):
    logger.info("[agent] Worker joining job %s in room %s", ctx.job.id, ctx.room.name)
    await ctx.connect()

    session_id = ctx.room.name
    bp = get_blueprint(session_id)
    if bp:
        logger.info("[agent] Loaded active blueprint for session %s: %s questions", session_id, len(bp.questions))
    else:
        logger.info("[agent] No pre-registered blueprint found for session %s; using standard engineering prompt", session_id)

    instructions = build_system_instructions(bp)
    gemini_key = os.getenv("GEMINI_API_KEY")
    deepgram_key = os.getenv("DEEPGRAM_API_KEY")

    # Priority 1: Gemini Multimodal Live API (Direct Realtime Audio-to-Audio)
    if gemini_key:
        logger.info("[agent] Initializing Gemini Multimodal Realtime Voice Model...")
        from livekit.plugins.google.beta import realtime
        model = realtime.RealtimeModel(
            api_key=gemini_key,
            voice="Puck",
            instructions=instructions,
        )
        agent = Agent(instructions=instructions, llm=model)
        session = AgentSession(llm=model)
    elif deepgram_key:
        # Fallback: Deepgram STT + Groq LLM + Deepgram TTS
        logger.info("[agent] Initializing Deepgram STT + Groq LLM + Deepgram TTS pipeline...")
        from livekit.plugins import deepgram, silero, openai
        groq_llm = openai.LLM(
            base_url="https://api.groq.com/openai/v1",
            api_key=os.getenv("GROQ_API_KEY"),
            model=os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b"),
        )
        stt = deepgram.STT()
        tts = deepgram.TTS()
        vad = silero.VAD.load()
        agent = Agent(instructions=instructions, llm=groq_llm, stt=stt, tts=tts, vad=vad)
        session = AgentSession(stt=stt, vad=vad, llm=groq_llm, tts=tts)
    else:
        raise ValueError("Neither GEMINI_API_KEY nor DEEPGRAM_API_KEY found in environment.")

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
    session.start(agent, room=ctx.room)
    logger.info("[agent] Session started successfully in room %s", ctx.room.name)

    # Wait for first human participant and welcome them
    participant = await ctx.wait_for_participant()
    logger.info("[agent] Participant joined: %s (%s)", participant.identity, participant.name)
    
    # Send warm opening greeting
    greeting_text = (
        f"Hi {participant.name or 'there'}! Welcome to your interview. I'm DAAZLING, your AI interviewer. "
        "Whenever you're ready, let me know and we'll dive right into the first question."
    )
    try:
        await session.say(greeting_text)
    except Exception as e:
        logger.warning("[agent] session.say greeting notice: %s; using generate_reply", e)
        try:
            await session.generate_reply(user_input="The candidate has entered the room. Greet them warmly and introduce the first question.")
        except Exception as e2:
            logger.error("[agent] Greeting trigger error: %s", e2)

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
