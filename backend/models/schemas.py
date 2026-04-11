from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ── Enums ──────────────────────────────────────────────────────────────────────

class EventType(str, Enum):
    placement_drive    = "placement_drive"
    aptitude_test      = "aptitude_test"
    college_exam       = "college_exam"
    internship_deadline = "internship_deadline"
    college_quiz       = "college_quiz"
    assignment         = "assignment"


class CompanyTier(str, Enum):
    Tier1   = "Tier1"
    Tier2   = "Tier2"
    Tier3   = "Tier3"
    Unknown = "Unknown"


# ── Raw email ──────────────────────────────────────────────────────────────────

class RawEmail(BaseModel):
    id: str
    subject: str
    body: str
    sender: str
    received_at: str          # ISO-8601


# ── Company intelligence ───────────────────────────────────────────────────────

class CompanyProfile(BaseModel):
    """Enriched company data attached to an event."""
    raw_name: str             # as extracted from the email
    normalized_name: str      # after normalisation (title-case, trademark stripped)
    tier: CompanyTier
    tier_reason: str
    source: str               # "groq" | "heuristic"


# ── Student profile (stored in Firebase: users/{userId}/profile) ───────────────

class StudentProfile(BaseModel):
    user_id: str
    target_companies: list[str] = Field(default_factory=list)
    preferred_roles: list[str]  = Field(default_factory=list)
    # "high_package" | "learning" | "stability"
    priority_bias: str = "high_package"


# ── Extracted structured event ─────────────────────────────────────────────────

class ExtractedEvent(BaseModel):
    eventType: EventType
    title: str
    company: Optional[str]          = None
    company_profile: Optional[CompanyProfile] = None
    date: Optional[str]             = None   # "YYYY-MM-DD"
    time: Optional[str]             = None
    marks: Optional[float]          = None
    source_email_id: Optional[str]  = None


# ── Scored / ranked event ──────────────────────────────────────────────────────

class ScoredEvent(BaseModel):
    eventType: EventType
    title: str
    company: Optional[str]          = None
    company_profile: Optional[CompanyProfile] = None
    date: Optional[str]             = None
    time: Optional[str]             = None
    marks: Optional[float]          = None
    priority_score: float
    score_breakdown: dict           = Field(default_factory=dict)
    days_until: Optional[int]       = None
    source_email_id: Optional[str]  = None


# ── Daily plan ─────────────────────────────────────────────────────────────────

class HourlyBlock(BaseModel):
    hours: float
    task: str
    reason: str


class DailyPlan(BaseModel):
    focus_verdict: str
    reason: str
    hourly_breakdown: list[HourlyBlock]
    skip_today: list[str]   = Field(default_factory=list)
    warning: str            = ""


# ── API response shapes ────────────────────────────────────────────────────────

class GeneratePlanResponse(BaseModel):
    sorted_events: list[ScoredEvent]
    daily_plan: DailyPlan
    generated_at: str


class LogStudyRequest(BaseModel):
    user_id: str   = Field(..., min_length=1, max_length=128)
    date: str      = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    hours_studied: float = Field(..., ge=0, le=24)

    @field_validator("hours_studied")
    @classmethod
    def round_hours(cls, v: float) -> float:
        return round(v, 2)


class LogStudyResponse(BaseModel):
    user_id: str
    date: str
    hours_studied: float
    message: str


# ── Student profile update request ────────────────────────────────────────────

class UpdateProfileRequest(BaseModel):
    target_companies: list[str]  = Field(default_factory=list)
    preferred_roles: list[str]   = Field(default_factory=list)
    priority_bias: str           = "high_package"

    @field_validator("priority_bias")
    @classmethod
    def validate_bias(cls, v: str) -> str:
        allowed = {"high_package", "learning", "stability"}
        if v not in allowed:
            raise ValueError(f"priority_bias must be one of {allowed}")
        return v


# ── Module 4: Resume & Apply Links ────────────────────────────────────────────

class ResumeProject(BaseModel):
    name: str
    tech: list[str] = Field(default_factory=list)
    description: str = ""


class ResumeProfile(BaseModel):
    """Parsed resume profile stored at users/{userId}/profile/resume."""
    name: str = ""
    skills: list[str] = Field(default_factory=list)
    projects: list[ResumeProject] = Field(default_factory=list)
    experience: list[str] = Field(default_factory=list)
    preferredRoles: list[str] = Field(default_factory=list)
    targetCompanies: list[str] = Field(default_factory=list)


class UploadResumeResponse(BaseModel):
    user_id: str
    profile: ResumeProfile
    message: str


class ApplyLink(BaseModel):
    """Single apply opportunity returned by GET /apply-links."""
    company: str
    role: str
    url: str
    whyFit: str = ""
    difficulty: str = "Medium"   # Easy | Medium | Hard


class ApplyLinksResponse(BaseModel):
    user_id: str
    links: list[ApplyLink]
    total: int
