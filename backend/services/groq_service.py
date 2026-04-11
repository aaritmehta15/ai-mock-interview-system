"""
services/groq_service.py

Low-level async wrapper for the Groq Chat Completions API.

Responsibilities:
  - Single shared httpx client (created per call — Groq is stateless REST)
  - Retry with exponential back-off on 429 / 5xx
  - JSON extraction from LLM response text
  - Email text sanitisation before sending to external API
  - Two public coroutines:
      extract_events_from_email(subject, body) → list[dict]
      generate_daily_plan(sorted_events_json)  → dict | None
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Optional

import os
import httpx

from config import GROQ_CLASSIFY_MODEL, GROQ_MODEL

logger = logging.getLogger(__name__)

_GROQ_URL       = "https://api.groq.com/openai/v1/chat/completions"
_MAX_TOKENS     = 4096
_RETRY_DELAYS   = [1.0, 2.5, 5.0]


# ─────────────────────────────────────────────────────────────────────────────
# Text sanitation
# ─────────────────────────────────────────────────────────────────────────────

def sanitize_email_text(text: str) -> str:
    """
    Strip email addresses, phone numbers, and collapse blank lines before
    sending to an external LLM to reduce PII exposure and token waste.
    """
    text = re.sub(r"[\w.\-+]+@[\w.\-]+\.\w+", "[EMAIL]", text)
    text = re.sub(r"\+?\d[\d\s\-().]{7,}\d", "[PHONE]", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ─────────────────────────────────────────────────────────────────────────────
# Core HTTP helper
# ─────────────────────────────────────────────────────────────────────────────

async def _call_groq(
    messages: list[dict],
    *,
    model: str = "",
    temperature: float = 0.1,
    max_tokens: int = _MAX_TOKENS,
) -> Optional[str]:
    """
    Send a chat completion request to Groq and return the assistant's text.
    Returns None on unrecoverable failure so callers can degrade gracefully.
    """
    # Always read from env at call time — never cached — so .env loaded late still works
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        logger.error("GROQ_API_KEY is not set — Groq call skipped.")
        return None

    chosen_model = model or GROQ_MODEL
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": chosen_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    for attempt, delay in enumerate([0.0] + _RETRY_DELAYS, start=1):
        if delay:
            await asyncio.sleep(delay)
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(_GROQ_URL, headers=headers, json=payload)

            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"]

            if resp.status_code in (429, 500, 502, 503):
                logger.warning(
                    "Groq API %s on attempt %d (model=%s) — retrying…",
                    resp.status_code, attempt, chosen_model,
                )
                continue

            logger.error(
                "Groq non-retryable error %s: %s",
                resp.status_code, resp.text[:400],
            )
            return None

        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            logger.warning("Groq network error attempt %d: %s", attempt, exc)

    logger.error("Groq API failed after %d attempts (model=%s).", len(_RETRY_DELAYS) + 1, chosen_model)
    return None


# ─────────────────────────────────────────────────────────────────────────────
# JSON extraction
# ─────────────────────────────────────────────────────────────────────────────

def extract_json(text: str) -> Any:
    """
    Extract the first valid JSON object or array from LLM output.
    Handles markdown fences, inline JSON, and bare JSON.
    """
    # 1. Fenced code block (```json … ```)
    m = re.search(r"```(?:json)?\s*([\[\{].*?)```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    # 2. First JSON-looking substring
    m = re.search(r"([\[\{].*[\]\}])", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    # 3. Entire string
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Public coroutine: company classification
# ─────────────────────────────────────────────────────────────────────────────

async def classify_company_with_groq(company_name: str) -> Optional[dict]:
    """
    Ask Groq to classify *company_name* into a placement tier.

    Returns a dict like::
        {"tier": "Tier1", "reason": "FAANG — top product company."}
    or None on failure.
    """
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert on Indian campus placements. "
                "Classify companies into tiers based on brand, package, and work culture. "
                "Respond ONLY with a valid JSON object — no prose."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Classify this company for Indian campus placements:\n\nCompany: {company_name}\n\n"
                "Return ONLY this JSON:\n"
                '{"tier": "Tier1 | Tier2 | Tier3 | Unknown", "reason": "<short reason>"}\n\n'
                "Rules:\n"
                "- Tier1: FAANG, top product companies (Google, Meta, Apple, Microsoft, Amazon, "
                "  Stripe, Anthropic, OpenAI, Goldman Sachs quant, DE Shaw, etc.)\n"
                "- Tier2: Good product companies / funded startups "
                "  (Adobe, Uber, Atlassian, Razorpay, Zepto, CRED, Meesho, etc.)\n"
                "- Tier3: Mass recruiters / IT services "
                "  (TCS, Infosys, Wipro, Capgemini, Cognizant, Accenture, etc.)\n"
                "- Unknown: Insufficient information\n"
                "Return ONLY the JSON. No other text."
            ),
        },
    ]
    raw = await _call_groq(messages, model=GROQ_CLASSIFY_MODEL, temperature=0.0, max_tokens=128)
    if not raw:
        return None
    return extract_json(raw)


# ─────────────────────────────────────────────────────────────────────────────
# Public coroutine: event extraction
# ─────────────────────────────────────────────────────────────────────────────

async def extract_events_from_email(subject: str, body: str) -> list[dict]:
    """
    Use Groq to extract structured placement/exam events from one email.
    Returns an empty list on failure — never raises.
    """
    clean_subject = sanitize_email_text(subject)
    clean_body    = sanitize_email_text(body)

    messages = [
        {
            "role": "system",
            "content": (
                "You are a structured information extractor for a student placement assistant. "
                "Extract ALL placement/exam/internship/assignment events from emails. "
                "Respond ONLY with a valid JSON array — no prose, no markdown."
            ),
        },
        {
            "role": "user",
            "content": (
                f"EMAIL SUBJECT: {clean_subject}\nEMAIL BODY:\n{clean_body}\n\n"
                "Extract all events. Each object MUST follow this EXACT schema:\n"
                "{\n"
                '  "eventType": "<placement_drive|aptitude_test|college_exam|'
                'internship_deadline|college_quiz|assignment>",\n'
                '  "title": "<concise title>",\n'
                '  "company": "<exact company name as written in the email, or null>",\n'
                '  "date": "<YYYY-MM-DD or null>",\n'
                '  "time": "<HH:MM or null>",\n'
                '  "marks": <number or null>\n'
                "}\n\n"
                "IMPORTANT:\n"
                "- For 'company': preserve the EXACT brand name (e.g. 'Google', 'TCS NQT', 'Flipkart').\n"
                "- One email can yield MULTIPLE events (e.g. a timetable → multiple college_exam entries).\n"
                "- Return [] if there are no relevant events.\n"
                "- Return ONLY the JSON array. No other text."
            ),
        },
    ]

    raw = await _call_groq(messages, temperature=0.1)
    if not raw:
        return []

    parsed = extract_json(raw)
    if not isinstance(parsed, list):
        logger.warning("Groq event extraction returned non-list: %r", raw[:200])
        return []
    return parsed


# ─────────────────────────────────────────────────────────────────────────────
# Public coroutine: daily plan generation
# ─────────────────────────────────────────────────────────────────────────────

async def generate_daily_plan(sorted_events_json: str) -> Optional[dict]:
    """
    Ask Groq to produce a focussed daily study plan from the ranked events.
    Returns a dict matching the DailyPlan schema, or None on failure.
    """
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert academic and placement coach for Indian engineering students. "
                "Create concise, realistic, and actionable daily study plans. "
                "Respond ONLY with a valid JSON object — no prose, no markdown."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Prioritised events for today (highest priority first):\n\n{sorted_events_json}\n\n"
                "Generate a daily plan for TODAY ONLY.\n\n"
                "Return ONLY this JSON schema:\n"
                "{\n"
                '  "focus_verdict": "<single most important thing to do today>",\n'
                '  "reason": "<1-2 sentence rationale>",\n'
                '  "hourly_breakdown": [\n'
                '    {"hours": <0.5–3>, "task": "<what to do>", "reason": "<why>"}\n'
                "  ],\n"
                '  "skip_today": ["<titles of events safe to skip today>"],\n'
                '  "warning": "<urgent warning or empty string>"\n'
                "}\n\n"
                "Rules:\n"
                "- Total hours in hourly_breakdown: 6–10 hours max.\n"
                "- Events with days_until <= 1 are CRITICAL — allocate the most time.\n"
                "- Higher priority_score = more time allocated.\n"
                "- Return ONLY the JSON. No other text."
            ),
        },
    ]

    raw = await _call_groq(messages, temperature=0.3)
    if not raw:
        return None

    parsed = extract_json(raw)
    if not isinstance(parsed, dict):
        logger.warning("Groq plan generation returned non-dict: %r", raw[:200])
        return None
    return parsed
