"""
services/blueprint_service.py

Intake & Blueprint Engine:
Extracts candidate resume text from PDF and synthesizes a calibrated InterviewBlueprint
grounded in the candidate's actual projects, target role, and company requirements.
Eliminates live web search scraping in favor of deterministic question & binary assertion generation.
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
from typing import Dict, List, Optional
from pypdf import PdfReader
from groq import AsyncGroq
from dotenv import load_dotenv

from backend.models.schemas import (
    BinaryAssertion,
    BlueprintQuestion,
    InterviewBlueprint,
    QuestionCategory,
    SeniorityLevel,
)

load_dotenv()
logger = logging.getLogger(__name__)

_DEFAULT_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
_groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"), max_retries=0)

# In-memory blueprint store (keyed by session_id and blueprint_id)
_blueprint_store: Dict[str, InterviewBlueprint] = {}


def save_blueprint(session_id: str, blueprint: InterviewBlueprint) -> None:
    """Store blueprint associated with a session or blueprint ID."""
    _blueprint_store[session_id] = blueprint
    _blueprint_store[blueprint.blueprint_id] = blueprint
    logger.info("[blueprint] Stored blueprint %s for session %s (%d questions)",
                blueprint.blueprint_id, session_id, len(blueprint.questions))


def get_blueprint(session_id: str) -> Optional[InterviewBlueprint]:
    """Retrieve blueprint by session_id or blueprint_id."""
    return _blueprint_store.get(session_id)


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extract raw text from PDF file bytes using pypdf.
    Gracefully handles multi-column layouts and non-standard text encodings.
    """
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        extracted_text = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                extracted_text.append(text)
        full_text = "\n".join(extracted_text).strip()
        logger.info("[blueprint] Extracted %d characters from PDF resume (%d pages)", len(full_text), len(reader.pages))
        return full_text
    except Exception as e:
        logger.warning("[blueprint] PDF text extraction failed: %s", e)
        return ""


async def generate_blueprint(
    company: str,
    role: str,
    resume_text: str = "",
    jd_text: str = "",
    seniority: str = "Mid-Level",
) -> InterviewBlueprint:
    """
    Synthesizes an immutable, calibrated InterviewBlueprint grounded on candidate resume and target JD.
    Produces questions with verifiable BinaryAssertion sets and pre-boosted technical keywords.
    """
    clean_company = company.strip() or "Top-Tier Technology Firm"
    clean_role = role.strip() or "Software Engineer"
    
    # Map seniority string to enum
    seniority_map = {
        "junior": SeniorityLevel.JUNIOR,
        "mid-level": SeniorityLevel.MID,
        "mid": SeniorityLevel.MID,
        "senior": SeniorityLevel.SENIOR,
        "staff/principal": SeniorityLevel.STAFF,
        "staff": SeniorityLevel.STAFF,
        "principal": SeniorityLevel.STAFF,
    }
    seniority_enum = seniority_map.get(seniority.strip().lower(), SeniorityLevel.MID)

    resume_snippet = resume_text[:3000] if resume_text else "(No resume provided - calibrate to industry standard for role)"
    jd_snippet = jd_text[:2500] if jd_text else "(No explicit JD provided - use canonical standards for role)"

    prompt = f"""You are a Principal Engineering Director designing an official Technical Interview Blueprint for {clean_company} hiring a {seniority_enum.value} {clean_role}.

CANDIDATE RESUME HIGHLIGHTS:
---
{resume_snippet}
---

JOB DESCRIPTION REQUIREMENTS:
---
{jd_snippet}
---

TASK:
Design an immutable, evidence-bound Interview Blueprint containing exactly 3 core technical and architectural questions.
Every question must test genuine engineering competence, memory/scalability trade-offs, and failure mode recovery.

CRITICAL REQUIREMENTS:
1. "keywords": Extract 10-15 specific engineering tools, libraries, protocols, and frameworks (e.g. ["PostgreSQL", "Redis", "Kafka", "WebRTC", "Docker", "FastAPI"]).
2. "questions": Exactly 3 questions:
   - Question 1: Core Technical Foundations & Algorithms / Data Access (Category: "technical_dsa")
   - Question 2: Distributed Systems Architecture & Scaling Trade-Offs (Category: "system_design")
   - Question 3: Production Outage / Reliability & Failure Recovery (Category: "behavioral")
   For each question provide:
   - "id": "q_01", "q_02", "q_03"
   - "text": Spoken question, concise and natural (<35 words).
   - "competency": Core competency evaluated (e.g. "Distributed Concurrency", "Memory Hierarchy").
   - "category": "technical_dsa" | "system_design" | "behavioral"
   - "assertions": Exactly 3 binary verification criteria (weights sum to 1.0):
     - assertion 1: Core mechanism / fundamental concept (weight: 0.3)
     - assertion 2: Edge case / asymptotic complexity (weight: 0.3)
     - assertion 3: Operational failure mode / trade-off justification (weight: 0.4)
   - "model_answer": A 2-sentence Staff Engineer reference benchmark.

Return ONLY valid JSON matching this schema:
{{
  "blueprint_id": "bp_{re.sub(r'[^a-zA-Z0-9]', '_', clean_company.lower())}_{re.sub(r'[^a-zA-Z0-9]', '_', clean_role.lower())}",
  "company": "{clean_company}",
  "role": "{clean_role}",
  "seniority": "{seniority_enum.value}",
  "keywords": ["Term1", "Term2", ...],
  "rounds": ["Technical Problem Solving", "System Architecture", "Operational Reliability"],
  "questions": [
    {{
      "id": "q_01",
      "text": "...",
      "competency": "...",
      "category": "technical_dsa",
      "assertions": [
        {{"name": "...", "weight": 0.3, "description": "..."}},
        {{"name": "...", "weight": 0.3, "description": "..."}},
        {{"name": "...", "weight": 0.4, "description": "..."}}
      ],
      "model_answer": "..."
    }}
  ]
}}"""

    models_to_try = [
        os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b"),
        "openai/gpt-oss-20b",
        "openai/gpt-oss-120b",
    ]

    for model in models_to_try:
        try:
            res = await _groq_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are an elite technical interview architect that outputs strictly valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                max_tokens=650,
                response_format={"type": "json_object"}
            )
            raw = res.choices[0].message.content
            parsed = json.loads(raw)
            blueprint = InterviewBlueprint(**parsed)
            logger.info("[blueprint] Generated blueprint %s via model %s (%d questions)",
                        blueprint.blueprint_id, model, len(blueprint.questions))
            return blueprint
        except Exception as e:
            logger.warning("[blueprint] Blueprint generation failed on model %s: %s", model, e)
            continue

    logger.warning("[blueprint] All LLM models failed; constructing calibrated deterministic blueprint")
    return build_fallback_blueprint(clean_company, clean_role, seniority_enum)


