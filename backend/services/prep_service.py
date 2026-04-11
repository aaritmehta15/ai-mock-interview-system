"""
services/prep_service.py  —  Module 3: Company Intel + Smart Prep Engine
(ported from backend-3/main_3.py without any logic changes)

Responsibilities:
  - Detect whether input is an email or a manual company/role text
  - Extract company, role, and timeline info via Groq
  - Generate interview questions, LeetCode problems, DOs/DON'Ts, prep strategy
  - Handle Gmail scan: fetch emails, extract companies, generate prep packs

Uses the existing groq_service._call_groq and extract_json helpers so the
GROQ_API_KEY in .env is used — no hardcoded key.
"""
from __future__ import annotations

import asyncio
import base64
import json
import re
import traceback
from typing import Any, Optional

import httpx
from fastapi import HTTPException

from services.groq_service import _call_groq, extract_json

# ─────────────────────────────────────────────────────────────────────────────
# Constants  (same as main_3.py)
# ─────────────────────────────────────────────────────────────────────────────

GROQ_MODELS = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"]
MAX_RETRIES = 3

GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"
GMAIL_SEARCH_QUERY = (
    "subject:(interview OR placement OR shortlisted OR assessment OR coding round OR offer letter)"
    " newer_than:60d"
)

# ─────────────────────────────────────────────────────────────────────────────
# Groq LLM helper  (mirrors call_groq_llm from main_3.py)
# Routes through existing groq_service._call_groq — uses env GROQ_API_KEY
# ─────────────────────────────────────────────────────────────────────────────

_DEFAULT_SYSTEM = (
    "You are an expert career coach. "
    "Respond ONLY with raw valid JSON. No markdown, no code fences, no explanation."
)


async def _call_groq_prep(
    prompt: str,
    system_prompt: str = _DEFAULT_SYSTEM,
) -> str:
    """
    Mirrors main_3.call_groq_llm() — tries GROQ_MODELS in order with retries.
    Falls back to HTTPException 502 if all models fail (same behaviour).
    """
    last_error: Optional[str] = None

    for model in GROQ_MODELS:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": prompt},
        ]
        for attempt in range(MAX_RETRIES):
            raw = await _call_groq(
                messages,
                model=model,
                temperature=0.5,
                max_tokens=2048,
            )
            if raw is not None:
                return raw
            # _call_groq returns None on 429/5xx — back off and retry
            wait = min(2 ** attempt * 2, 30)
            print(f"[RATE LIMIT] {model} attempt {attempt+1}/{MAX_RETRIES}, waiting {wait}s")
            await asyncio.sleep(wait)
            last_error = f"No response from model {model}"

        print(f"[FALLBACK] Exhausted retries for {model}")

    raise HTTPException(status_code=502, detail=f"Groq API unavailable: {last_error}")


# ─────────────────────────────────────────────────────────────────────────────
# JSON parser  (exact copy of main_3.parse_json_safe)
# ─────────────────────────────────────────────────────────────────────────────

def parse_json_safe(raw: str, fallback: Any = None) -> Any:
    """Robustly parse JSON from LLM output."""
    if not raw:
        return fallback

    # Strip markdown code fences
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", raw.strip())
    cleaned = re.sub(r"\n?```\s*$", "", cleaned).strip()

    # Try direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Try to find JSON object or array in the text
    for pattern in [r'\{[\s\S]*\}', r'\[[\s\S]*\]']:
        match = re.search(pattern, cleaned)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                continue

    # Last resort: try fixing common LLM JSON issues
    try:
        fixed = cleaned.replace("'", '"')
        fixed = re.sub(r',\s*([}\]])', r'\1', fixed)  # trailing commas
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    print(f"[JSON PARSE FAILED] Raw text (first 500 chars): {raw[:500]}")
    return fallback


# ─────────────────────────────────────────────────────────────────────────────
# Mode Detection  (exact copy of main_3.detect_mode)
# ─────────────────────────────────────────────────────────────────────────────

