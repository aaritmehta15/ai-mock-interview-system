"""
services/resume_service.py  —  Module 4: Resume-Based Auto Apply System

Responsibilities:
  - Extract text from uploaded PDF (via PyMuPDF / pdfplumber fallback) or raw text
  - Sanitise resume text before sending to external LLM
  - Call Groq to parse resume into a structured profile dict
  - Persist parsed profile to Firestore: users/{userId}/profile/resume

Uses the EXISTING groq_service._call_groq and extract_json helpers.
Uses the EXISTING firebase_service._run / _db / _mem helpers.
Does NOT duplicate any Module 1 logic.
"""
from __future__ import annotations

import io
import logging
import re
from typing import Optional

from services.groq_service import _call_groq, extract_json
from services import firebase_service

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

MAX_RESUME_CHARS = 12_000   # truncate before sending to Groq (token budget)
GROQ_RESUME_MODEL = "llama-3.3-70b-versatile"


# ─────────────────────────────────────────────────────────────────────────────
# PDF text extraction  (PyMuPDF first, pdfplumber fallback, raw-text last)
# ─────────────────────────────────────────────────────────────────────────────

def _extract_text_pymupdf(pdf_bytes: bytes) -> Optional[str]:
    """Try to extract text with PyMuPDF (fitz)."""
    try:
        import fitz  # type: ignore
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages = [page.get_text() for page in doc]
        doc.close()
        return "\n".join(pages)
    except ImportError:
        logger.debug("PyMuPDF (fitz) not installed — trying pdfplumber.")
        return None
    except Exception as exc:
        logger.warning("PyMuPDF extraction failed: %s", exc)
        return None


def _extract_text_pdfplumber(pdf_bytes: bytes) -> Optional[str]:
    """Fallback: extract text with pdfplumber."""
    try:
        import pdfplumber  # type: ignore
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pages = [p.extract_text() or "" for p in pdf.pages]
        return "\n".join(pages)
    except ImportError:
        logger.debug("pdfplumber not installed — no PDF extraction available.")
        return None
    except Exception as exc:
        logger.warning("pdfplumber extraction failed: %s", exc)
        return None


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extract raw text from a PDF byte payload.
    Tries PyMuPDF → pdfplumber → raises ValueError if both unavailable.
    """
    text = _extract_text_pymupdf(pdf_bytes) or _extract_text_pdfplumber(pdf_bytes)
    if text is None:
        raise ValueError(
            "No PDF parsing library available. "
            "Install PyMuPDF (`pip install pymupdf`) or pdfplumber (`pip install pdfplumber`)."
        )
    return text


# ─────────────────────────────────────────────────────────────────────────────
# Text sanitisation
# ─────────────────────────────────────────────────────────────────────────────

def sanitize_resume_text(text: str) -> str:
    """
    Light sanitisation before sending resume text to Groq:
      - Replace email addresses and phone numbers with placeholders
      - Collapse runs of blank lines
      - Truncate to MAX_RESUME_CHARS
    """
    text = re.sub(r"[\w.\-+]+@[\w.\-]+\.\w+", "[EMAIL]", text)
    text = re.sub(r"\+?\d[\d\s\-().]{7,}\d", "[PHONE]", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()
    if len(text) > MAX_RESUME_CHARS:
        logger.info(
            "Resume text truncated from %d → %d chars for Groq.", len(text), MAX_RESUME_CHARS
        )
        text = text[:MAX_RESUME_CHARS]
    return text


# ─────────────────────────────────────────────────────────────────────────────
# Groq — resume parsing
# ─────────────────────────────────────────────────────────────────────────────

async def parse_resume_with_groq(resume_text: str) -> Optional[dict]:
    """
    Send sanitised resume text to Groq and return a structured profile dict.

    Expected output shape::

        {
          "name": "...",
          "skills": [...],
          "projects": [{"name": "...", "tech": [...], "description": "..."}],
          "experience": [...],
          "preferredRoles": [...],
          "targetCompanies": [...]
        }

    Returns None on Groq failure — caller should handle gracefully.
    """
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert resume parser for a student placement assistant. "
                "Extract structured information from the provided resume text. "
                "Respond ONLY with a valid JSON object — no prose, no markdown fences."
            ),
        },
        {
            "role": "user",
            "content": (
                f"RESUME TEXT:\n{resume_text}\n\n"
                "Parse this resume and return ONLY this exact JSON structure:\n"
                "{\n"
                '  "name": "<full name or empty string>",\n'
                '  "skills": ["<skill1>", "<skill2>"],\n'
                '  "projects": [\n'
                '    {"name": "<project name>", "tech": ["<tech1>"], "description": "<1-2 sentences>"}\n'
                "  ],\n"
                '  "experience": ["<internship / job title, company, duration>"],\n'
                '  "preferredRoles": ["<role the candidate is targeting>"],\n'
                '  "targetCompanies": ["<company names explicitly mentioned or implied>"]\n'
                "}\n\n"
                "Rules:\n"
                "- skills: include ALL technical skills (languages, frameworks, tools, cloud, etc.)\n"
                "- projects: list ALL projects, even coursework projects\n"
                "- preferredRoles: infer from skills + experience if not explicitly stated\n"
                "- targetCompanies: extract only if mentioned in the resume; otherwise return []\n"
                "- Return ONLY the JSON object. No other text."
            ),
        },
    ]

    raw = await _call_groq(
        messages,
        model=GROQ_RESUME_MODEL,
        temperature=0.0,
        max_tokens=2048,
    )
    if not raw:
        logger.error("Groq returned nothing for resume parsing.")
        return None

    parsed = extract_json(raw)
    if not isinstance(parsed, dict):
        logger.warning("Resume parse: Groq returned non-dict: %r", raw[:200])
        return None

    logger.info("Resume parsed successfully via Groq (name=%s).", parsed.get("name", "?"))
    return parsed


# ─────────────────────────────────────────────────────────────────────────────
# Firebase persistence
# ─────────────────────────────────────────────────────────────────────────────

async def save_resume_profile(user_id: str, profile: dict) -> None:
    """
    Persist the parsed resume profile to Firestore at:
        users/{userId}/profile/resume

    Also keeps an in-memory copy via the existing firebase_service._mem helper.
    """
    key = f"users/{user_id}/profile/resume"
    firebase_service._mem_set(key, profile)

    if not firebase_service._use_firestore():
        logger.info("Firestore unavailable — resume profile kept in-memory for user=%s.", user_id)
        return

    try:
        await firebase_service._run(
            lambda: firebase_service._db.document(key).set(profile, merge=True)
        )
        logger.info("Resume profile saved to Firestore for user=%s.", user_id)
    except Exception as exc:
        logger.warning(
            "Firestore save_resume_profile failed (%s) — kept in-memory.", exc
        )


async def get_resume_profile(user_id: str) -> Optional[dict]:
    """
    Retrieve the saved resume profile from Firestore / in-memory fallback.
    Returns None if no profile exists.
    """
    key = f"users/{user_id}/profile/resume"

    if not firebase_service._use_firestore():
        return firebase_service._mem_get(key)

    try:
        def _r():
            doc = firebase_service._db.document(key).get()
            return doc.to_dict() if doc.exists else None

        result = await firebase_service._run(_r)
        if result is None:
            # fall through to in-memory
            return firebase_service._mem_get(key)
        return result
    except Exception as exc:
        logger.warning("Firestore get_resume_profile failed (%s) — using in-memory.", exc)
        return firebase_service._mem_get(key)
