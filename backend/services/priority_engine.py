"""
services/priority_engine.py

Deterministic priority scoring — no randomness, no AI, fully auditable.

Formula:
    priority_score = (weight × urgency) + bonus

Bonus components (all additive):
    +3   No study recorded today
    +1   Event is today or tomorrow (days_until <= 1)
    ??   Company bonus — dynamic tier via company_service (placement_drive only)
    ??   Student target match bonus — via company_service

The old hardcoded PRIORITY_COMPANIES list is GONE.
All company intelligence is delegated to company_service.evaluate_company_priority().
"""
from __future__ import annotations

import asyncio
import logging
from typing import List, Optional

from config import EVENT_WEIGHTS
from models.schemas import (
    CompanyProfile,
    EventType,
    ExtractedEvent,
    ScoredEvent,
    StudentProfile,
)
from services import company_service
from utils.date_utils import days_until, parse_date_safe, today_utc

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Pure helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_weight(event_type: EventType) -> int:
    return EVENT_WEIGHTS.get(event_type.value, 1)


def _compute_urgency(days: Optional[int]) -> float:
    """
    urgency = 1 / max(daysUntil, 1)

    - None date → urgency 1.0 (assume imminent, surface it to the student)
    - Past events → clamped to 1 to keep score positive
    """
    if days is None:
        return 1.0
    return 1.0 / max(days, 1)


def _compute_base_bonus(days: Optional[int], hours_studied: float) -> tuple[float, dict]:
    """
    Returns (base_bonus_total, breakdown_dict) for non-company rules.

    Breakdown dict is included in ScoredEvent.score_breakdown for transparency.
    """
    breakdown: dict = {}
    bonus = 0.0

    if hours_studied == 0:
        bonus += 3.0
        breakdown["no_study_bonus"] = 3.0

    if days is not None and days <= 1:
        bonus += 1.0
        breakdown["urgency_bonus"] = 1.0

    return bonus, breakdown


# ─────────────────────────────────────────────────────────────────────────────
# Async scoring (company classification requires an async Groq call)
# ─────────────────────────────────────────────────────────────────────────────

async def score_event_async(
    event: ExtractedEvent,
    hours_studied_today: float = 0.0,
    student_profile: Optional[StudentProfile] = None,
) -> ScoredEvent:
    """
    Full async scoring pipeline for one event.
    Classifies the company via Groq (or heuristic fallback), then applies
    all bonus rules and returns a ScoredEvent with a full score_breakdown.
    """
    parsed_date = parse_date_safe(event.date)
    days = days_until(parsed_date, today_utc()) if parsed_date else None

    weight  = _get_weight(event.eventType)
    urgency = _compute_urgency(days)
    base_bonus, breakdown = _compute_base_bonus(days, hours_studied_today)

    # ── Company intelligence (async) ───────────────────────────────────────
    company_profile: Optional[CompanyProfile] = event.company_profile

    if event.company and company_profile is None:
        company_profile = await company_service.classify_company_tier(event.company)

    is_placement = event.eventType == EventType.placement_drive
    company_bonus = company_service.evaluate_company_priority(
        company_profile, student_profile, is_placement_drive=is_placement,
    )

    if company_bonus:
        breakdown["company_bonus"] = company_bonus

    # ── Final score ────────────────────────────────────────────────────────
    total_bonus = base_bonus + company_bonus
    priority_score = round((weight * urgency) + total_bonus, 4)

    breakdown["weight"]   = weight
    breakdown["urgency"]  = round(urgency, 6)
    breakdown["total"]    = priority_score

    logger.debug(
        "Scored '%s' → w=%d u=%.4f base_b=%.1f co_b=%.1f score=%.4f",
        event.title, weight, urgency, base_bonus, company_bonus, priority_score,
    )

    return ScoredEvent(
        eventType=event.eventType,
        title=event.title,
        company=event.company,
        company_profile=company_profile,
        date=event.date,
        time=event.time,
        marks=event.marks,
        priority_score=priority_score,
        score_breakdown=breakdown,
        days_until=days,
        source_email_id=event.source_email_id,
    )


async def rank_events_async(
    events: List[ExtractedEvent],
    hours_studied_today: float = 0.0,
    student_profile: Optional[StudentProfile] = None,
) -> List[ScoredEvent]:
    """
    Score ALL events concurrently (Groq calls are parallelised), then sort
    by descending priority_score.

    Tie-breaking (lexicographic):
      1. Fewer days until event
      2. Higher event-type weight
      3. Title alphabetically (stable, deterministic)
    """
    tasks = [
        score_event_async(event, hours_studied_today, student_profile)
        for event in events
    ]
    scored: List[ScoredEvent] = await asyncio.gather(*tasks)

    scored.sort(
        key=lambda s: (
            -s.priority_score,
            s.days_until if s.days_until is not None else 999,
            -_get_weight(s.eventType),
            s.title,
        )
    )
    return scored
