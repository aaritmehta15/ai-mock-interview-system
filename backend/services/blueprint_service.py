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
import sqlite3
from pathlib import Path
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

# ── Blueprint Store: in-memory cache backed by SQLite persistence ──────────────
_blueprint_store: Dict[str, InterviewBlueprint] = {}

_BP_DB_PATH = os.getenv("LEDGER_DB_PATH", str(Path(__file__).resolve().parent.parent / "ledger.db"))


def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(_BP_DB_PATH, timeout=10.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_blueprint_table() -> None:
    """Ensure the blueprint persistence table exists in the SQLite DB."""
    conn = _get_db()
    try:
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS blueprints (
                    key TEXT PRIMARY KEY,
                    blueprint_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)
    finally:
        conn.close()


_init_blueprint_table()


def save_blueprint(session_id: str, blueprint: InterviewBlueprint) -> None:
    """Store blueprint in memory AND persist to SQLite so it survives backend restarts."""
    from datetime import datetime, timezone
    _blueprint_store[session_id] = blueprint
    _blueprint_store[blueprint.blueprint_id] = blueprint
    # Persist to SQLite
    bp_json = blueprint.model_dump_json()
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_db()
    try:
        with conn:
            for key in (session_id, blueprint.blueprint_id):
                conn.execute(
                    "INSERT OR REPLACE INTO blueprints (key, blueprint_json, updated_at) VALUES (?, ?, ?)",
                    (key, bp_json, now)
                )
    finally:
        conn.close()
    logger.info("[blueprint] Stored blueprint %s for session %s (%d questions)",
                blueprint.blueprint_id, session_id, len(blueprint.questions))


def get_blueprint(session_id: str) -> Optional[InterviewBlueprint]:
    """Retrieve blueprint from in-memory cache; fall back to SQLite persistence or most recent blueprint."""
    if session_id in _blueprint_store:
        return _blueprint_store[session_id]
    # Check SQLite persistence (survives backend restarts)
    conn = _get_db()
    try:
        # 1. Direct match for session_id
        row = conn.execute(
            "SELECT blueprint_json FROM blueprints WHERE key = ?",
            (session_id,)
        ).fetchone()
        if row:
            bp = InterviewBlueprint.model_validate_json(row["blueprint_json"])
            _blueprint_store[session_id] = bp  # warm the cache
            logger.info("[blueprint] Restored blueprint from SQLite for session %s (%d questions)",
                        session_id, len(bp.questions))
            return bp

        # 2. Re-associate the most recently generated blueprint from SQLite
        row = conn.execute(
            "SELECT blueprint_json FROM blueprints ORDER BY updated_at DESC LIMIT 1"
        ).fetchone()
        if row:
            bp = InterviewBlueprint.model_validate_json(row["blueprint_json"])
            _blueprint_store[session_id] = bp  # link to this new session
            logger.info("[blueprint] Linked active recent blueprint %s to new session %s (%d questions)",
                        bp.blueprint_id, session_id, len(bp.questions))
            return bp
    except Exception as e:
        logger.warning("[blueprint] SQLite restore failed for session %s: %s", session_id, e)
    finally:
        conn.close()
    return None


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

    has_resume = bool(resume_text and len(resume_text.strip()) > 30)

    if has_resume:
        dynamic_part2_instruction = f"""
- ROUND 2 (Questions 4 to 6) — CANDIDATE RESUME & PROJECT DEEP DIVE:
  Because the candidate provided a resume, Questions 4, 5, and 6 MUST be framed directly from their actual projects, claimed skills, and architecture experience:
  * Question 4 (id: "q_04"): Deep-dive into a prominent project or system from their resume. Ask why they chose that specific architecture, how they handled scalability/latency, and what key trade-offs they made. (Category: "system_design", Competency: "Resume Project Architecture & Design").
  * Question 5 (id: "q_05"): In-depth technical verification of specific tools, libraries, or frameworks claimed on their resume. Test real production depth, edge cases, and memory/concurrency constraints rather than surface trivia. (Category: "technical_dsa", Competency: "Hands-on Framework & Tooling Mastery").
  * Question 6 (id: "q_06"): Production retrospective from their work history. Ask about a real technical compromise, scaling failure mode, or complex bug they tackled in their past projects, and how they would redesign it today. (Category: "behavioral", Competency: "Engineering Judgement & Project Retrospective").
"""
        round_labels = [
            "Technical Foundations",
            "Distributed Systems",
            "Operational Reliability",
            "Project Architecture Deep-Dive",
            "Hands-on Tooling & Skills Mastery",
            "Production Retrospective & Judgement",
        ]
    else:
        dynamic_part2_instruction = f"""
- ROUND 2 (Questions 4 to 6) — TARGET DOMAIN & SENIORITY ARCHITECTURE DEEP DIVE:
  Because no resume was uploaded, dynamically formulate 3 high-impact questions tailored specifically to what is critical for a {seniority_enum.value} {clean_role} at {clean_company}:
  * Question 4 (id: "q_04"): High-scale architectural challenge tailored to {clean_company}'s domain (e.g. data ingestion bottlenecks, distributed indexing, global caching, or massive concurrency). (Category: "system_design", Competency: "Target Domain Scalability & Architecture").
  * Question 5 (id: "q_05"): Low-level runtime internals, memory hierarchy, connection pooling, or thread safety critical for a {seniority_enum.value} {clean_role}. (Category: "technical_dsa", Competency: "Systems Internals & Resource Management").
  * Question 6 (id: "q_06"): High-stakes engineering trade-offs, technical debt prioritization, and post-mortem incident remediation. (Category: "behavioral", Competency: "Strategic Engineering Trade-Offs & Post-Mortem").
"""
        round_labels = [
            "Technical Foundations",
            "Distributed Systems",
            "Operational Reliability",
            "Domain Scalability Challenge",
            "Runtime Internals & Concurrency",
            "Strategic Engineering Trade-Offs",
        ]

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
Design an immutable, evidence-bound Interview Blueprint containing exactly 6 calibrated technical and architectural questions:
- ROUND 1 (Questions 1 to 3): Foundational Technical & Architectural Competencies
  * Question 1 (id: "q_01"): Core Technical Foundations & Algorithms / Data Access (Category: "technical_dsa")
  * Question 2 (id: "q_02"): Distributed Systems Architecture & Scaling Trade-Offs (Category: "system_design")
  * Question 3 (id: "q_03"): Production Outage / Reliability & Failure Recovery (Category: "behavioral")
{dynamic_part2_instruction}

CRITICAL REQUIREMENTS:
1. "keywords": Extract 12-20 specific engineering tools, libraries, protocols, and frameworks (e.g. ["PostgreSQL", "Redis", "Kafka", "WebRTC", "Docker", "FastAPI"]).
2. "questions": Exactly 6 questions (q_01, q_02, q_03, q_04, q_05, q_06).
   For EACH of the 6 questions provide:
   - "id": "q_01", "q_02", "q_03", "q_04", "q_05", "q_06"
   - "text": Spoken question, concise and natural (<35 words).
   - "competency": Specific evaluated competency.
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
  "rounds": {json.dumps(round_labels)},
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
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b"),
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
                max_tokens=2800,  # 6 full questions + 3 assertions each = ~1400 tokens
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
    seniority: SeniorityLevel | str = SeniorityLevel.STAFF
) -> InterviewBlueprint:
    """
    Deterministic fallback blueprint guaranteeing uninterrupted interview availability
    with full 6 questions (foundational technical + practical deep-dives).
    """
    seniority_map = {
        "junior": SeniorityLevel.JUNIOR,
        "mid-level": SeniorityLevel.MID,
        "mid": SeniorityLevel.MID,
        "senior": SeniorityLevel.SENIOR,
        "staff/principal": SeniorityLevel.STAFF,
        "staff": SeniorityLevel.STAFF,
        "principal": SeniorityLevel.STAFF,
    }
    if isinstance(seniority, str):
        seniority_enum = seniority_map.get(seniority.strip().lower(), SeniorityLevel.STAFF)
    else:
        seniority_enum = seniority

    clean_company = company.strip() or "Technology Firm"
    clean_role = role.strip() or "Software Engineer"

    return InterviewBlueprint(
        blueprint_id=f"bp_canonical_{re.sub(r'[^a-zA-Z0-9]', '_', clean_company.lower())}_{re.sub(r'[^a-zA-Z0-9]', '_', clean_role.lower())}",
        company=clean_company,
        role=clean_role,
        seniority=seniority_enum,
        keywords=["Data Structures", "Distributed Systems", "Idempotency", "Concurrency", "Kafka", "Redis", "PostgreSQL", "Observability", "Trade-Offs"],
        rounds=[
            "Technical Foundations",
            "Distributed Systems Architecture",
            "Operational Reliability",
            "Hands-On Project Deep-Dive",
            "Tooling & Runtime Internals",
            "Engineering Retrospective & Trade-Offs",
        ],
        questions=[
            BlueprintQuestion(
                id="q_01",
                text=f"Welcome to your technical session for {clean_company}. When optimizing high-throughput APIs, how do you evaluate contiguous array-based memory versus pointer-linked node structures?",
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
            ),
            BlueprintQuestion(
                id="q_04",
                text="Walk me through a prominent project or system you engineered. What major architectural trade-off did you make between synchronous RPC calls and asynchronous decoupled event streams?",
                competency="Project Architecture & System Trade-Offs",
                category=QuestionCategory.SYSTEM_DESIGN,
                assertions=[
                    BinaryAssertion(name="rpc_vs_events", weight=0.3, description="Contrasts synchronous latency/tight coupling vs asynchronous eventual consistency"),
                    BinaryAssertion(name="failure_isolation", weight=0.3, description="Addresses cascade failure isolation, circuit breaking, or queue backpressure"),
                    BinaryAssertion(name="production_rationale", weight=0.4, description="Provides concrete justification based on traffic patterns and SLA guarantees")
                ],
                model_answer="Candidates articulate choosing async event queues for non-blocking decoupling and spike absorption, while retaining gRPC for strict read-after-write consistency requirements."
            ),
            BlueprintQuestion(
                id="q_05",
                text="Under heavy 10x traffic spikes, how do you handle memory allocation bottlenecks, connection pooling limits, or database hot partition contention in your stack?",
                competency="Framework & Infrastructure Internals",
                category=QuestionCategory.TECHNICAL_DSA,
                assertions=[
                    BinaryAssertion(name="resource_contention", weight=0.3, description="Identifies connection pool exhaustion, thread starvation, or hot partition skew"),
                    BinaryAssertion(name="mitigation_patterns", weight=0.3, description="Proposes salt keys, read replicas, local caching, or connection multiplexing"),
                    BinaryAssertion(name="quantifiable_bounds", weight=0.4, description="States quantifiable bounds, timeouts, or thread pool sizing calculations")
                ],
                model_answer="Engineers address hot partitions using salted partition keys, connection pool limits tuned to worker threads, and multi-tier caching with exponential jitter backoff."
            ),
            BlueprintQuestion(
                id="q_06",
                text="Reflecting on your past engineering work, describe an architectural decision you made that later proved to be a bottleneck or technical debt. How would you redesign it today?",
                competency="Engineering Retrospective & Post-Mortem Judgement",
                category=QuestionCategory.BEHAVIORAL,
                assertions=[
                    BinaryAssertion(name="self_awareness", weight=0.3, description="Candidly identifies concrete architectural bottlenecks or tech debt incurred"),
                    BinaryAssertion(name="root_cause_analysis", weight=0.3, description="Explains why the original choice degraded under scale or evolving requirements"),
                    BinaryAssertion(name="redesign_maturity", weight=0.4, description="Presents a mature redesign using decoupled patterns, better observability, or modular schemas")
                ],
                model_answer="Staff engineers demonstrate self-reflection, explaining how early monolithic abstractions or premature optimizations created operational friction and detailing a resilient redesign."
            )
        ]
    )
