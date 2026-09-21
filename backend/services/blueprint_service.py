"""
services/blueprint_service.py

Intake & Blueprint Engine:
Extracts resume text and generates an immutable, calibrated InterviewBlueprint
containing structured rounds, questions, and evidence-bound binary assertions.
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
from typing import List, Optional
from pydantic import BaseModel, Field
from pypdf import PdfReader
from groq import AsyncGroq
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

_groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

# In-memory blueprint store (keyed by session_id and blueprint_id)
_blueprint_store: dict[str, InterviewBlueprint] = {}

def save_blueprint(session_id: str, blueprint: InterviewBlueprint) -> None:
    """Store blueprint associated with a session or blueprint ID."""
    _blueprint_store[session_id] = blueprint
    _blueprint_store[blueprint.blueprint_id] = blueprint
    logger.info("[blueprint] Stored blueprint %s for session %s", blueprint.blueprint_id, session_id)

def get_blueprint(session_id: str) -> Optional[InterviewBlueprint]:
    """Retrieve blueprint by session_id or blueprint_id."""
    return _blueprint_store.get(session_id)

# ─────────────────────────────────────────────────────────────────────────────
# Blueprint Data Models
# ─────────────────────────────────────────────────────────────────────────────

class BinaryAssertion(BaseModel):
    name: str = Field(..., description="Short tag for the assertion")
    weight: float = Field(..., description="Weight in score calculation (0.0 - 1.0)")
    description: str = Field(..., description="Exact factual requirement for candidate answer")

class BlueprintQuestion(BaseModel):
    id: str = Field(..., description="Unique question identifier e.g. q_01")
    text: str = Field(..., description="The spoken question delivered by the interviewer")
    competency: str = Field(..., description="Specific engineering competency tested")
    category: str = Field(..., description="technical_dsa | system_design | behavioral | architecture")
    assertions: List[BinaryAssertion] = Field(default_factory=list, description="Binary assertions for evidence testing")
    model_answer: str = Field(..., description="Staff engineer reference benchmark")

class InterviewBlueprint(BaseModel):
    blueprint_id: str
    company: str
    role: str
    seniority: str
    keywords: List[str] = Field(default_factory=list, description="Technical terms boosted in STT engine")
    rounds: List[str] = Field(default_factory=list, description="List of rounds planned in this session")
    questions: List[BlueprintQuestion] = Field(..., description="Ordered list of questions")

# ─────────────────────────────────────────────────────────────────────────────
# PDF Extraction
# ─────────────────────────────────────────────────────────────────────────────

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract raw text from PDF file bytes using pypdf."""
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        extracted_text = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                extracted_text.append(text)
        full_text = "\n".join(extracted_text).strip()
        logger.info("[blueprint] Extracted %d characters from PDF", len(full_text))
        return full_text
    except Exception as e:
        logger.warning("[blueprint] PDF text extraction failed: %s", e)
        return ""

# ─────────────────────────────────────────────────────────────────────────────
# AI Blueprint Generation
# ─────────────────────────────────────────────────────────────────────────────