EMAIL_SIGNALS = [
    r"dear\s+\w+", r"hi\s+\w+", r"hello\s+\w+",
    r"subject\s*:", r"from\s*:", r"to\s*:", r"date\s*:",
    r"interview\s+(scheduled|invitation|confirmation|round)",
    r"we\s+(are\s+)?pleased\s+to", r"shortlisted",
    r"application\s+(for|to)", r"regarding\s+your",
    r"coding\s+(round|test|challenge)", r"technical\s+interview",
    r"hr\s+round", r"phone\s+screen", r"on-?site",
    r"best\s+regards", r"sincerely", r"thanks\s*(&|and)\s*regards",
]


def detect_mode(input_text: str) -> str:
    text_lower = input_text.lower()
    score = sum(1 for p in EMAIL_SIGNALS if re.search(p, text_lower))
    if score >= 2:
        return "email"
    if len(input_text.split("\n")) > 5 and score >= 1:
        return "email"
    return "manual"


# ─────────────────────────────────────────────────────────────────────────────
# Info Extraction  (exact copy of main_3.extract_info)
# ─────────────────────────────────────────────────────────────────────────────

async def extract_info(input_text: str, mode: str) -> dict:
    if mode == "email":
        prompt = (
            "Extract interview info from this email. Return JSON:\n"
            '{"companies": [{"company": "Name", "role": "Role or General", "time_left": "time or Not specified"}]}\n\n'
            f"Email:\n{input_text}"
        )
    else:
        prompt = (
            "Extract company, role, and time info from this text. Return JSON:\n"
            '{"company": "Name", "role": "Role or Software Engineer", "time_left": "time or 2 weeks"}\n\n'
            f"Text:\n{input_text}"
        )

    raw = await _call_groq_prep(prompt)
    result = parse_json_safe(raw)

    if result is None:
        if mode == "email":
            return {"companies": [{"company": "Unknown Company", "role": "Software Engineer", "time_left": "Not specified"}]}
        else:
            return {"company": "Unknown Company", "role": "Software Engineer", "time_left": "2 weeks"}

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Generation Functions  (exact copies from main_3.py)
# ─────────────────────────────────────────────────────────────────────────────

async def generate_questions(company: str, role: str) -> list:
    prompt = (
        f"Generate 10 interview questions for {role} at {company}. "
        "Mix of DSA, System Design, Behavioral, Cultural Fit. "
        "Return a JSON array:\n"
        '[{"question": "text", "category": "DSA", "difficulty": "Medium"}]\n'
        "Categories: DSA, System Design, Behavioral, Cultural Fit. "
        "Difficulties: Easy, Medium, Hard."
    )
    raw = await _call_groq_prep(prompt)
    result = parse_json_safe(raw, [])
    if isinstance(result, dict) and "questions" in result:
        return result["questions"]
    if isinstance(result, list):
        return result
    return []


async def generate_leetcode(company: str, role: str) -> list:
    prompt = (
        f"Recommend 8 LeetCode problems for {role} interview at {company}. "
        "Return a JSON array:\n"
        '[{"title": "Two Sum", "difficulty": "Easy", "topic": "Arrays", "why": "reason"}]'
    )
    raw = await _call_groq_prep(prompt)
    result = parse_json_safe(raw, [])
    if isinstance(result, dict) and "problems" in result:
        return result["problems"]
    if isinstance(result, list):
        return result
    return []


async def generate_dos_donts(company: str, role: str) -> dict:
    prompt = (
        f"Give 6 DOs and 6 DON'Ts for {role} interview at {company}. "
        "Company-specific, not generic. Return JSON:\n"
        '{"dos": ["item1", "item2"], "donts": ["item1", "item2"]}'
    )
    raw = await _call_groq_prep(prompt)
    result = parse_json_safe(raw, {"dos": [], "donts": []})
    if isinstance(result, dict):
        return {"dos": result.get("dos", []), "donts": result.get("donts", [])}
    return {"dos": [], "donts": []}


