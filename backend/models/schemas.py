from __future__ import annotations

from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


# ── Core Enums ────────────────────────────────────────────────────────────────

class SeniorityLevel(str, Enum):
    STUDENT = "Student / Intern"
    JUNIOR = "Junior"
    MID = "Mid-Level"
    SENIOR = "Senior"
    STAFF = "Staff/Principal"


class QuestionCategory(str, Enum):
    TECHNICAL_DSA = "technical_dsa"
    SYSTEM_DESIGN = "system_design"
    BEHAVIORAL = "behavioral"


class HiringRecommendation(str, Enum):
    STRONG_HIRE = "STRONG HIRE"
    HIRE = "HIRE"
    BORDERLINE = "BORDERLINE"
    NO_HIRE = "NO HIRE"


class TurnSpeaker(str, Enum):
    CANDIDATE = "candidate"
    INTERVIEWER = "interviewer"


# ── Blueprint & Assertion Models ─────────────────────────────────────────────

class BinaryAssertion(BaseModel):
    """
    Deterministic factual or architectural assertion that a candidate must demonstrate.
    Eliminates subjective score drift by reducing grading to verifiable binary criteria.
    """
    name: str = Field(..., description="Unique machine-readable assertion identifier, e.g. 'mentions_idempotency_key'")
    weight: float = Field(..., ge=0.0, le=1.0, description="Relative weight of this assertion within the question (sums to 1.0)")
    description: str = Field(..., description="Exact verifiable factual requirement the candidate must state or explain")


class BlueprintQuestion(BaseModel):
    """
    A single calibrated technical interview question.
    """
    id: str = Field(..., description="Unique question ID, e.g. 'q_01'")
    text: str = Field(..., description="Concise spoken question (<35 words)")
    competency: str = Field(..., description="Core engineering competency evaluated, e.g. 'Distributed Systems & Concurrency'")
    category: QuestionCategory = Field(default=QuestionCategory.SYSTEM_DESIGN)
    assertions: List[BinaryAssertion] = Field(default_factory=list, description="List of verifiable binary criteria")
    model_answer: str = Field(
        default="Reference benchmark answer demonstrating core algorithmic concepts, asymptotic complexity, and trade-offs.",
        description="Reference benchmark answer"
    )


class InterviewBlueprint(BaseModel):
    """
    Complete interview roadmap generated during the intake phase from resume + JD.
    """
    blueprint_id: str
    company: str
    role: str
    seniority: SeniorityLevel = SeniorityLevel.MID
    domain: Optional[str] = Field(default=None, description="Detected or calibrated engineering discipline")
    primary_language: Optional[str] = Field(default="Python", description="Candidate's primary programming language / stack")
    interview_focus: Optional[str] = Field(default="Balanced Screening", description="Target interview practice round")
    spotlight_topic: Optional[str] = Field(default="", description="Specific candidate project or topic spotlight")
    strategy_summary: Optional[str] = Field(default="", description="Executive strategy summary of what this interview evaluates")
    preparation_tips: List[str] = Field(default_factory=list, description="Actionable tips for candidate success in this session")
    keywords: List[str] = Field(default_factory=list, description="Pre-boosted technical speech vocabulary for STT")
    rounds: List[str] = Field(default_factory=lambda: ["System Architecture", "Trade-Off Analysis"])
    questions: List[BlueprintQuestion] = Field(default_factory=list)


# ── Cryptographic Turn Ledger Models ─────────────────────────────────────────

class TurnEvent(BaseModel):
    """
    Immutable spoken turn recorded in the append-only SQLite Turn Ledger.
    """
    turn_id: str = Field(..., description="Unique turn ID, e.g. 'turn_c94e7c15ba'")
    session_id: str = Field(..., description="Session/room identifier")
    speaker: TurnSpeaker
    role: str = Field(default="candidate")
    question_index: int = Field(default=0)
    text: str = Field(..., description="Verbatim speech transcript")
    word_count: int = Field(default=0)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp")
    verified: bool = Field(default=False, description="True if word_count >= 10 and confidence >= 0.5")


# ── Persona Models ────────────────────────────────────────────────────────────

class PersonaProfile(BaseModel):
    """
    Calibrated psychometric interviewer archetype.
    """
    id: str
    name: str
    title: str
    difficulty: str
    accent_color: str
    voice_model: str
    pause_tolerance: float = Field(..., description="Seconds of candidate silence before agent nudges")
    thinking_delay: float = Field(..., description="Seconds the agent pauses before responding to simulate thought")
    max_words: int = Field(default=35, description="Strict cap on spoken words per turn to guarantee token economy")
    system_prompt: str
    signature_phrase: str


# ── Evaluation & Anti-Phantom Dossier Models ───────────────────────────────────

class AssertionResult(BaseModel):
    assertion_name: str
    passed: bool
    evidence_quote: Optional[str] = Field(None, description="Exact verbatim citation from candidate speech")
    critique: str


class QuestionEvaluation(BaseModel):
    question_id: str
    question_text: str
    status: str = Field(default="VERIFIED", description="'VERIFIED' | 'UNREACHED'")
    score: float = Field(default=0.0, ge=0.0, le=100.0)
    weight: float = Field(default=1.0, ge=0.0, le=1.0)
    assertion_results: List[AssertionResult] = Field(default_factory=list)
    verbatim_citations: List[str] = Field(default_factory=list)


class CompetencyScore(BaseModel):
    dsa_score: float = Field(default=0.0, ge=0.0, le=100.0)
    system_design_score: float = Field(default=0.0, ge=0.0, le=100.0)
    communication_score: float = Field(default=0.0, ge=0.0, le=100.0)
    tradeoff_intuition_score: float = Field(default=0.0, ge=0.0, le=100.0)


class EvaluationReport(BaseModel):
    """
    Staff Hiring Committee Executive Dossier.
    Guaranteed mathematically against phantom questions through the SQLite Ledger.
    """
    session_id: str
    overall_score: float = Field(..., ge=0.0, le=100.0)
    recommendation: HiringRecommendation
    competencies: CompetencyScore
    question_evaluations: List[QuestionEvaluation] = Field(default_factory=list)
    session_hash: str = Field(..., description="SHA-256 session integrity digest over all ledger turns")
    unreached_question_count: int = Field(default=0)
    verified_turn_count: int = Field(default=0)
    created_at: str
