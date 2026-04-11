"""
services/claude_service.py

Low-level async wrapper around the Anthropic Messages API.
Handles:
  - Prompt construction
  - HTTP call (via httpx, non-streaming)
  - JSON extraction from Claude's response text
  - Retry on transient 5xx / rate-limit errors (exponential back-off, max 3 tries)
  - Never raises on soft failures — returns None / empty list and logs the error
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Optional

import httpx

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL

logger = logging.getLogger(__name__)

_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
_MAX_TOKENS = 4096
_RETRY_DELAYS = [1.0, 2.0, 4.0]   # seconds between retries


# ---------------------------------------------------------------------------
# Text sanitation — never send raw PII-heavy email text to the model
# ---------------------------------------------------------------------------

def _sanitize_text(text: str) -> str:
    """
    Strip email headers, excessive blank lines, and anything that looks like
    a real email address or phone number before forwarding to Claude.
    """
    # Remove typical email address patterns
    text = re.sub(r"[\w.\-+]+@[\w.\-]+\.\w+", "[EMAIL]", text)
    # Remove phone numbers (rough heuristic)
    text = re.sub(r"\+?\d[\d\s\-().]{7,}\d", "[PHONE]", text)
    # Collapse runs of whitespace
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


# ---------------------------------------------------------------------------
# Core HTTP helper — one round-trip to Anthropic
# ---------------------------------------------------------------------------

async def _call_claude(
    system_prompt: str,
    user_message: str,
    *,
    temperature: float = 0.2,
) -> Optional[str]:
    """
    Send a single-turn message to Claude and return its text reply.
    Returns ``None`` on unrecoverable failure so callers can degrade gracefully.
    """
    if not ANTHROPIC_API_KEY:
        logger.error("ANTHROPIC_API_KEY is not set — Claude calls will fail.")
        return None

    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": CLAUDE_MODEL,
        "max_tokens": _MAX_TOKENS,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
        "temperature": temperature,
    }

    for attempt, delay in enumerate([0.0] + _RETRY_DELAYS, start=1):
        if delay:
            await asyncio.sleep(delay)
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(_ANTHROPIC_URL, headers=headers, json=payload)

            if resp.status_code == 200:
                data = resp.json()
                return data["content"][0]["text"]

            # Rate-limit or server error — retry
            if resp.status_code in (429, 500, 502, 503, 529):
                logger.warning(
                    "Claude API returned %s on attempt %d — retrying…",
                    resp.status_code,
                    attempt,
                )
                continue

            # Non-retryable client error
            logger.error(
                "Claude API non-retryable error %s: %s",
                resp.status_code,
                resp.text[:400],
            )
            return None

        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            logger.warning("Claude API network error on attempt %d: %s", attempt, exc)

    logger.error("Claude API failed after %d attempts.", len(_RETRY_DELAYS) + 1)
    return None


# ---------------------------------------------------------------------------
# JSON extraction helper
# ---------------------------------------------------------------------------

def _extract_json(text: str) -> Any:
    """
    Extract the first valid JSON object or array from a Claude response.
    Claude sometimes wraps JSON in markdown fences — this handles that.
    """
    # 1. Try fenced code block first
    fence_match = re.search(r"```(?:json)?\s*([\[\{].*?)```", text, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except json.JSONDecodeError:
            pass

    # 2. Try to find inline JSON object / array
    inline_match = re.search(r"([\[\{].*[\]\}])", text, re.DOTALL)
    if inline_match:
        try:
            return json.loads(inline_match.group(1))
        except json.JSONDecodeError:
            pass

    # 3. Try the whole string
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


# ---------------------------------------------------------------------------
# Public APIs
# ---------------------------------------------------------------------------

async def extract_events_from_email(email_subject: str, email_body: str) -> list[dict]:
    """
    Call Claude to extract structured placement/exam events from one email.
    Returns a (possibly empty) list of event dicts.
    """
    clean_body = _sanitize_text(email_body)
    clean_subject = _sanitize_text(email_subject)

    system_prompt = (
        "You are a structured information extractor for a student placement assistant system. "
        "Your ONLY job is to read the provided email and extract placement-related events. "
        "Always respond with ONLY a valid JSON array. No prose, no markdown, no explanation."
    )

    user_message = f"""Extract all placement-related events from the email below.

EMAIL SUBJECT: {clean_subject}
EMAIL BODY:
{clean_body}

Return a JSON array of objects. Each object MUST follow this exact schema:
{{
  "eventType": "<one of: placement_drive | aptitude_test | college_exam | internship_deadline | college_quiz | assignment>",
  "title": "<short descriptive title>",
  "company": "<company name or null>",
  "date": "<YYYY-MM-DD or null>",
  "time": "<HH:MM or null>",
  "marks": <number or null>
}}

Rules:
- If a field is genuinely unknown, use null — never guess.
- One email can produce MULTIPLE events (e.g. a timetable email → multiple college_exam entries).
- If there are NO relevant events, return an empty array [].
- Return ONLY the JSON array. No other text."""

    raw_response = await _call_claude(system_prompt, user_message, temperature=0.1)
    if not raw_response:
        return []

    parsed = _extract_json(raw_response)
    if not isinstance(parsed, list):
        logger.warning("Claude returned non-list for event extraction: %r", raw_response[:200])
        return []

    return parsed


async def generate_daily_plan(sorted_events_json: str) -> Optional[dict]:
    """
    Call Claude to generate a focussed daily study/preparation plan.
    Returns a dict matching the DailyPlan schema, or None on failure.
    """
    system_prompt = (
        "You are an expert academic and placement coach for engineering students in India. "
        "Your ONLY job is to produce a concise, realistic, and actionable daily study plan. "
        "You must respond with ONLY a valid JSON object — no prose, no markdown, no explanation."
    )

    user_message = f"""Here are today's prioritised events for a student, sorted by priority score (highest first):

{sorted_events_json}

Generate a daily plan for TODAY only.

Return a JSON object with EXACTLY this schema:
{{
  "focus_verdict": "<Single most important thing to focus on today>",
  "reason": "<1-2 sentence rationale>",
  "hourly_breakdown": [
    {{
      "hours": <number — can be 0.5>,
      "task": "<what to do>",
      "reason": "<why this slot>">
    }}
  ],
  "skip_today": ["<list of event titles that can safely be skipped today>"],
  "warning": "<any urgent warning for the student, or empty string>"
}}

Rules:
- Total hours in hourly_breakdown should be realistic for one day (6–10 hours max).
- Prioritise events with the highest urgency / priority score.
- If an event is tomorrow, mark it as critical in the plan.
- Return ONLY the JSON object. No other text."""

    raw_response = await _call_claude(system_prompt, user_message, temperature=0.3)
    if not raw_response:
        return None

    parsed = _extract_json(raw_response)
    if not isinstance(parsed, dict):
        logger.warning("Claude returned non-dict for plan generation: %r", raw_response[:200])
        return None

    return parsed
