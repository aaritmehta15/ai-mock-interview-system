"""
main.py — Voice Mock Interview System (Module 2 standalone)

Module 2: Voice Mock Interview System
  - POST /interview/scrape-questions  → scrape + AI-generate question bank
  - POST /interview/chat              → AI interviewer turn
  - POST /interview/summary           → post-interview analysis

Auth model (Firebase-native):
  - User signs in via Firebase Auth → Google Sign-In popup on the frontend.
  - Firebase returns a Google OAuth access token.
  - Frontend sends it to every API call as:
        Authorization: Bearer <google_access_token>

Run:
    uvicorn main:app --reload

Docs:
    http://localhost:8000/docs
"""
from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from config import APP_ENV, LOG_LEVEL

# ─── Module 2: Voice Interview imports ───────────────────────────────────────
from scraper import scrape_questions
from interviewer import chat as interview_chat, generate_summary
from services import firebase_service
from services.blueprint_service import generate_blueprint, extract_text_from_pdf, InterviewBlueprint
from livekit import api as livekit_api
from utils.date_utils import today_utc
import os

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[START] Voice Mock Interview System starting (env=%s)", APP_ENV)
    yield
    logger.info("[STOP] Shutting down.")


# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Voice Mock Interview System",
    description=(
        "**Module 2 — Voice Mock Interview System**\n"
        "POST /interview/scrape-questions → POST /interview/chat → POST /interview/summary"
    ),
    version="2.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Root — redirect to docs instead of 404
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")


# ─────────────────────────────────────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health", summary="Health check", tags=["System"])
async def health() -> dict:
    return {
        "status": "ok",
        "module": "voice-interview",
        "version": "2.1.0",
    }


# ─────────────────────────────────────────────────────────────────────────────
# LiveKit WebRTC & Blueprint Gateway Endpoints
# ─────────────────────────────────────────────────────────────────────────────

class TokenRequest(BaseModel):
    room_name: str
    participant_name: str
    identity: Optional[str] = None

class TokenResponse(BaseModel):
    token: str
    url: str

class BlueprintRequest(BaseModel):
    company: str
    role: str
    seniority: str = "Mid-Level"
    resume_text: str = ""
    jd_text: str = ""

