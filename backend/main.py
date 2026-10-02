"""
main.py — Production AI Mock Interview System API
===================================================
FastAPI REST service providing:
  - System Health Checks (/health, /api/health)
  - Calibrated Personas Catalogue (/api/personas)
  - Intake & Blueprint Generation (/api/blueprint, /api/blueprint/upload)
  - LiveKit WebRTC Access Token Dispenser (/api/token)
  - Anti-Phantom Evidence Dossier Evaluation (/api/evaluate/{session_id})
  - Cryptographic Session Turn Ledger Audit (/api/ledger/{session_id})
"""
from __future__ import annotations

import json
import logging
import os
import sys
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure repository root is on sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.config import APP_ENV, LOG_LEVEL
from backend.models.schemas import (
    EvaluationReport,
    InterviewBlueprint,
    PersonaProfile,
    SeniorityLevel,
    TurnEvent,
    TurnSpeaker,
)
from backend.orchestrator.personas import get_persona, list_personas
from backend.services.blueprint_service import (
    build_fallback_blueprint,
    extract_text_from_pdf,
    generate_blueprint,
    get_blueprint,
    save_blueprint,
)
from backend.services.evaluation_service import evaluation_service
from backend.services.ledger_service import ledger_service
from livekit import api as livekit_api

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("interview.api")


# ─── Lifespan Context Manager ────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[START] AI Mock Interview API starting (env=%s)", APP_ENV)
    ledger_service.init_db()
    yield
    logger.info("[STOP] AI Mock Interview API shut down cleanly.")


# ─── Application Setup ────────────────────────────────────────────────────────

