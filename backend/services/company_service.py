"""
services/company_service.py

Dynamic company intelligence — NO hardcoded company lists for scoring.

Pipeline for a raw company string extracted from an email:
  1. normalize_company_name()    — strip legal suffixes, fix casing
  2. classify_company_tier()     — Groq AI first, heuristic fallback
  3. evaluate_company_priority() — combine tier + student profile → bonus float

The heuristic fallback ONLY fires when Groq is unavailable.
It uses keyword-matching (not an exact list) so it generalises to unseen names.
"""
from __future__ import annotations

import logging
import re
from typing import Optional

from config import STUDENT_TARGET_MATCH_BONUS, TIER_BONUS
from models.schemas import CompanyProfile, CompanyTier, StudentProfile
from services import groq_service

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Normalisation
# ─────────────────────────────────────────────────────────────────────────────

# Legal / geographic suffixes that add no signal for tier classification
_STRIP_SUFFIXES = re.compile(
    r"\b(india|llc|ltd|limited|inc|gmbh|pvt|private|technologies|"
    r"tech|solutions|software|systems|services|group|global|"
    r"corporation|corp|co\.?)\b",
    re.IGNORECASE,
)

def normalize_company_name(raw: str) -> str:
    """
    Return a cleaned, title-cased company name.

    Examples:
        "amazon india pvt ltd"  → "Amazon"
        "Google LLC"            → "Google"
        "tcs nqt"               → "Tcs Nqt"   (acronyms stay as-is, caller decides)
    """
    if not raw:
        return raw

    # Remove parenthetical content — e.g. "Accenture (India)"
    name = re.sub(r"\(.*?\)", "", raw).strip()
    # Strip known legal/geo suffixes
    name = _STRIP_SUFFIXES.sub("", name)
    # Collapse extra whitespace
    name = re.sub(r"\s{2,}", " ", name).strip()
    # Title-case (preserves common acronyms like TCS, FAANG if already upper)
    # Only recase if the string is entirely lowercase or entirely uppercase
    if name == name.lower() or name == name.upper():
        name = name.title()
    return name or raw.strip()


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — Tier classification (Groq → heuristic fallback)
# ─────────────────────────────────────────────────────────────────────────────

# Heuristic keyword patterns for the fallback (keyword, not exact match)
# Ordered from Tier1 → Tier3 so the first hit wins.
_HEURISTIC_TIERS: list[tuple[CompanyTier, list[str], str]] = [
    (
        CompanyTier.Tier1,
        [
            "google", "alphabet", "meta", "facebook", "apple", "microsoft",
            "amazon", "netflix", "openai", "anthropic", "deepmind", "stripe",
            "coinbase", "de shaw", "two sigma", "jane street", "goldman sachs",
            "morgan stanley quant", "bloomberg",
        ],
        "Matches known Tier1 keyword pattern.",
    ),
    (
        CompanyTier.Tier2,
        [
            "adobe", "uber", "atlassian", "twilio", "square", "shopify",
            "razorpay", "zepto", "cred", "meesho", "dream11", "zomato",
            "swiggy", "paytm", "phonepe", "groww", "samsara", "rubrik",
            "databricks", "snowflake", "palantir", "confluent",
        ],
        "Matches known Tier2 keyword pattern.",
    ),
    (
        CompanyTier.Tier3,
        [
            "tcs", "infosys", "wipro", "capgemini", "cognizant", "accenture",
            "hcl", "tech mahindra", "mphasis", "hexaware", "l&t infotech",
            "ltimindtree", "persistent", "birlasoft",
        ],
        "Matches known Tier3 keyword pattern.",
    ),
]


def _heuristic_tier(normalized_name: str) -> tuple[CompanyTier, str]:
    """Keyword-based fallback — never returns an exact match, uses 'in' substring."""
    lower = normalized_name.lower()
    for tier, keywords, reason in _HEURISTIC_TIERS:
        if any(kw in lower for kw in keywords):
            return tier, reason
    return CompanyTier.Unknown, "No matching keyword pattern found."


async def classify_company_tier(raw_name: str) -> CompanyProfile:
    """
    Full classification pipeline for a company extracted from an email.

    1. Normalise the raw name.
    2. Try Groq (AI-based).
    3. Fall back to keyword heuristic if Groq fails.

    Returns a fully populated CompanyProfile.
    """
    normalized = normalize_company_name(raw_name)

    # ── Groq path ──────────────────────────────────────────────────────────
    groq_result = await groq_service.classify_company_with_groq(normalized)
    if groq_result and isinstance(groq_result, dict) and "tier" in groq_result:
        raw_tier = groq_result.get("tier", "Unknown")
        # Validate that Groq returned a known tier value
        try:
            tier = CompanyTier(raw_tier)
        except ValueError:
            tier = CompanyTier.Unknown

        return CompanyProfile(
            raw_name=raw_name,
            normalized_name=normalized,
            tier=tier,
            tier_reason=groq_result.get("reason", "Classified by Groq."),
            source="groq",
        )

    # ── Heuristic fallback ─────────────────────────────────────────────────
    logger.warning(
        "Groq unavailable for company '%s' — using heuristic fallback.", normalized
    )
    tier, reason = _heuristic_tier(normalized)
    return CompanyProfile(
        raw_name=raw_name,
        normalized_name=normalized,
        tier=tier,
        tier_reason=reason,
        source="heuristic",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — Priority bonus computation
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_company_priority(
    company_profile: Optional[CompanyProfile],
    student_profile: Optional[StudentProfile],
    is_placement_drive: bool,
) -> float:
    """
    Return the total company-related priority bonus for one event.

    Rules:
    - Tier bonus applied ONLY when event_type == placement_drive.
    - +STUDENT_TARGET_MATCH_BONUS if the company matches any target in the
      student's profile (case-insensitive, partial match allowed).
    """
    bonus = 0.0

    if company_profile is None:
        return bonus

    # ── Tier bonus (placement_drive only) ─────────────────────────────────
    if is_placement_drive:
        bonus += TIER_BONUS.get(company_profile.tier.value, 0.0)
        logger.debug(
            "Tier bonus for '%s' (tier=%s): +%.1f",
            company_profile.normalized_name,
            company_profile.tier.value,
            TIER_BONUS.get(company_profile.tier.value, 0.0),
        )

    # ── Student target match bonus ─────────────────────────────────────────
    if student_profile and student_profile.target_companies:
        norm_lower = company_profile.normalized_name.lower()
        for target in student_profile.target_companies:
            if target.lower() in norm_lower or norm_lower in target.lower():
                bonus += STUDENT_TARGET_MATCH_BONUS
                logger.debug(
                    "Student target match '%s' ↔ '%s': +%.1f",
                    target,
                    company_profile.normalized_name,
                    STUDENT_TARGET_MATCH_BONUS,
                )
                break   # only one match bonus per event

    return bonus