@app.post(
    "/api/token",
    response_model=TokenResponse,
    summary="Generate LiveKit WebRTC Room Access Token",
    tags=["LiveKit WebRTC Gateway"],
)
async def generate_livekit_token(req: TokenRequest):
    url = os.getenv("LIVEKIT_URL", "")
    api_key = os.getenv("LIVEKIT_API_KEY", "")
    api_secret = os.getenv("LIVEKIT_API_SECRET", "")

    if not url or not api_key or not api_secret:
        raise HTTPException(
            status_code=500,
            detail="LiveKit credentials (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) not configured.",
        )

    identity = req.identity or f"cand_{req.participant_name.lower().replace(' ', '_')}_{os.urandom(3).hex()}"
    
    token = (
        livekit_api.AccessToken(api_key, api_secret)
        .with_identity(identity)
        .with_name(req.participant_name)
        .with_grants(
            livekit_api.VideoGrants(
                room_join=True,
                room=req.room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .to_jwt()
    )

    return TokenResponse(token=token, url=url)


@app.post(
    "/api/blueprint",
    response_model=InterviewBlueprint,
    summary="Generate immutable Interview Blueprint from resume & JD",
    tags=["LiveKit WebRTC Gateway"],
)
async def create_blueprint_endpoint(req: BlueprintRequest):
    try:
        bp = await generate_blueprint(
            company=req.company,
            role=req.role,
            resume_text=req.resume_text,
            jd_text=req.jd_text,
            seniority=req.seniority,
        )
        return bp
    except Exception as e:
        logger.error("[blueprint] Error generating blueprint: %s", e)
        raise HTTPException(status_code=500, detail=str(e))



# ─────────────────────────────────────────────────────────────────────────────
# Module 2 — Voice Mock Interview System
# ─────────────────────────────────────────────────────────────────────────────

# ── Pydantic models ──────────────────────────────────────────────────────────

class ScrapeRequest(BaseModel):
    company: str
    role: str

class ScrapeResponse(BaseModel):
    questions: list[str]
    source: str
    count: int


class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    history: list[ChatMessage]
    user_message: str
    company: str
    role: str
    questions: list[str]
    asked_questions: list[str] = []   # track what's been asked to prevent repeats

class DimensionScore(BaseModel):
    score: int = 0
    evidence: str = ""
    note: str = ""

class FeedbackDetail(BaseModel):
    # Core fields — always present (backward-compatible with frontend)
    good: str = ""
    missing: str = ""
    improve: str = ""
    # Dimension scores from Layer 4 evaluation rubric (new)
    technical_accuracy: Optional[DimensionScore] = None
    depth: Optional[DimensionScore] = None
    communication: Optional[DimensionScore] = None
    completeness: Optional[DimensionScore] = None

class ChatResponse(BaseModel):
    reply: str
    feedback: Optional[FeedbackDetail] = None
    next_question: str
    # New fields from 6-layer architecture (ignored by old frontend code)
    probe_followup: Optional[str] = None
    interview_stage: Optional[str] = None


class ImprovementArea(BaseModel):
    area: str
    advice: str

class QuestionReview(BaseModel):
    model_config = {"protected_namespaces": ()}
    question: str
    score: int
    what_was_good: str
    what_was_missing: str
    model_answer_hint: str
    # New evidence fields from two-pass summary architecture
    competency_tested: Optional[str] = None
    key_evidence: Optional[str] = None
    scores: Optional[dict] = None

class SummaryRequest(BaseModel):
    user_id: str = "anonymous"
    history: list[ChatMessage]
    company: str
    role: str
    questions_asked: list[str]

class SummaryResponse(BaseModel):
    overall_score: int
    overall_verdict: str
    strengths: list[str]
    weaknesses: list[str]
    improvement_areas: list[ImprovementArea]
    question_reviews: list[QuestionReview]
    final_recommendation: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post(
    "/interview/scrape-questions",
    response_model=ScrapeResponse,
    summary="Scrape & generate interview questions for a company/role",
    tags=["Voice Interview"],
    status_code=status.HTTP_200_OK,
)
async def interview_scrape_endpoint(req: ScrapeRequest):
    """
    Scrapes DuckDuckGo / Bing / Google for real interview questions for the
    given company and role, then refines + supplements them via Groq.

    Call this first to get the question bank before starting `/interview/chat`.
    """
    if not req.company.strip():
        raise HTTPException(status_code=400, detail="company cannot be empty")
    if not req.role.strip():
        raise HTTPException(status_code=400, detail="role cannot be empty")
    result = await scrape_questions(req.company.strip(), req.role.strip())
    return ScrapeResponse(**result)


@app.post(
    "/interview/chat",
    response_model=ChatResponse,
    summary="Send a candidate answer and receive AI interviewer feedback + next question",
    tags=["Voice Interview"],
    status_code=status.HTTP_200_OK,
)
async def interview_chat_endpoint(req: ChatRequest):
    """
    Powers the real-time mock interview loop.

    - `history` — full conversation so far (excluding the system prompt)
    - `user_message` — candidate's latest answer
    - `asked_questions` — questions already covered (prevents repeats)

    Returns `reply` (Alex's response), `feedback` (structured critique),
    and `next_question` (empty string when all questions are exhausted).
    """
    if not req.user_message.strip():
        raise HTTPException(status_code=400, detail="user_message cannot be empty")
    if not req.questions:
        raise HTTPException(
            status_code=400,
            detail="questions array cannot be empty — call /interview/scrape-questions first",
        )

    history_dicts = [msg.model_dump() for msg in req.history]

    try:
        result = await interview_chat(
            history=history_dicts,
            user_message=req.user_message.strip(),
            company=req.company,
            role=req.role,
            questions=req.questions,
            asked_questions=req.asked_questions,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return ChatResponse(**result)


@app.post(
    "/interview/summary",
    response_model=SummaryResponse,
    summary="Generate a detailed post-interview analysis",
    tags=["Voice Interview"],
    status_code=status.HTTP_200_OK,
)
async def interview_summary_endpoint(req: SummaryRequest):
    """
    Generate a detailed post-interview analysis from the full conversation
    history. Call this when the interview ends.

    Returns overall score, strengths, weaknesses, etc.
    Persists the score to the user's performance history in Firebase.
    """
    if len([m for m in req.history if m.role != "system"]) < 2:
        raise HTTPException(
            status_code=400,
            detail="Not enough interview data to generate a summary.",
        )

    history_dicts = [msg.model_dump() for msg in req.history]

    try:
        result = await generate_summary(
            history=history_dicts,
            company=req.company,
            role=req.role,
            questions_asked=req.questions_asked,
        )

        # Persist the score for performance tracking
        try:
            await firebase_service.log_performance_score(
                req.user_id, today_utc().isoformat(), result["overall_score"]
            )
        except Exception as e:
            logger.warning("Failed to log interview score to performance history: %s", e)

    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return SummaryResponse(**result)


# ─────────────────────────────────────────────────────────────────────────────
# Global exception handler
# ─────────────────────────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Any, exc: Exception) -> JSONResponse:
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    logger.exception("Unhandled exception on %s: %s", request.url, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred."},
    )
