"""
services/apply_service.py  —  Module 4: Dynamic Apply Link Generator

Responsibilities:
  - Generate AI-powered apply links using Groq (company, role, direct URL, whyFit, difficulty)
  - Generate deterministic links for Internshala, LinkedIn, and Unstop from the parsed profile
  - Persist generated links to Firestore: users/{userId}/applyLinks/{linkId}
  - Retrieve persisted links for a user

Uses the EXISTING groq_service._call_groq and extract_json helpers.
Uses the EXISTING firebase_service helpers.
Does NOT duplicate any Module 1 logic.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote_plus

from services.groq_service import _call_groq, extract_json
from services import firebase_service

logger = logging.getLogger(__name__)

GROQ_APPLY_MODEL = "llama-3.3-70b-versatile"


# ─────────────────────────────────────────────────────────────────────────────
# Deterministic link builders
# ─────────────────────────────────────────────────────────────────────────────

# Internshala — keyword → category slug mapping
_INTERNSHALA_SKILL_MAP: dict[str, str] = {
    # Machine Learning / AI
    "machine learning": "machine-learning",
    "ml":               "machine-learning",
    "deep learning":    "machine-learning",
    "artificial intelligence": "machine-learning",
    "ai":               "machine-learning",
    "nlp":              "natural-language-processing",
    "computer vision":  "computer-vision",
    "data science":     "data-science",
    "data analysis":    "data-analytics",
    "tableau":          "data-analytics",
    "power bi":         "data-analytics",
    # Web Development
    "react":            "web-development",
    "vue":              "web-development",
    "angular":          "web-development",
    "nodejs":           "web-development",
    "node.js":          "web-development",
    "nodejs":           "web-development",
    "django":           "web-development",
    "flask":            "web-development",
    "web development":  "web-development",
    "html":             "web-development",
    "css":              "web-development",
    "javascript":       "web-development",
    "typescript":       "web-development",
    # Android / Mobile
    "android":          "android-development",
    "kotlin":           "android-development",
    "flutter":          "app-development",
    "react native":     "app-development",
    # Other popular
    "python":           "python",
    "java":             "java",
    "c++":              "cpp",
    "sql":              "database",
    "mysql":            "database",
    "mongodb":          "database",
    "aws":              "cloud-computing",
    "azure":            "cloud-computing",
    "gcp":              "cloud-computing",
    "cloud":            "cloud-computing",
    "devops":           "devops",
    "docker":           "devops",
    "kubernetes":       "devops",
    "ui/ux":            "graphic-design",
    "figma":            "graphic-design",
    "graphic design":   "graphic-design",
    "content writing":  "content-writing",
    "marketing":        "digital-marketing",
}

_BASE_INTERNSHALA = "https://internshala.com/internships"
_BASE_LINKEDIN    = "https://www.linkedin.com/jobs/search/"
_BASE_UNSTOP      = "https://unstop.com/jobs"


def _internshala_links_from_skills(skills: list[str]) -> list[dict]:
    """Build distinct Internshala category links from the candidate's skill list."""
    seen_categories: set[str] = set()
    links: list[dict] = []

    for skill in skills:
        normalized = skill.strip().lower()
        category = _INTERNSHALA_SKILL_MAP.get(normalized)
        if category and category not in seen_categories:
            seen_categories.add(category)
            label = category.replace("-", " ").title()
            links.append({
                "company":    "Internshala",
                "role":       f"{label} Intern",
                "url":        f"{_BASE_INTERNSHALA}/{category}-internship/",
                "whyFit":     f"Your skill in {skill} matches Internshala's {label} internship listings.",
                "difficulty": "Easy",
            })
            if len(links) >= 3:   # cap at 3 Internshala links
                break

    if not links:
        # generic fallback
        links.append({
            "company":    "Internshala",
            "role":       "Internship",
            "url":        f"{_BASE_INTERNSHALA}/",
            "whyFit":     "Browse all internships on Internshala.",
            "difficulty": "Easy",
        })

    return links


def _linkedin_links_from_profile(
    preferred_roles: list[str],
    skills: list[str],
    location: str = "Mumbai",
) -> list[dict]:
    """Build LinkedIn job-search links for each preferred role."""
    roles = preferred_roles if preferred_roles else (skills[:2] if skills else ["Software Engineer"])
    links: list[dict] = []

    for role in roles[:3]:   # limit to 3 LinkedIn links
        encoded_role = quote_plus(role)
        encoded_loc  = quote_plus(location)
        url = (
            f"{_BASE_LINKEDIN}"
            f"?keywords={encoded_role}"
            f"&location={encoded_loc}"
            f"&f_JT=I"        # filter: Internship job type
        )
        links.append({
            "company":    "LinkedIn",
            "role":       role,
            "url":        url,
            "whyFit":     f"LinkedIn shows open '{role}' internships in {location} matching your profile.",
            "difficulty": "Medium",
        })

    return links