async def generate_strategy(company: str, role: str, time_left: str) -> dict:
    prompt = (
        f"Create a prep strategy for {role} at {company} with {time_left} remaining. "
        "Adapt to time available. Return JSON:\n"
        '{"strategy": "Full strategy text here as a single string", '
        '"priority_areas": ["area1", "area2", "area3"], '
        '"daily_plan_summary": "Brief daily plan as a single string"}'
    )
    raw = await _call_groq_prep(prompt)
    result = parse_json_safe(raw, None)

    if result is None:
        return {
            "strategy": raw if raw else "Unable to generate strategy. Please try again.",
            "priority_areas": [],
            "daily_plan_summary": "",
        }

    if isinstance(result, dict):
        strategy_val = result.get("strategy", "")
        if isinstance(strategy_val, (dict, list)):
            strategy_val = json.dumps(strategy_val, indent=2)
        return {
            "strategy": str(strategy_val),
            "priority_areas": result.get("priority_areas", []),
            "daily_plan_summary": str(result.get("daily_plan_summary", "")),
        }

    return {
        "strategy": str(result),
        "priority_areas": [],
        "daily_plan_summary": "",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Mode Handlers  (exact copies from main_3.py)
# ─────────────────────────────────────────────────────────────────────────────

async def generate_company_data(company: str, role: str, time_left: str) -> dict:
    """Generate all prep data for a single company, with error isolation."""
    results = {}

    try:
        results["top_questions"] = await generate_questions(company, role)
    except Exception as e:
        print(f"[ERROR] Questions generation failed: {e}")
        results["top_questions"] = []

    try:
        results["leetcode_problems"] = await generate_leetcode(company, role)
    except Exception as e:
        print(f"[ERROR] LeetCode generation failed: {e}")
        results["leetcode_problems"] = []

    try:
        dd = await generate_dos_donts(company, role)
        results["dos"] = dd.get("dos", [])
        results["donts"] = dd.get("donts", [])
    except Exception as e:
        print(f"[ERROR] DOs/DON'Ts generation failed: {e}")
        results["dos"] = []
        results["donts"] = []

    try:
        results["prep_strategy"] = await generate_strategy(company, role, time_left)
    except Exception as e:
        print(f"[ERROR] Strategy generation failed: {e}")
        results["prep_strategy"] = {
            "strategy": "Generation failed. Please try again.",
            "priority_areas": [],
            "daily_plan_summary": "",
        }

    return results


async def handle_manual_mode(info: dict) -> dict:
    company   = info.get("company", "Unknown")
    role      = info.get("role", "Software Engineer")
    time_left = info.get("time_left", "2 weeks")

    data = await generate_company_data(company, role, time_left)

    return {
        "mode": "manual",
        "company": company,
        "role": role,
        "time_left": time_left,
        **data,
    }


async def handle_email_mode(info: dict) -> dict:
    companies_data = info.get("companies", [])
    if not companies_data:
        return {"mode": "email", "companies": []}

    results = []
    for entry in companies_data:
        company   = entry.get("company", "Unknown")
        role      = entry.get("role", "Software Engineer")
        time_left = entry.get("time_left", "Not specified")

        data = await generate_company_data(company, role, time_left)

        results.append({
            "company":   company,
            "role":      role,
            "time_left": time_left,
            "data":      data,
        })

    return {"mode": "email", "companies": results}


# ─────────────────────────────────────────────────────────────────────────────
# Gmail helpers  (exact copy from main_3.py)
# ─────────────────────────────────────────────────────────────────────────────

def decode_email_body(payload: dict) -> str:
    """Recursively extract plain text body from Gmail message payload."""
    # Direct body
    if payload.get("mimeType", "").startswith("text/plain"):
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")

    # Multipart: recurse into parts
    parts = payload.get("parts", [])
    for part in parts:
        if part.get("mimeType", "").startswith("text/plain"):
            data = part.get("body", {}).get("data", "")
            if data:
                return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")

    # Fallback: try text/html
    for part in parts:
        if part.get("mimeType", "").startswith("text/html"):
            data = part.get("body", {}).get("data", "")
            if data:
                html = base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
                return re.sub(r"<[^>]+>", " ", html).strip()

    # Nested multipart
    for part in parts:
        if part.get("parts"):
            result = decode_email_body(part)
            if result:
                return result

    return ""


async def gmail_scan(access_token: str) -> dict:
    """
    Full Gmail scan pipeline (mirrors main_3.gmail_scan endpoint handler):
    1. Search for interview/placement emails
    2. Fetch each email body
    3. Extract companies via Groq
    4. Generate prep data for each company
    """
    headers = {"Authorization": f"Bearer {access_token}"}

    print("[GMAIL] Searching for interview emails...")

    # Step 1: Search for matching emails
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            search_resp = await client.get(
                f"{GMAIL_API}/messages",
                headers=headers,
                params={"q": GMAIL_SEARCH_QUERY, "maxResults": 10},
            )

            if search_resp.status_code == 401:
                raise HTTPException(status_code=401, detail="Gmail access expired. Please sign in again.")
            if search_resp.status_code == 403:
                raise HTTPException(status_code=403, detail="Gmail access denied. Please grant email read permission.")

            search_resp.raise_for_status()
            search_data = search_resp.json()

    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Gmail API: {str(e)}")

    message_ids = [m["id"] for m in search_data.get("messages", [])]
    if not message_ids:
        return {"mode": "gmail", "companies": [], "message": "No interview-related emails found in the last 60 days."}

    print(f"[GMAIL] Found {len(message_ids)} matching emails")

    # Step 2: Fetch each email body
    email_bodies = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for msg_id in message_ids[:10]:  # Cap at 10
            try:
                msg_resp = await client.get(
                    f"{GMAIL_API}/messages/{msg_id}",
                    headers=headers,
                    params={"format": "full"},
                )
                if msg_resp.status_code != 200:
                    continue
                msg_data = msg_resp.json()

                # Get subject from headers
                subject = ""
                msg_headers = msg_data.get("payload", {}).get("headers", [])
                for h in msg_headers:
                    if h.get("name", "").lower() == "subject":
                        subject = h.get("value", "")
                        break

                body = decode_email_body(msg_data.get("payload", {}))
                if body:
                    full_text = f"Subject: {subject}\n\n{body}" if subject else body
                    email_bodies.append(full_text[:3000])  # Cap each email

            except Exception as e:
                print(f"[GMAIL] Error fetching message {msg_id}: {e}")
                continue

    if not email_bodies:
        return {"mode": "gmail", "companies": [], "message": "Found emails but couldn't read their content."}

    print(f"[GMAIL] Successfully fetched {len(email_bodies)} email bodies")

    # Step 3: Combine all emails and extract companies via LLM
    combined = "\n\n---EMAIL SEPARATOR---\n\n".join(email_bodies)

    extract_prompt = (
        "Extract ALL unique companies mentioned in these interview/placement emails. "
        "For each company, identify the role and any timeline mentioned. "
        "Return JSON:\n"
        '{"companies": [{"company": "Name", "role": "Role or General", "time_left": "time or Not specified"}]}\n\n'
        f"Emails:\n{combined[:8000]}"
    )

    raw = await _call_groq_prep(extract_prompt)
    info = parse_json_safe(raw)

    if not info or "companies" not in info:
        info = {"companies": [{"company": "Unknown", "role": "Software Engineer", "time_left": "Not specified"}]}

    # Deduplicate companies by name
    seen: set[str] = set()
    unique_companies = []
    for c in info["companies"]:
        name = c.get("company", "").strip().lower()
        if name and name not in seen:
            seen.add(name)
            unique_companies.append(c)

    info["companies"] = unique_companies
    print(f"[GMAIL] Extracted {len(unique_companies)} unique companies: {[c['company'] for c in unique_companies]}")

    # Step 4: Generate prep data for each company
    result = await handle_email_mode(info)
    result["mode"] = "gmail"
    result["emails_scanned"] = len(email_bodies)
    return result
