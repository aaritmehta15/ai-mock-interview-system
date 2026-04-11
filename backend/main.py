"""
main.py — Unified FastAPI backend

Modules:
  ─ Module 1: Smart Priority Engine (Gmail → Groq → Firestore daily plan)
  ─ Module 2: Voice Mock Interview System (scrape questions → AI interviewer → summary)

Auth model (Firebase-native):
  ─ User signs in via Firebase Auth → Google Sign-In popup on the frontend.
  ─ Firebase returns a Google OAuth access token (user.accessToken).
  ─ Frontend sends it to every API call as:
        Authorization: Bearer <google_access_token>
  ─ This backend reads that header and forwards it to gmail_service, which
    uses it directly against the Gmail REST API.
  ─ If the header is absent, Gmail falls back to the mock email corpus.

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

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import APP_ENV, LOG_LEVEL
from models.schemas import (
    ApplyLink,
    ApplyLinksResponse,
    GeneratePlanResponse,
    LogStudyRequest,
    LogStudyResponse,
    ResumeProfile,
    StudentProfile,
    UpdateProfileRequest,
    UploadResumeResponse,
)
from services import apply_service, firebase_service, planner_service, resume_service, study_service

# ─── Module 2: Voice Interview imports ───────────────────────────────────────
from scraper import scrape_questions
from interviewer import chat as interview_chat, generate_summary

# ─── Module 4-B: Auto Apply Engine imports ────────────────────────────────────
from services import auto_apply_service

# ─── Module 3: Company Intel + Smart Prep Engine imports ──────────────────────
from services import prep_service

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
# Helper — extract Google access token from Authorization header
# ─────────────────────────────────────────────────────────────────────────────

def _extract_bearer_token(request: Request) -> Optional[str]:
    """
    Pull the raw Google OAuth access token from the Authorization header.

    Frontend must send:
        Authorization: Bearer <google_access_token>

    Where <google_access_token> is obtained after Firebase Google Sign-In:
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const accessToken = credential.accessToken;  // send this

    Returns None if the header is missing or malformed.
    """
    auth_header: str = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[len("Bearer "):].strip()
        return token if token else None
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[START] AI Placement Assistant - Module 1 v2 starting (env=%s)", APP_ENV)
    yield
    logger.info("[STOP] Shutting down.")


# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AI Placement Assistant — Smart Priority Engine + Voice Interview",
    description=(
        "**Module 1 — Smart Priority Engine**\n"
        "Auth: Firebase Google Sign-In popup → Google OAuth access token → "
        "Authorization: Bearer header → Gmail REST API.\n"
        "Pipeline: Gmail emails → Groq event extraction → dynamic company tier "
        "(Groq AI) → priority scoring → Groq daily plan → Firebase Firestore persistence.\n\n"
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
    allow_origins=["*"] if APP_ENV == "development" else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health", summary="Health check", tags=["System"])
async def health() -> dict:
    return {
        "status": "ok",
        "modules": ["smart-priority-engine", "voice-interview"],
        "version": "2.1.0",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Auth info (no server-side OAuth flow — Firebase handles everything)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/auth/info", summary="Auth integration guide", tags=["Auth"])
async def auth_info() -> dict:
    """
    Explains how authentication works in this system.
    No server-side OAuth redirect flow is needed — Firebase Auth handles it.
    """
    return {
        "auth_model": "Firebase Google Sign-In (popup)",
        "frontend_steps": [
            "1. import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'",
            "2. const provider = new GoogleAuthProvider()",
            "3. provider.addScope('https://www.googleapis.com/auth/gmail.readonly')",
            "4. const result = await signInWithPopup(auth, provider)",
            "5. const credential = GoogleAuthProvider.credentialFromResult(result)",
            "6. const accessToken = credential.accessToken  // Google OAuth token",
            "7. Send as: Authorization: Bearer <accessToken> on every API request",
        ],
        "backend_behaviour": (
            "If Authorization header is present and valid, real Gmail emails are fetched. "
            "If absent or the token is expired, mock emails are used — "
            "priority scoring and plan generation still work normally."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Core endpoint 1 — GET /generate-plan
# ─────────────────────────────────────────────────────────────────────────────

@app.get(
    "/generate-plan",
    summary="Generate prioritised daily plan",
    tags=["Placement Engine"],
    response_model=GeneratePlanResponse,
    status_code=status.HTTP_200_OK,
)
async def generate_plan(
    request: Request,
    user_id: str = Query(
        default="anonymous",
        description=(
            "Firebase Auth user UID — used to look up Firestore profile and study hours. "
            "Pass the value of auth.currentUser.uid from the frontend."
        ),
        min_length=1,
        max_length=128,
    ),
) -> GeneratePlanResponse:
    """
    Full pipeline:

    **Auth**: Send `Authorization: Bearer <google_access_token>` — the access
    token obtained from `GoogleAuthProvider.credentialFromResult(result).accessToken`
    after Firebase Google Sign-In. Without it, mock emails are used.

    1. Fetch Gmail emails using the Google access token (or mock fallback)
    2. Extract structured events via Groq (concurrent per-email)
    3. Classify company tiers via Groq AI (heuristic fallback if unavailable)
    4. Score & rank events (deterministic priority formula + dynamic bonuses)
    5. Generate hourly daily plan via Groq (deterministic fallback if unavailable)
    6. Persist scored events + plan to Firestore
    7. Return sorted_events + daily_plan JSON
    """
    google_access_token = _extract_bearer_token(request)
    logger.info(
        "GET /generate-plan  user_id=%s  gmail_token=%s",
        user_id,
        "present" if google_access_token else "absent (mock mode)",
    )
    try:
        return await planner_service.generate_plan(
            user_id=user_id,
            google_access_token=google_access_token,
        )
    except Exception as exc:
        logger.exception("Unhandled error in /generate-plan: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate plan. Check server logs.",
        ) from exc


# ─────────────────────────────────────────────────────────────────────────────
# Core endpoint 2 — POST /log-study
# ─────────────────────────────────────────────────────────────────────────────

@app.post(
    "/log-study",
    summary="Log study hours for a date",
    tags=["Placement Engine"],
    response_model=LogStudyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def log_study(body: LogStudyRequest) -> LogStudyResponse:
    """
    Record today's study hours in Firebase.

    Effect on next `/generate-plan` call:
    - `hours == 0` → +3 urgency bonus on all events
    - Any hours logged → removes the no-study bonus
    """
    logger.info(
        "POST /log-study  user_id=%s  date=%s  hours=%.2f",
        body.user_id, body.date, body.hours_studied,
    )
    try:
        await study_service.log_study_hours(body.user_id, body.date, body.hours_studied)
        return LogStudyResponse(
            user_id=body.user_id,
            date=body.date,
            hours_studied=body.hours_studied,
            message=(
                f"Logged {body.hours_studied:.2f} study hours for {body.date}. "
                "Priority scores will update on the next /generate-plan call."
            ),
        )
    except Exception as exc:
        logger.exception("Unhandled error in /log-study: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save study log.") from exc


# ─────────────────────────────────────────────────────────────────────────────
# Student profile endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get(
    "/profile/{user_id}",
    summary="Get student profile",
    tags=["Student Profile"],
    response_model=StudentProfile,
)
async def get_profile(user_id: str) -> StudentProfile:
    """
    Fetch the student profile from Firestore.
    Profile drives the company-match bonus in the priority engine.
    """
    raw = await firebase_service.get_student_profile(user_id)
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No profile for user_id='{user_id}'. "
                "Create one via POST /profile/{user_id}."
            ),
        )
    try:
        return StudentProfile(user_id=user_id, **raw)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Profile parse error: {exc}") from exc


@app.post(
    "/profile/{user_id}",
    summary="Create or update student profile",
    tags=["Student Profile"],
    response_model=StudentProfile,
    status_code=status.HTTP_200_OK,
)
async def upsert_profile(user_id: str, body: UpdateProfileRequest) -> StudentProfile:
    """
    Save or update the student profile in Firestore.

    `targetCompanies` — companies you're targeting. If an email mentions one,
    the event gets a +2 priority bonus.

    `priorityBias` — `high_package` | `learning` | `stability`
    """
    data = body.model_dump()
    data["user_id"] = user_id
    await firebase_service.save_student_profile(user_id, data)
    return StudentProfile(user_id=user_id, **body.model_dump())


# ─────────────────────────────────────────────────────────────────────────────
# Cached plan retrieval
# ─────────────────────────────────────────────────────────────────────────────

@app.get(
    "/plan/{user_id}/{date}",
    summary="Retrieve a cached daily plan",
    tags=["Placement Engine"],
)
async def get_cached_plan(user_id: str, date: str) -> dict:
    """
    Return a previously generated plan from Firestore without re-running
    the full pipeline. Useful for the frontend to reload today's plan.
    """
    plan = await firebase_service.get_daily_plan(user_id, date)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No plan found for user_id='{user_id}' on {date}.",
        )
    return {"user_id": user_id, "date": date, "plan": plan}


# ─────────────────────────────────────────────────────────────────────────────
# Module 4 — Resume upload
# ─────────────────────────────────────────────────────────────────────────────

@app.post(
    "/upload-resume",
    summary="Upload resume (PDF or text) and extract structured profile",
    tags=["Resume & Apply"],
    response_model=UploadResumeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_resume(
    user_id: str = Form(
        ...,
        description="Firebase Auth user UID.",
        min_length=1,
        max_length=128,
    ),
    file: Optional[UploadFile] = File(
        default=None,
        description="PDF resume file (max 5 MB). Provide either this or 'text'.",
    ),
    text: Optional[str] = Form(
        default=None,
        description="Raw resume text. Used if no PDF file is provided.",
    ),
) -> UploadResumeResponse:
    """
    Accepts a PDF **or** raw text resume for a user.

    Pipeline:
    1. Extract text (PyMuPDF → pdfplumber, or use the raw `text` field)
    2. Sanitise + truncate before sending to Groq
    3. Groq parses resume → structured `ResumeProfile`
    4. Profile persisted to `users/{userId}/profile/resume` in Firestore
    5. Structured profile returned in the response

    **File limits**: max 5 MB, PDF only when uploading a file.
    """
    logger.info("POST /upload-resume  user_id=%s  file=%s  text_len=%s",
                user_id,
                file.filename if file else "(none)",
                len(text) if text else 0)

    # ── Validate at least one source provided ────────────────────────────────
    if file is None and not text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either a PDF file upload or a 'text' form field.",
        )

    raw_text: str = ""

    if file is not None:
        # ── Validate file type ───────────────────────────────────────────────
        content_type = (file.content_type or "").lower()
        filename_lower = (file.filename or "").lower()
        if "pdf" not in content_type and not filename_lower.endswith(".pdf"):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Only PDF files are accepted. Send 'text' field for plain text resumes.",
            )

        # ── Validate file size (5 MB) ────────────────────────────────────────
        MAX_BYTES = 5 * 1024 * 1024
        pdf_bytes = await file.read()
        if len(pdf_bytes) > MAX_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds maximum allowed size of 5 MB (got {len(pdf_bytes) / 1024:.1f} KB).",
            )

        try:
            raw_text = resume_service.extract_text_from_pdf(pdf_bytes)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(exc),
            ) from exc
    else:
        raw_text = text  # type: ignore[assignment]

    if not raw_text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract any text from the provided input.",
        )

    # ── Sanitise ─────────────────────────────────────────────────────────────
    clean_text = resume_service.sanitize_resume_text(raw_text)

    # ── Parse with Groq ───────────────────────────────────────────────────────
    parsed = await resume_service.parse_resume_with_groq(clean_text)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Resume parsing via Groq failed. Check GROQ_API_KEY and retry.",
        )

    # ── Store in Firebase ─────────────────────────────────────────────────────
    await resume_service.save_resume_profile(user_id, parsed)

    try:
        profile_model = ResumeProfile(**parsed)
    except Exception as exc:
        logger.warning("ResumeProfile coercion warning: %s — returning raw dict.", exc)
        profile_model = ResumeProfile.model_validate(parsed)

    return UploadResumeResponse(
        user_id=user_id,
        profile=profile_model,
        message=(
            f"Resume parsed and saved for user '{user_id}'. "
            "Call GET /apply-links?user_id={user_id} to generate apply opportunities."
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Module 4 — Apply links
# ─────────────────────────────────────────────────────────────────────────────

@app.get(
    "/apply-links",
    summary="Generate dynamic apply links from stored resume profile",
    tags=["Resume & Apply"],
    response_model=ApplyLinksResponse,
    status_code=status.HTTP_200_OK,
)
async def get_apply_links(
    user_id: str = Query(
        ...,
        description="Firebase Auth user UID. Must have uploaded a resume first.",
        min_length=1,
        max_length=128,
    ),
    save: bool = Query(
        default=True,
        description="If true (default), persist generated links to Firestore.",
    ),
) -> ApplyLinksResponse:
    """
    Reads the candidate's stored resume profile and generates apply links.

    Sources:
    - **Groq AI** — 4-6 personalised direct application URLs
    - **Internshala** — skill-matched internship category pages
    - **LinkedIn** — role-based job search URLs (Mumbai, Internship filter)
    - **Unstop** — competitions + internships listing

    Each link is also saved to `users/{userId}/applyLinks/{linkId}` in Firestore
    with `status="not_applied"` — ready for a tracker UI.
    """
    logger.info("GET /apply-links  user_id=%s  save=%s", user_id, save)

    # ── Fetch stored profile ──────────────────────────────────────────────────
    profile = await resume_service.get_resume_profile(user_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No resume profile found for user_id='{user_id}'. "
                "Upload a resume first via POST /upload-resume."
            ),
        )

    # ── Generate links ────────────────────────────────────────────────────────
    try:
        raw_links = await apply_service.generate_apply_links(profile)
    except Exception as exc:
        logger.exception("generate_apply_links failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate apply links. Check server logs.",
        ) from exc

    # ── Optionally persist ────────────────────────────────────────────────────
    if save:
        try:
            await apply_service.save_apply_links(user_id, raw_links)
        except Exception as exc:
            logger.warning("save_apply_links failed (non-fatal): %s", exc)

    link_models = [ApplyLink(**lnk) for lnk in raw_links]
    return ApplyLinksResponse(
        user_id=user_id,
        links=link_models,
        total=len(link_models),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Module 2 — Voice Mock Interview System (Aarit)
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

class ChatResponse(BaseModel):
    reply: str
    feedback: str
    next_question: str


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

class SummaryRequest(BaseModel):
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
def interview_scrape_endpoint(req: ScrapeRequest):
    """
    Scrapes DuckDuckGo / Bing / Google for real interview questions for the
    given company and role, then refines + supplements them via Groq.

    Call this first to get the question bank before starting `/interview/chat`.
    """
    if not req.company.strip():
        raise HTTPException(status_code=400, detail="company cannot be empty")
    if not req.role.strip():
        raise HTTPException(status_code=400, detail="role cannot be empty")
    result = scrape_questions(req.company.strip(), req.role.strip())
    return ScrapeResponse(**result)


@app.post(
    "/interview/chat",
    response_model=ChatResponse,
    summary="Send a candidate answer and receive AI interviewer feedback + next question",
    tags=["Voice Interview"],
    status_code=status.HTTP_200_OK,
)
def interview_chat_endpoint(req: ChatRequest):
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
        result = interview_chat(
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
def interview_summary_endpoint(req: SummaryRequest):
    """
    Generate a detailed post-interview analysis from the full conversation
    history. Call this when the interview ends (naturally or when user stops
    early).

    Returns overall score, strengths, weaknesses, per-question reviews,
    improvement areas, and a hire / borderline / no-hire recommendation.
    """
    if len([m for m in req.history if m.role != "system"]) < 2:
        raise HTTPException(
            status_code=400,
            detail="Not enough interview data to generate a summary.",
        )

    history_dicts = [msg.model_dump() for msg in req.history]

    try:
        result = generate_summary(
            history=history_dicts,
            company=req.company,
            role=req.role,
            questions_asked=req.questions_asked,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return SummaryResponse(**result)


# ─────────────────────────────────────────────────────────────────────────────
# Module 4-B — Resume-Based Auto Apply Engine  (ported from backend_4)
# ─────────────────────────────────────────────────────────────────────────────

# ── Pydantic models ───────────────────────────────────────────────────────────

class AutoApplyUploadResponse(BaseModel):
    sessionId: str
    fileName: str
    textLength: int
    preview: str
    message: str

class AutoApplyParseRequest(BaseModel):
    sessionId: str

class AutoApplyOpportunitiesRequest(BaseModel):
    sessionId: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post(
    "/auto-apply/upload",
    response_model=AutoApplyUploadResponse,
    summary="Upload a resume file (PDF / DOCX / TXT) and start a session",
    tags=["Auto Apply Engine"],
    status_code=status.HTTP_200_OK,
)
async def auto_apply_upload(
    resume: UploadFile = File(..., description="Resume file — PDF, DOCX, or TXT (max 10 MB)"),
) -> AutoApplyUploadResponse:
    """
    Step 1 of the auto-apply flow.

    Extracts text from the uploaded resume and creates an in-memory session.
    Returns a `sessionId` to use in subsequent calls:
    - `POST /auto-apply/parse`  (AI profile extraction)
    - `POST /auto-apply/opportunities`  (role matching + links)

    Or skip straight to `POST /auto-apply/process-all` for a single-shot call.
    """
    MAX_BYTES = 10 * 1024 * 1024  # 10 MB — same as backend_4
    file_bytes = await resume.read()
    if len(file_bytes) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File is too large. Maximum size is 10 MB.")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="No file uploaded. Please upload a PDF or DOCX file.")

    try:
        text = auto_apply_service.extract_text(
            file_bytes,
            resume.content_type or "",
            resume.filename or "resume",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    session_id = auto_apply_service.create_session()
    auto_apply_service.set_session(session_id, {
        "fileName":     resume.filename,
        "fileSize":     len(file_bytes),
        "rawText":      text,
        "parsedProfile": None,
        "opportunities": None,
        "createdAt":    __import__("datetime").datetime.utcnow().isoformat(),
    })

    logger.info("[auto-apply/upload] session=%s file=%s len=%d", session_id[:8], resume.filename, len(text))
    return AutoApplyUploadResponse(
        sessionId=session_id,
        fileName=resume.filename or "",
        textLength=len(text),
        preview=text[:500] + ("..." if len(text) > 500 else ""),
        message="Resume uploaded and text extracted successfully.",
    )


@app.post(
    "/auto-apply/parse",
    summary="Parse uploaded resume into a structured profile via Groq AI",
    tags=["Auto Apply Engine"],
    status_code=status.HTTP_200_OK,
)
async def auto_apply_parse(body: AutoApplyParseRequest) -> dict:
    """
    Step 2 — Parse the extracted resume text with Groq AI (or regex fallback).

    Requires a valid `sessionId` from `POST /auto-apply/upload`.
    Returns a structured profile with skills, projects, experience, and education.
    """
    session = auto_apply_service.get_session(body.sessionId)
    if session is None:
        raise HTTPException(status_code=400, detail="Invalid session ID. Please upload your resume first.")
    if not session.get("rawText"):
        raise HTTPException(status_code=400, detail="No resume text found for this session.")

    logger.info("[auto-apply/parse] session=%s", body.sessionId[:8])
    parsed_profile = await auto_apply_service.parse_resume_with_ai(session["rawText"])

    session["parsedProfile"] = parsed_profile
    auto_apply_service.set_session(body.sessionId, session)

    return {"sessionId": body.sessionId, "profile": parsed_profile, "message": "Resume parsed successfully."}


@app.post(
    "/auto-apply/opportunities",
    summary="Match profile to roles and generate personalized apply opportunities",
    tags=["Auto Apply Engine"],
    status_code=status.HTTP_200_OK,
)
async def auto_apply_opportunities(body: AutoApplyOpportunitiesRequest) -> dict:
    """
    Step 3 — Match the parsed profile against role categories and generate
    curated application links with personalized 'why it fits' explanations.

    Requires session to have been parsed first via `POST /auto-apply/parse`.
    """
    session = auto_apply_service.get_session(body.sessionId)
    if session is None:
        raise HTTPException(status_code=400, detail="Invalid session ID. Please upload your resume first.")
    if not session.get("parsedProfile"):
        raise HTTPException(status_code=400, detail="Resume not parsed yet. Please parse your resume first.")

    profile = session["parsedProfile"]
    logger.info("[auto-apply/opportunities] session=%s", body.sessionId[:8])

    matched_roles = auto_apply_service.match_roles(profile)
    logger.info("   matched %d categories: %s", len(matched_roles),
                [(r["category"], r["score"]) for r in matched_roles])

    opportunities = auto_apply_service.generate_opportunities(matched_roles, profile)
    opportunities = await auto_apply_service.generate_fit_explanations(profile, opportunities)

    all_skills = (
        (profile.get("skills") or {}).get("technical", [])
        + (profile.get("skills") or {}).get("frameworks", [])
    )
    dynamic_links = auto_apply_service.generate_dynamic_search_urls(
        all_skills, matched_roles[0]["category"] if matched_roles else "Software Engineering"
    )

    session["opportunities"] = opportunities
    session["matchedRoles"]  = matched_roles
    session["dynamicLinks"]  = dynamic_links
    auto_apply_service.set_session(body.sessionId, session)

    return {
        "sessionId":          body.sessionId,
        "matchedRoles":       matched_roles,
        "opportunities":      opportunities,
        "dynamicLinks":       dynamic_links,
        "totalOpportunities": len(opportunities),
        "message":            f"Found {len(opportunities)} personalized opportunities.",
    }


@app.get(
    "/auto-apply/results/{session_id}",
    summary="Retrieve cached auto-apply results for a session",
    tags=["Auto Apply Engine"],
    status_code=status.HTTP_200_OK,
)
def auto_apply_results(session_id: str) -> dict:
    """
    Fetch the cached profile, matched roles, and opportunities for a session
    without re-running the pipeline.
    """
    session = auto_apply_service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found. It may have expired.")
    return {
        "sessionId":    session_id,
        "fileName":     session.get("fileName"),
        "profile":      session.get("parsedProfile"),
        "opportunities": session.get("opportunities"),
        "matchedRoles": session.get("matchedRoles"),
        "dynamicLinks": session.get("dynamicLinks"),
        "createdAt":    session.get("createdAt"),
    }


@app.post(
    "/auto-apply/process-all",
    summary="One-shot: upload + parse + generate opportunities in a single call",
    tags=["Auto Apply Engine"],
    status_code=status.HTTP_200_OK,
)
async def auto_apply_process_all(
    resume: UploadFile = File(..., description="Resume file — PDF, DOCX, or TXT (max 10 MB)"),
) -> dict:
    """
    Convenience endpoint that combines all three steps:
    1. Extract text from resume file
    2. Parse with Groq AI (or regex fallback)
    3. Match roles + generate personalized opportunities

    Returns the complete result in one response — ideal for the frontend's
    streamlined single-file-upload flow.
    """
    MAX_BYTES = 10 * 1024 * 1024
    file_bytes = await resume.read()
    if len(file_bytes) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File is too large. Maximum size is 10 MB.")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="No file uploaded.")

    session_id = auto_apply_service.create_session()
    logger.info("[auto-apply/process-all] session=%s file=%s", session_id[:8], resume.filename)

    # Step 1 — Extract text
    try:
        text = auto_apply_service.extract_text(
            file_bytes,
            resume.content_type or "",
            resume.filename or "resume",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    logger.info("   Step 1 done — %d chars extracted", len(text))

    # Step 2 — Parse with AI
    parsed_profile = await auto_apply_service.parse_resume_with_ai(text)
    logger.info("   Step 2 done — profile parsed")

    # Step 3 — Match roles
    matched_roles = auto_apply_service.match_roles(parsed_profile)
    logger.info("   Step 3 done — %d role categories matched", len(matched_roles))

    # Step 4 — Generate opportunities
    opportunities = auto_apply_service.generate_opportunities(matched_roles, parsed_profile)

    # Step 5 — Generate fit explanations
    opportunities = await auto_apply_service.generate_fit_explanations(parsed_profile, opportunities)
    logger.info("   Step 5 done — %d opportunities generated", len(opportunities))

    # Dynamic search links
    all_skills = (
        (parsed_profile.get("skills") or {}).get("technical", [])
        + (parsed_profile.get("skills") or {}).get("frameworks", [])
    )
    dynamic_links = auto_apply_service.generate_dynamic_search_urls(
        all_skills, matched_roles[0]["category"] if matched_roles else "Software Engineering"
    )

    auto_apply_service.set_session(session_id, {
        "fileName":     resume.filename,
        "rawText":      text,
        "parsedProfile": parsed_profile,
        "opportunities": opportunities,
        "matchedRoles":  matched_roles,
        "dynamicLinks":  dynamic_links,
        "createdAt":    __import__("datetime").datetime.utcnow().isoformat(),
    })

    return {
        "sessionId":          session_id,
        "fileName":           resume.filename,
        "textPreview":        text[:300],
        "profile":            parsed_profile,
        "matchedRoles":       matched_roles,
        "opportunities":      opportunities,
        "dynamicLinks":       dynamic_links,
        "totalOpportunities": len(opportunities),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Module 3 — Company Intel + Smart Prep Engine  (ported from backend-3)
# ─────────────────────────────────────────────────────────────────────────────

# ── Pydantic models ───────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    input_text: str

class GmailScanRequest(BaseModel):
    access_token: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post(
    "/api/analyze",
    summary="Detect email vs manual input, extract company/role, generate full prep pack",
    tags=["Company Intel & Prep"],
    status_code=status.HTTP_200_OK,
)
async def analyze(request: AnalyzeRequest) -> dict:
    """
    Dual-mode intelligent prep engine.

    - **Email mode** — paste a recruitment/interview email; the system detects
      it automatically, extracts all companies mentioned, and generates a
      full prep pack for each.
    - **Manual mode** — paste plain text like "Google SWE 2 weeks"; the system
      extracts company, role, and timeline and generates a targeted prep pack.

    Returns:
      - `top_questions` — 10 interview questions (DSA / System Design / Behavioral)
      - `leetcode_problems` — 8 recommended LeetCode problems
      - `dos` / `donts` — company-specific DOs and DON'Ts
      - `prep_strategy` — time-adapted preparation strategy
    """
    input_text = request.input_text.strip()
    if not input_text:
        raise HTTPException(status_code=400, detail="Input text cannot be empty.")

    mode = prep_service.detect_mode(input_text)
    logger.info("[prep/analyze] mode=%s len=%d", mode, len(input_text))

    info = await prep_service.extract_info(input_text, mode)
    logger.info("[prep/analyze] extracted: %s", str(info)[:200])

    if mode == "email":
        return await prep_service.handle_email_mode(info)
    else:
        return await prep_service.handle_manual_mode(info)


@app.post(
    "/api/gmail-scan",
    summary="Scan Gmail for interview emails and generate prep packs for each company",
    tags=["Company Intel & Prep"],
    status_code=status.HTTP_200_OK,
)
async def gmail_scan_endpoint(request: GmailScanRequest) -> dict:
    """
    Scans the authenticated user's Gmail for placement/interview emails
    (last 60 days), extracts all unique companies via Groq, and generates
    a complete prep pack for each.

    Requires a valid Google OAuth access token with `gmail.readonly` scope —
    the same token used by the Priority Engine (`Authorization: Bearer <token>`
    on the frontend after Firebase Google Sign-In).

    Returns:
      - `mode`: `"gmail"`
      - `emails_scanned`: number of emails fetched
      - `companies`: list of prep packs (same shape as `/api/analyze` email mode)
    """
    token = request.access_token
    if not token:
        raise HTTPException(status_code=400, detail="Access token is required.")

    logger.info("[prep/gmail-scan] starting scan")
    return await prep_service.gmail_scan(token)


# ─────────────────────────────────────────────────────────────────────────────
# Global exception handler
# ─────────────────────────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Any, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception on %s: %s", request.url, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred."},
    )