async def generate_blueprint(
    company: str,
    role: str,
    resume_text: str = "",
    jd_text: str = "",
    seniority: str = "Mid-Level",
) -> InterviewBlueprint:
    """
    Synthesizes an immutable InterviewBlueprint grounded on candidate resume and target JD.
    """
    company = company.strip() or "Tech Company"
    role = role.strip() or "Software Engineer"
    
    resume_snippet = resume_text[:3000] if resume_text else "(No resume provided - calibrate to industry standard for role)"
    jd_snippet = jd_text[:3000] if jd_text else "(No explicit JD provided - use canonical standards for role)"

    prompt = f"""You are a Principal Engineering Director designing an official Technical Interview Blueprint for {company} hiring a {seniority} {role}.

CANDIDATE RESUME HIGHLIGHTS:
---
{resume_snippet}
---

JOB DESCRIPTION REQUIREMENTS:
---
{jd_snippet}
---

TASK:
Design an immutable, evidence-bound Interview Blueprint containing exactly 3-5 core technical and architectural interview questions.
Every question must test genuine engineering competence and require trade-off analysis.

CRITICAL REQUIREMENTS:
1. "keywords": Extract 10-15 specific engineering tools, libraries, and frameworks from the resume/JD to boost in speech-to-text (e.g. ["PostgreSQL", "Redis", "Kafka", "Docker", "FastAPI"]).
2. "questions": 3 to 5 questions.
   For each question provide:
   - "id": "q_01", "q_02", etc.
   - "text": The exact conversational spoken question.
   - "competency": Core skill tested (e.g. "Distributed Concurrency", "Memory Hierarchy").
   - "category": "technical_dsa" | "system_design" | "behavioral" | "architecture"
   - "assertions": Exactly 3 binary verification criteria (weights sum to 1.0).
     - assertion 1: Foundation mechanism (weight 0.3)
     - assertion 2: Edge case / complexity bound (weight 0.3)
     - assertion 3: Operational trade-off / scaling failure mode (weight 0.4)
   - "model_answer": A 2-sentence Staff Engineer benchmark summary.

Return ONLY valid JSON matching this schema:
{{
  "blueprint_id": "bp_{re.sub(r'[^a-zA-Z0-9]', '_', company.lower())}_{re.sub(r'[^a-zA-Z0-9]', '_', role.lower())}",
  "company": "{company}",
  "role": "{role}",
  "seniority": "{seniority}",
  "keywords": ["Term1", "Term2", ...],
  "rounds": ["Technical Architecture", "System Design"],
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

    models = [
        os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b"),
        "groq/compound-mini",
        "groq/compound",
        "llama-3.3-70b-versatile"
    ]
    
    for model in models:
        try:
            res = await _groq_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are an elite technical interview designer that outputs valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=2200,
                response_format={"type": "json_object"}
            )
            raw = res.choices[0].message.content
            parsed = json.loads(raw)
            blueprint = InterviewBlueprint(**parsed)
            logger.info("[blueprint] Generated blueprint %s with %d questions", blueprint.blueprint_id, len(blueprint.questions))
            return blueprint
        except Exception as e:
            logger.warning("[blueprint] Generation failed on model %s: %s", model, e)
            continue
            
    # Deterministic fallback if API fails
    logger.error("[blueprint] All models failed — using deterministic fallback blueprint")
    return _build_fallback_blueprint(company, role, seniority)


def _build_fallback_blueprint(company: str, role: str, seniority: str) -> InterviewBlueprint:
    return InterviewBlueprint(
        blueprint_id=f"bp_fallback_{company.lower()}_{role.lower()}",
        company=company,
        role=role,
        seniority=seniority,
        keywords=["Algorithms", "Data Structures", "Scalability", "Concurrency", "Database", "API Design"],
        rounds=["Technical Problem Solving", "System Architecture"],
        questions=[
            BlueprintQuestion(
                id="q_01",
                text=f"Welcome to your technical interview for {company}. To start off, could you walk me through how you choose between an array-based structure and a linked list when performance is critical?",
                competency="Memory Layout & Data Access Complexity",
                category="technical_dsa",
                assertions=[
                    BinaryAssertion(name="memory_layout", weight=0.3, description="Explains contiguous memory in arrays vs pointer-linked heap nodes"),
                    BinaryAssertion(name="complexity", weight=0.3, description="States O(1) random access vs O(N) traversal access"),
                    BinaryAssertion(name="cpu_cache", weight=0.4, description="Identifies CPU cache spatial locality advantages in array structures")
                ],
                model_answer="Arrays provide contiguous memory allocation with O(1) indexing and superior CPU cache locality. Linked lists avoid reallocation overhead but introduce pointer overhead and poor cache performance."
            ),
            BlueprintQuestion(
                id="q_02",
                text="In high-throughput distributed systems, how do you handle state synchronization across multiple services without creating a single point of failure?",
                competency="Distributed Consensus & Decoupling",
                category="system_design",
                assertions=[
                    BinaryAssertion(name="event_driven", weight=0.3, description="Identifies event-driven asynchronous messaging or log-based replication"),
                    BinaryAssertion(name="eventual_consistency", weight=0.3, description="Explains eventual consistency trade-offs over synchronous locking"),
                    BinaryAssertion(name="idempotency", weight=0.4, description="Cites idempotency keys or distributed transaction mitigation strategies")
                ],
                model_answer="Strong candidates advocate for event-driven message brokers (e.g. Kafka) using eventual consistency and idempotent consumer workers rather than distributed two-phase commit transactions."
            ),
            BlueprintQuestion(
                id="q_03",
                text="Tell me about a complex technical bug or production outage you investigated in a past project. How did you isolate the root cause?",
                competency="Debugging & Root Cause Analysis",
                category="behavioral",
                assertions=[
                    BinaryAssertion(name="hypothesis_testing", weight=0.3, description="Demonstrates structured hypothesis testing rather than random guesswork"),
                    BinaryAssertion(name="telemetry_usage", weight=0.3, description="References telemetry, distributed tracing, metrics, or log aggregation"),
                    BinaryAssertion(name="preventative_action", weight=0.4, description="Explains permanent post-mortem remediation to prevent recurrence")
                ],
                model_answer="Senior candidates describe a systematic triage process using observability tools, isolating the failure domain, and implementing automated testing or alerting to prevent future incidents."
            )
        ]
    )