def build_fallback_blueprint(
    company: str,
    role: str,
    seniority: SeniorityLevel = SeniorityLevel.MID
) -> InterviewBlueprint:
    """
    Deterministic fallback blueprint guaranteeing uninterrupted interview availability
    even when external AI APIs encounter network timeouts or rate limits.
    """
    return InterviewBlueprint(
        blueprint_id=f"bp_canonical_{re.sub(r'[^a-zA-Z0-9]', '_', company.lower())}_{re.sub(r'[^a-zA-Z0-9]', '_', role.lower())}",
        company=company,
        role=role,
        seniority=seniority,
        keywords=["Data Structures", "Distributed Systems", "Idempotency", "Concurrency", "Kafka", "Redis", "PostgreSQL"],
        rounds=["Technical Problem Solving", "Distributed Systems", "Operational Reliability"],
        questions=[
            BlueprintQuestion(
                id="q_01",
                text=f"Welcome to your technical session for {company}. When optimizing high-throughput APIs, how do you evaluate contiguous array-based memory versus pointer-linked node structures?",
                competency="Memory Layout & Data Access Complexity",
                category=QuestionCategory.TECHNICAL_DSA,
                assertions=[
                    BinaryAssertion(name="memory_layout", weight=0.3, description="Explains contiguous cache-line memory in arrays vs scattered heap pointer nodes"),
                    BinaryAssertion(name="asymptotic_bounds", weight=0.3, description="States O(1) direct indexing versus O(N) linear traversal cost"),
                    BinaryAssertion(name="cpu_cache_locality", weight=0.4, description="Cites CPU L1/L2 cache spatial locality advantages in array buffers")
                ],
                model_answer="Arrays provide contiguous memory allocation with O(1) indexing and superior CPU cache locality. Linked structures avoid reallocation overhead but introduce pointer indirection and poor cache line utilization."
            ),
            BlueprintQuestion(
                id="q_02",
                text="In high-throughput microservices, how do you handle state synchronization across multiple services without creating single points of failure?",
                competency="Distributed Consensus & Decoupling",
                category=QuestionCategory.SYSTEM_DESIGN,
                assertions=[
                    BinaryAssertion(name="event_driven", weight=0.3, description="Identifies event-driven asynchronous messaging or log-based replication"),
                    BinaryAssertion(name="eventual_consistency", weight=0.3, description="Explains eventual consistency trade-offs over synchronous locking"),
                    BinaryAssertion(name="idempotency", weight=0.4, description="Cites idempotency keys or distributed transaction mitigation strategies")
                ],
                model_answer="Strong candidates advocate for event-driven message brokers (e.g. Kafka) using eventual consistency and idempotent consumer workers rather than distributed two-phase commit transactions."
            ),
            BlueprintQuestion(
                id="q_03",
                text="Tell me about a complex production outage or high-latency bug you investigated. How did you isolate the root cause and ensure it never recurred?",
                competency="Debugging & Root Cause Analysis",
                category=QuestionCategory.BEHAVIORAL,
                assertions=[
                    BinaryAssertion(name="hypothesis_testing", weight=0.3, description="Demonstrates structured hypothesis testing rather than random guesswork"),
                    BinaryAssertion(name="telemetry_usage", weight=0.3, description="References telemetry, distributed tracing, metrics, or log aggregation"),
                    BinaryAssertion(name="permanent_remediation", weight=0.4, description="Explains permanent post-mortem remediation to prevent recurrence")
                ],
                model_answer="Senior candidates describe a systematic triage process using observability tools, isolating the failure domain, and implementing automated testing or alerting to prevent future incidents."
            )
        ]
    )