def _unstop_link() -> dict:
    """Static Unstop link — always included."""
    return {
        "company":    "Unstop",
        "role":       "Various Competition / Internship Roles",
        "url":        _BASE_UNSTOP,
        "whyFit":     "Unstop lists competitions, hackathons, and internships from top companies.",
        "difficulty": "Medium",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Groq — AI-generated apply links
# ─────────────────────────────────────────────────────────────────────────────

async def _generate_ai_links(profile: dict) -> list[dict]:
    """
    Ask Groq to recommend direct apply links based on the candidate profile.

    Returns a list of dicts matching the apply-link schema, or [] on failure.
    """
    # Condense profile for the prompt
    profile_summary = json.dumps(
        {
            "skills":          profile.get("skills", [])[:20],
            "preferredRoles":  profile.get("preferredRoles", []),
            "targetCompanies": profile.get("targetCompanies", []),
            "experience":      profile.get("experience", [])[:5],
        },
        ensure_ascii=False,
    )

    messages = [
        {
            "role": "system",
            "content": (
                "You are a placement advisor for Indian engineering students. "
                "Recommend 4–6 specific job/internship openings with DIRECT application URLs. "
                "Focus on Indian companies, MNC India offices, and Remote-friendly global startups. "
                "Respond ONLY with a valid JSON array — no prose."
            ),
        },
        {
            "role": "user",
            "content": (
                f"CANDIDATE PROFILE:\n{profile_summary}\n\n"
                "Generate 4–6 apply opportunities. "
                "Return ONLY a JSON array where each element follows this EXACT schema:\n"
                "[\n"
                "  {\n"
                '    "company": "<company name>",\n'
                '    "role": "<specific role / internship title>",\n'
                '    "url": "<DIRECT application or careers page URL>",\n'
                '    "whyFit": "<1-2 sentences explaining why this candidate fits>",\n'
                '    "difficulty": "<Easy | Medium | Hard>"\n'
                "  }\n"
                "]\n\n"
                "Rules:\n"
                "- Prefer roles that match the candidate's top 3–5 skills\n"
                "- Include a mix of difficulty levels\n"
                "- URLs must be real, publicly accessible career/job pages\n"
                "- Avoid duplicate companies\n"
                "- Return ONLY the JSON array. No other text."
            ),
        },
    ]

    raw = await _call_groq(
        messages,
        model=GROQ_APPLY_MODEL,
        temperature=0.4,
        max_tokens=2048,
    )
    if not raw:
        logger.warning("Groq returned nothing for AI apply links — using deterministic only.")
        return []

    parsed = extract_json(raw)
    if not isinstance(parsed, list):
        logger.warning("AI apply links: Groq returned non-list: %r", raw[:200])
        return []

    # Light validation
    valid: list[dict] = []
    for item in parsed:
        if isinstance(item, dict) and item.get("company") and item.get("url"):
            valid.append({
                "company":    item.get("company", ""),
                "role":       item.get("role", ""),
                "url":        item.get("url", ""),
                "whyFit":     item.get("whyFit", ""),
                "difficulty": item.get("difficulty", "Medium"),
            })

    logger.info("AI apply links generated: %d valid links.", len(valid))
    return valid


# ─────────────────────────────────────────────────────────────────────────────
# Public: generate_apply_links
# ─────────────────────────────────────────────────────────────────────────────

async def generate_apply_links(profile: dict) -> list[dict]:
    """
    Generate a combined set of apply links for a candidate profile.

    Sources (in order of appearance in the output):
      1. Groq AI — 4-6 personalised direct links
      2. Internshala — skill-matched category links (deterministic)
      3. LinkedIn — role-based job search URLs (deterministic)
      4. Unstop — static listing link

    Returns a flat list matching the apply-link output schema.
    """
    skills         = profile.get("skills", [])
    preferred_roles = profile.get("preferredRoles", [])

    # Run AI generation and deterministic builders
    ai_links          = await _generate_ai_links(profile)
    internshala_links = _internshala_links_from_skills(skills)
    linkedin_links    = _linkedin_links_from_profile(preferred_roles, skills)
    unstop_link       = _unstop_link()

    all_links = ai_links + internshala_links + linkedin_links + [unstop_link]
    return all_links


# ─────────────────────────────────────────────────────────────────────────────
# Firebase persistence
# ─────────────────────────────────────────────────────────────────────────────

async def save_apply_links(user_id: str, links: list[dict]) -> None:
    """
    Persist each apply link to Firestore at:
        users/{userId}/applyLinks/{linkId}

    Each document includes status="not_applied" and a createdAt timestamp.
    Also written to the in-memory store so the system works without Firestore.
    """
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    for link in links:
        link_id = str(uuid.uuid4())
        doc = {
            "company":   link.get("company", ""),
            "role":      link.get("role", ""),
            "url":       link.get("url", ""),
            "whyFit":    link.get("whyFit", ""),
            "difficulty": link.get("difficulty", "Medium"),
            "status":    "not_applied",
            "createdAt": now_iso,
        }
        key = f"users/{user_id}/applyLinks/{link_id}"
        firebase_service._mem_set(key, doc)

        if firebase_service._use_firestore():
            try:
                await firebase_service._run(
                    lambda d=doc, k=key: firebase_service._db.document(k).set(d)
                )
            except Exception as exc:
                logger.warning("Firestore save_apply_links failed for link (%s) — kept in-memory.", exc)

    logger.info("Saved %d apply links for user=%s.", len(links), user_id)


async def get_apply_links(user_id: str) -> list[dict]:
    """
    Retrieve all saved apply links for a user.
    Returns a list (may be empty if none saved yet).
    """
    prefix = f"users/{user_id}/applyLinks/"

    # In-memory fallback path
    if not firebase_service._use_firestore():
        return [
            v for k, v in firebase_service._mem.items()
            if k.startswith(prefix)
        ]

    try:
        def _r():
            col_path = f"users/{user_id}/applyLinks"
            # Use Firestore collection group query on the sub-collection
            docs = firebase_service._db.collection(col_path).stream()
            return [d.to_dict() for d in docs if d.exists]

        results = await firebase_service._run(_r)
        return results or []
    except Exception as exc:
        logger.warning("Firestore get_apply_links failed (%s) — reading in-memory.", exc)
        return [
            v for k, v in firebase_service._mem.items()
            if k.startswith(prefix)
        ]