app = FastAPI(
    title="AI Mock Interview System API",
    description="Evidence-Grounded AI Technical Interviewer & Sound Studio REST API",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Robust CORS configuration supporting both production Vercel frontend and local development
CORS_ORIGINS = [
    "https://ai-mock-interview-system-liart.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request & Response Models ────────────────────────────────────────────────

class TokenRequest(BaseModel):
    room_name: str = Field(..., description="Unique LiveKit room name or session ID")
    participant_name: str = Field(..., description="Candidate display name")
    identity: Optional[str] = Field(None, description="Unique candidate identity")
    persona_id: Optional[str] = Field("alex", description="Selected persona: alex | marcus | priya")
    company: Optional[str] = Field(None, description="Target company")
    role: Optional[str] = Field(None, description="Target role")
    seniority: Optional[str] = Field(None, description="Target seniority / job level: Junior | Mid-Level | Senior | Staff | Principal")


class TokenResponse(BaseModel):
    token: str
    url: str
    server_url: Optional[str] = None


class BlueprintRequest(BaseModel):
    company: str
    role: str
    seniority: str = "Mid-Level"
    resume_text: str = ""
    jd_text: str = ""
    session_id: Optional[str] = None
    persona_id: Optional[str] = "alex"
    primary_language: Optional[str] = "Python"
    interview_focus: Optional[str] = "Balanced Screening"
    spotlight_topic: Optional[str] = ""


class RecordTurnRequest(BaseModel):
    session_id: str
    speaker: str
    text: str
    question_index: int = 0
    confidence: float = 1.0


# ─── System Health & Status Endpoints ─────────────────────────────────────────

@app.get("/", summary="Root status check", tags=["System"])
async def root() -> dict:
    return {
        "status": "ok",
        "service": "ai-mock-interview-backend",
        "version": "2.0.0",
        "environment": APP_ENV,
    }


@app.get("/health", summary="Health check", tags=["System"])
@app.get("/api/health", summary="API Health check alias", tags=["System"])
async def health() -> dict:
    return {
        "status": "healthy",
        "service": "ai-mock-interview-backend",
        "version": "2.0.0",
    }


# ─── Personas Catalogue Endpoint ──────────────────────────────────────────────

@app.get(
    "/api/personas",
    response_model=List[PersonaProfile],
    summary="List all calibrated interviewer personas",
    tags=["Personas"],
)
async def get_personas():
    """Returns the 3 calibrated interviewer archetypes: Alex, Marcus, and Priya."""
    return list_personas()


# ─── Intake & Blueprint Endpoints ─────────────────────────────────────────────

@app.post(
    "/api/blueprint",
    response_model=InterviewBlueprint,
    summary="Synthesize calibrated Interview Blueprint from structured JSON",
    tags=["Blueprint"],
)
async def create_blueprint_endpoint(req: BlueprintRequest):
    """Generates an evidence-bound blueprint with verifiable binary assertions."""
    try:
        bp = await generate_blueprint(
            company=req.company,
            role=req.role,
            resume_text=req.resume_text,
            jd_text=req.jd_text,
            seniority=req.seniority,
            primary_language=req.primary_language,
            interview_focus=req.interview_focus,
            spotlight_topic=req.spotlight_topic,
        )
        save_blueprint(bp.blueprint_id, bp)
        if req.session_id:
            save_blueprint(req.session_id, bp)
            ledger_service.upsert_session(
                session_id=req.session_id,
                company=req.company,
                role=req.role,
                seniority=req.seniority,
                persona_id=req.persona_id or "alex",
            )
        return bp
    except Exception as e:
        logger.error("[api] Blueprint generation failed: %s", e)
        fallback = build_fallback_blueprint(req.company, req.role, req.seniority)
        save_blueprint(fallback.blueprint_id, fallback)
        if req.session_id:
            save_blueprint(req.session_id, fallback)
            ledger_service.upsert_session(
                session_id=req.session_id,
                company=req.company,
                role=req.role,
                seniority=req.seniority,
                persona_id=req.persona_id or "alex",
            )
        return fallback


@app.post(
    "/api/blueprint/upload",
    response_model=InterviewBlueprint,
    summary="Extract PDF resume and synthesize calibrated Interview Blueprint",
    tags=["Blueprint"],
)
async def upload_resume_and_create_blueprint(
    file: UploadFile = File(...),
    company: str = Form("Technology Firm"),
    role: str = Form("Software Engineer"),
    seniority: str = Form("Mid-Level"),
    jd_text: str = Form(""),
    session_id: Optional[str] = Form(None),
    persona_id: str = Form("alex"),
    primary_language: Optional[str] = Form("Python"),
    interview_focus: Optional[str] = Form("Balanced Screening"),
    spotlight_topic: Optional[str] = Form(""),
):
    """Accepts PDF resume upload, extracts text via pypdf, and generates calibrated blueprint."""
    try:
        contents = await file.read()
        extracted_text = extract_text_from_pdf(contents)
        bp = await generate_blueprint(
            company=company,
            role=role,
            resume_text=extracted_text,
            jd_text=jd_text,
            seniority=seniority,
            primary_language=primary_language,
            interview_focus=interview_focus,
            spotlight_topic=spotlight_topic,
        )
        save_blueprint(bp.blueprint_id, bp)
        if session_id:
            save_blueprint(session_id, bp)
            ledger_service.upsert_session(
                session_id=session_id,
                company=company,
                role=role,
                seniority=seniority,
                persona_id=persona_id,
            )
        return bp
    except Exception as e:
        logger.error("[api] PDF resume processing failed: %s", e)
        fallback = build_fallback_blueprint(company, role, seniority)
        save_blueprint(fallback.blueprint_id, fallback)
        if session_id:
            save_blueprint(session_id, fallback)
            ledger_service.upsert_session(
                session_id=session_id,
                company=company,
                role=role,
                seniority=seniority,
                persona_id=persona_id,
            )
        return fallback


@app.get(
    "/api/blueprint/{session_id}",
    response_model=InterviewBlueprint,
    summary="Retrieve active Interview Blueprint by session ID",
    tags=["Blueprint"],
)
async def retrieve_blueprint_endpoint(session_id: str):
    bp = get_blueprint(session_id)
    if not bp:
        logger.info("[api] No existing blueprint found for session %s; generating fallback", session_id)
        bp = build_fallback_blueprint("Technology Firm", "Software Engineer")
        save_blueprint(session_id, bp)
    return bp


# ─── LiveKit WebRTC Token Dispenser ───────────────────────────────────────────

@app.post(
    "/api/token",
    response_model=TokenResponse,
    summary="Generate LiveKit WebRTC Room Access Token",
    tags=["LiveKit WebRTC"],
)
async def generate_token_endpoint(req: TokenRequest):
    """Generates an authenticated JWT token for connecting to LiveKit Cloud."""
    url = os.getenv("LIVEKIT_URL", "")
    api_key = os.getenv("LIVEKIT_API_KEY", "")
    api_secret = os.getenv("LIVEKIT_API_SECRET", "")

    if not url or not api_key or not api_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="LiveKit credentials (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) not configured.",
        )

    identity = req.identity or f"cand_{req.participant_name.lower().replace(' ', '_')}_{os.urandom(3).hex()}"
    active_bp = get_blueprint(req.room_name)
    resolved_company = req.company or (active_bp.company if active_bp else "") or "Google"
    resolved_role = req.role or (active_bp.role if active_bp else "") or "Staff Distributed Systems Engineer"
    resolved_seniority = (
        req.seniority
        or (active_bp.seniority.value if active_bp and hasattr(active_bp.seniority, "value") else str(active_bp.seniority) if active_bp else "")
        or "Staff"
    )

    metadata_json = json.dumps({
        "persona_id": req.persona_id or "alex",
        "company": resolved_company,
        "role": resolved_role,
        "seniority": resolved_seniority,
    })

    # Link active blueprint to this specific room so agent worker immediately has questions
    if active_bp:
        save_blueprint(req.room_name, active_bp)
    else:
        fallback_bp = build_fallback_blueprint(resolved_company, resolved_role, resolved_seniority)
        save_blueprint(req.room_name, fallback_bp)

    ledger_service.upsert_session(
        session_id=req.room_name,
        company=resolved_company,
        role=resolved_role,
        seniority=resolved_seniority,
        persona_id=req.persona_id or "alex",
    )

    token = (
        livekit_api.AccessToken(api_key, api_secret)
        .with_identity(identity)
        .with_name(req.participant_name)
        .with_metadata(metadata_json)
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

    return TokenResponse(token=token, url=url, server_url=url)


# ─── Evaluation & Turn Ledger Endpoints ───────────────────────────────────────

@app.post(
    "/api/evaluate/{session_id}",
    response_model=EvaluationReport,
    summary="Generate Staff Hiring Committee Evidence Dossier",
    tags=["Evaluation"],
)
async def evaluate_session_endpoint(session_id: str):
    """
    Evaluates session based strictly on verified turns in the SQLite Turn Ledger.
    Guaranteed mathematically against phantom questions.
    """
    try:
        report = await evaluation_service.evaluate_session(session_id)
        return report
    except Exception as e:
        logger.error("[api] Evaluation failed for session %s: %s", session_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Evaluation failed: {str(e)}"
        )


@app.get(
    "/api/ledger/{session_id}",
    summary="Audit chronological turn ledger and cryptographic session hash",
    tags=["Ledger"],
)
async def get_ledger_endpoint(session_id: str):
    """Returns all chronological turns and SHA-256 session integrity digest."""
    turns = ledger_service.get_session_turns(session_id)
    session_hash = ledger_service.compute_session_hash(session_id)
    asked_indices = list(ledger_service.get_asked_question_indices(session_id))
    return {
        "session_id": session_id,
        "turns_count": len(turns),
        "asked_question_indices": asked_indices,
        "session_hash": session_hash,
        "turns": turns,
    }


@app.post(
    "/api/ledger/turn",
    response_model=TurnEvent,
    summary="Record a turn event into the SQLite Turn Ledger",
    tags=["Ledger"],
)
async def record_turn_endpoint(req: RecordTurnRequest):
    """Explicitly records a spoken turn into the append-only ledger."""
    speaker_enum = TurnSpeaker.CANDIDATE if req.speaker.lower() in ("candidate", "user") else TurnSpeaker.INTERVIEWER
    turn = ledger_service.record_turn(
        session_id=req.session_id,
        speaker=speaker_enum,
        text=req.text,
        question_index=req.question_index,
        confidence=req.confidence,
    )
    return turn


# ─── Session History Endpoints ───────────────────────────────────────────────

@app.get(
    "/api/history",
    summary="List all historical interview sessions and summaries",
    tags=["History"],
)
async def list_history_endpoint(limit: int = 50, offset: int = 0):
    """Returns chronologically indexed interview sessions for the candidate's dashboard."""
    sessions = ledger_service.list_sessions(limit=limit, offset=offset)
    return {
        "total": len(sessions),
        "sessions": sessions,
    }


@app.get(
    "/api/history/{session_id}",
    summary="Retrieve full session detail including blueprint, turns, and evaluation report",
    tags=["History"],
)
async def get_history_detail_endpoint(session_id: str):
    """Returns complete session dossier, blueprint, turns, and audit hash."""
    session_data = ledger_service.get_session(session_id)
    if not session_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found in history ledger.",
        )
    blueprint = get_blueprint(session_id)
    turns = ledger_service.get_session_turns(session_id)
    session_hash = ledger_service.compute_session_hash(session_id)

    # Parse report if available
    report = None
    if session_data.get("report_json"):
        try:
            report = json.loads(session_data["report_json"])
        except Exception:
            report = None

    return {
        "session": session_data,
        "blueprint": blueprint,
        "report": report,
        "turns_count": len(turns),
        "session_hash": session_hash,
        "turns": turns,
    }


@app.delete(
    "/api/history/{session_id}",
    summary="Delete a session and its associated turns from ledger",
    tags=["History"],
)
async def delete_history_session_endpoint(session_id: str):
    """Deletes a session from the history ledger."""
    success = ledger_service.delete_session(session_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete session {session_id}.",
        )
    return {"status": "deleted", "session_id": session_id}

