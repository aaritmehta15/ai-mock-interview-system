from __future__ import annotations

import logging
from typing import Any, Dict

from services.groq_service import _call_groq, extract_json

logger = logging.getLogger(__name__)

async def generate_war_room_tasks(company: str, role: str) -> Dict[str, Any] | None:
    """
    Generate dynamic Aptitude questions and a Coding problem for the given company and role.
    """
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert technical interviewer and assessment designer for top tech companies. "
                "Generate an aptitude test and a coding challenge tailored to the specified company and role. "
                "Respond ONLY with a valid JSON object. Do not use backticks (`) for strings; use standard JSON double-quoted strings with escaped newlines."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Target Company: {company}\nTarget Role: {role}\n\n"
                "Return exactly this JSON structure:\n"
                "{\n"
                '  "aptitude_questions": [\n'
                '    {\n'
                '      "question": "string",\n'
                '      "options": ["string", "string", "string", "string"],\n'
                '      "correctIndex": number,\n'
                '      "explanation": "string"\n'
                '    }\n'
                '  ],\n'
                '  "coding_problem": {\n'
                '    "title": "string",\n'
                '    "description": "string",\n'
                '    "starter_code": "string (escaped code snippet)"\n'
                '  }\n'
                "}\n\n"
                "Constraints:\n"
                "- Provide exactly 3 aptitude questions.\n"
                "- Provide exactly 1 coding problem relevant to the difficulty expected by the company.\n"
                "- Ensure 'starter_code' is a valid JSON string (no backticks)."
            ),
        },
    ]

    raw = await _call_groq(
        messages, 
        temperature=0.7,
        response_format={"type": "json_object"}
    )
    if not raw:
        logger.error("Groq returned empty response for generate_war_room_tasks")
        return None

    logger.info("Raw Groq response: %s", raw)
    parsed = extract_json(raw)
    if not parsed:
        logger.error("Failed to extract JSON from Groq response: %s", raw)
    return parsed

async def evaluate_war_room(payload: Dict[str, Any]) -> Dict[str, Any] | None:
    """
    Evaluate the user's performance across Aptitude, Coding, and Technical Mock Review.
    """
    aptitude_score = payload.get("aptitude_score", 0)
    total_aptitude = payload.get("total_aptitude", 0)
    code = payload.get("code", "")
    coding_problem = payload.get("coding_problem", "")
    explanation = payload.get("explanation", "")
    company = payload.get("company", "Tech Company")

    messages = [
        {
            "role": "system",
            "content": (
                "You are an elite Senior Engineer and Hiring Manager evaluating a candidate's War Room assessment. "
                "You will grade them based on their Aptitude score, raw Code submission, and their verbal/written Explanation of their approach. "
                "Respond ONLY with a valid JSON object — no prose."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Company Context: {company}\n"
                f"Aptitude Score: {aptitude_score}/{total_aptitude}\n\n"
                f"Coding Problem:\n{coding_problem}\n\n"
                f"Candidate's Code:\n{code}\n\n"
                f"Candidate's Explanation / Mock Interview Answer:\n{explanation}\n\n"
                "Return ONLY this JSON:\n"
                "{\n"
                '  "aptitude_feedback": "<1-2 sentences on their aptitude performance>",\n'
                '  "coding_feedback": "<2-3 sentences evaluating code correctness, logic, and efficiency>",\n'
                '  "communication_feedback": "<2-3 sentences evaluating their explanation and complexity analysis>",\n'
                '  "final_score": <number from 0 to 100>,\n'
                '  "verdict": "<Strong Hire | Hire | No Hire | Needs Practice>"\n'
                "}\n\n"
                "Return ONLY the JSON. No other text."
            ),
        },
    ]

    raw = await _call_groq(
        messages, 
        temperature=0.4,
        response_format={"type": "json_object"}
    )
    if not raw:
        return None

    parsed = extract_json(raw)
    return parsed
