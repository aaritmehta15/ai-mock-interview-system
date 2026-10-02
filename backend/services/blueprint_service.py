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

# Locate .env in backend/ or root
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    load_dotenv()

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
_groq_api_key = os.getenv("GROQ_API_KEY")
_groq_client = AsyncGroq(api_key=_groq_api_key, max_retries=0) if _groq_api_key else None

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
    primary_language: Optional[str] = "Python",
    interview_focus: Optional[str] = "Balanced Screening",
    spotlight_topic: Optional[str] = "",
) -> InterviewBlueprint:
    """
    Synthesizes an immutable, calibrated InterviewBlueprint grounded on candidate profile,
    resume, target JD, primary programming language, and interview practice focus.
    Produces questions with verifiable BinaryAssertion sets and pre-boosted technical keywords.
    """
    clean_company = company.strip() or "Top-Tier Technology Firm"
    clean_role = role.strip() or "Software Engineer"
    clean_language = (primary_language or "Python").strip()
    clean_focus = (interview_focus or "Balanced Screening").strip()
    clean_spotlight = (spotlight_topic or "").strip()
    
    if isinstance(seniority, SeniorityLevel):
        seniority_enum = seniority
    elif isinstance(seniority, str):
        s_clean = seniority.strip().lower()
        if "student" in s_clean or "intern" in s_clean or "fresher" in s_clean or "college" in s_clean:
            seniority_enum = SeniorityLevel.STUDENT
        elif "junior" in s_clean:
            seniority_enum = SeniorityLevel.JUNIOR
        elif "senior" in s_clean:
            seniority_enum = SeniorityLevel.SENIOR
        elif "staff" in s_clean or "principal" in s_clean:
            seniority_enum = SeniorityLevel.STAFF
        else:
            seniority_enum = SeniorityLevel.MID
    else:
        seniority_enum = SeniorityLevel.MID

    resume_snippet = resume_text[:3000] if resume_text else "(No resume provided - calibrate to industry standard for role)"
    jd_snippet = jd_text[:2500] if jd_text else "(No explicit JD provided - use canonical standards for role)"

    has_resume = bool(resume_text and len(resume_text.strip()) > 30)
    is_student = seniority_enum == SeniorityLevel.STUDENT

    if is_student:
        level_instruction = f"""
- CANDIDATE SENIORITY CALIBRATION (STUDENT / INTERN / FRESHER):
  The candidate is an aspiring engineer / college student or recent graduate.
  * DO NOT ask questions about managing multi-million-dollar distributed enterprise outages or 10-year legacy migrations.
  * FOCUS ON: Computer science fundamentals, algorithmic problem solving in {clean_language}, code modularity, curiosity, deep understanding of their academic/capstone projects, and how they isolate and debug bugs when code fails.
"""
    elif seniority_enum == SeniorityLevel.STAFF:
        level_instruction = """
- CANDIDATE SENIORITY CALIBRATION (STAFF / PRINCIPAL):
  The candidate is targeting Staff+ leadership. Probe large-scale distributed systems, multi-region failure modes, non-functional trade-offs, and strategic technical debt remediation.
"""
    else:
        level_instruction = f"""
- CANDIDATE SENIORITY CALIBRATION ({seniority_enum.value.upper()}):
  Probe practical implementation, concurrency, caching, data modeling, clean component contracts, and production maintainability in {clean_language}.
"""

    spotlight_instruction = ""
    if clean_spotlight:
        spotlight_instruction = f"""
- CANDIDATE SPOTLIGHT REQUEST:
  The candidate specifically requested to spotlight/test: "{clean_spotlight}".
  Question 4 or 5 MUST directly challenge the candidate on this project or concept.
"""

    if has_resume:
        dynamic_part2_instruction = f"""
- ROUND 2 (Questions 4 to 6) — CANDIDATE EXPERIENCE & PROJECT DEEP DIVE:
  Because the candidate provided a resume, Questions 4, 5, and 6 MUST be framed directly from their actual projects, claimed skills, and architecture experience in {clean_language}:
  * Question 4 (id: "q_04"): Deep-dive into a prominent capstone, internship, or open-source project from their resume (or spotlight topic). Probe why they chose that architecture, how they handled data flow, and key trade-offs. (Category: "system_design", Competency: "Project Architecture & System Decisions").
  * Question 5 (id: "q_05"): Hands-on technical verification of specific tools, libraries, or algorithms claimed on their resume using {clean_language}. Test real implementation depth and edge cases. (Category: "technical_dsa", Competency: "Hands-on Language & Framework Mastery").
  * Question 6 (id: "q_06"): Engineering retrospective from their projects. Ask about a real technical compromise, bug, or scaling obstacle they tackled in their work, and how they would redesign it today. (Category: "behavioral", Competency: "Engineering Judgement & Project Retrospective").
"""
        round_labels = [
            "Technical Foundations",
            "Practical Problem Solving",
            "Component / System Design",
            "Project Architecture Deep-Dive",
            "Hands-on Tooling & Skills Mastery",
            "Engineering Retrospective & Judgement",
        ]
    else:
        dynamic_part2_instruction = f"""
- ROUND 2 (Questions 4 to 6) — TARGET DOMAIN & ARCHITECTURE CHALLENGES:
  Because no resume was uploaded, formulate 3 high-impact questions tailored specifically to what is critical for a {seniority_enum.value} {clean_role} at {clean_company} using {clean_language}:
  * Question 4 (id: "q_04"): Practical engineering challenge tailored to {clean_company}'s domain (e.g. data ingestion bottlenecks, caching, indexing, or real-time streaming). (Category: "system_design", Competency: "Target Domain Architecture Challenge").
  * Question 5 (id: "q_05"): Low-level runtime internals, memory management, or concurrency in {clean_language} (e.g. thread safety, async event loop, connection pooling). (Category: "technical_dsa", Competency: "Language Internals & Resource Management").
  * Question 6 (id: "q_06"): Real-world engineering trade-offs, technical debt prioritization, and incident remediation. (Category: "behavioral", Competency: "Strategic Engineering Trade-Offs & Judgement").
"""
        round_labels = [
            "Technical Foundations",
            "Practical Problem Solving",
            "Component / System Design",
            "Domain Engineering Challenge",
            "Runtime Internals & Concurrency",
            "Strategic Engineering Trade-Offs",
        ]

    prompt = f"""You are a Principal Engineering Director designing an official Technical Interview Blueprint for {clean_company} hiring a {seniority_enum.value} {clean_role}.

CANDIDATE CALIBRATION:
- Primary Programming Language / Tech Stack: {clean_language}
- Target Practice Focus: {clean_focus}
- Seniority Tier: {seniority_enum.value}
- Target Company: {clean_company}
- Target Role: {clean_role}
{level_instruction}
{spotlight_instruction}

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
- ROUND 1 (Questions 1 to 3): Foundational Technical & Problem Solving in {clean_language}
  * Question 1 (id: "q_01"): Core Technical Foundations & Algorithms / Data Access in {clean_language} (Category: "technical_dsa")
  * Question 2 (id: "q_02"): Practical Implementation & Edge-Case Problem Solving (Category: "technical_dsa")
  * Question 3 (id: "q_03"): Component or Architecture Design calibrated for a {seniority_enum.value} {clean_role} (Category: "system_design")
{dynamic_part2_instruction}

CRITICAL REQUIREMENTS:
1. "domain": Identify the primary engineering discipline (e.g. "Frontend Engineering", "Backend & Distributed Systems", "Machine Learning / AI", "Full-Stack Development", "Mobile Systems").
2. "strategy_summary": A 1-2 sentence executive briefing explaining what this personalized interview tests and why for a {seniority_enum.value} candidate.
3. "preparation_tips": Exactly 3 practical, actionable tips for the candidate to succeed in this session.
4. "keywords": Extract 12-20 specific engineering tools, libraries, protocols, and language concepts (e.g. in {clean_language}).
5. "questions": Exactly 6 questions (q_01, q_02, q_03, q_04, q_05, q_06).
   For EACH of the 6 questions provide:
   - "id": "q_01", "q_02", "q_03", "q_04", "q_05", "q_06"
   - "text": Spoken question, concise and natural (<35 words).
   - "competency": Specific evaluated competency.
   - "category": "technical_dsa" | "system_design" | "behavioral"
   - "assertions": Exactly 3 binary verification criteria (weights sum to 1.0):
     - assertion 1: Core mechanism / fundamental concept (weight: 0.3)
     - assertion 2: Edge case / asymptotic complexity (weight: 0.3)
     - assertion 3: Operational failure mode / trade-off justification (weight: 0.4)
   - "model_answer": A 2-sentence reference benchmark answer.

Return ONLY valid JSON matching this schema:
{{
  "blueprint_id": "bp_{re.sub(r'[^a-zA-Z0-9]', '_', clean_company.lower())}_{re.sub(r'[^a-zA-Z0-9]', '_', clean_role.lower())}",
  "company": "{clean_company}",
  "role": "{clean_role}",
  "seniority": "{seniority_enum.value}",
  "domain": "Detected discipline",
  "primary_language": "{clean_language}",
  "interview_focus": "{clean_focus}",
  "spotlight_topic": "{clean_spotlight}",
  "strategy_summary": "1-2 sentence executive summary of interview focus and calibration",
  "preparation_tips": [
    "Tip 1...",
    "Tip 2...",
    "Tip 3..."
  ],
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

    if not _groq_client:
        logger.warning("[blueprint] GROQ_API_KEY not set; falling back to calibrated deterministic blueprint")
        return build_fallback_blueprint(
            company=clean_company,
            role=clean_role,
            seniority=seniority_enum,
            primary_language=clean_language,
            interview_focus=clean_focus,
            spotlight_topic=clean_spotlight,
        )

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
            # Ensure new fields are present if LLM omitted any
            parsed.setdefault("primary_language", clean_language)
            parsed.setdefault("interview_focus", clean_focus)
            parsed.setdefault("spotlight_topic", clean_spotlight)
            parsed.setdefault("strategy_summary", f"Calibrated {seniority_enum.value} technical interview targeting {clean_role} at {clean_company} with focus on {clean_focus} in {clean_language}.")
            parsed.setdefault("preparation_tips", [
                f"State your assumptions early and walk through your logic before writing {clean_language} code.",
                "Discuss algorithmic time and space complexity with concrete Big-O bounds.",
                "Highlight trade-offs (e.g. latency vs memory) in your project architecture decisions."
            ])
            # Sanitize preparation_tips to ensure List[str]
            if "preparation_tips" in parsed and isinstance(parsed["preparation_tips"], list):
                clean_tips = []
                for item in parsed["preparation_tips"]:
                    if isinstance(item, str):
                        clean_tips.append(item)
                    elif isinstance(item, list):
                        clean_tips.extend([str(s) for s in item if isinstance(s, (str, int, float))])
                    else:
                        clean_tips.append(str(item))
                parsed["preparation_tips"] = [t for t in clean_tips if t][:4]

            # Sanitize keywords to ensure List[str]
            if "keywords" in parsed and isinstance(parsed["keywords"], list):
                clean_kw = []
                for kw in parsed["keywords"]:
                    if isinstance(kw, str):
                        clean_kw.append(kw)
                    elif isinstance(kw, list):
                        clean_kw.extend([str(k) for k in kw if isinstance(k, (str, int, float))])
                parsed["keywords"] = clean_kw

            # Sanitize questions model_answer
            if "questions" in parsed and isinstance(parsed["questions"], list):
                for q in parsed["questions"]:
                    if isinstance(q, dict):
                        q.setdefault("model_answer", "Reference benchmark answer demonstrating core algorithmic concepts, asymptotic complexity, and trade-offs.")

            blueprint = InterviewBlueprint(**parsed)
            if len(blueprint.questions) < 3:
                logger.warning("[blueprint] LLM returned blueprint with insufficient questions (%d); trying next model", len(blueprint.questions))
                continue

            logger.info("[blueprint] Generated blueprint %s via model %s (%d questions)",
                        blueprint.blueprint_id, model, len(blueprint.questions))
            return blueprint
        except Exception as e:
            logger.warning("[blueprint] Blueprint generation failed on model %s: %s", model, e)
            continue

    logger.warning("[blueprint] All LLM models failed; constructing calibrated deterministic blueprint")
    return build_fallback_blueprint(
        company=clean_company,
        role=clean_role,
        seniority=seniority_enum,
        primary_language=clean_language,
        interview_focus=clean_focus,
        spotlight_topic=clean_spotlight,
    )


def build_fallback_blueprint(
    company: str,
    role: str,
    seniority: SeniorityLevel | str = SeniorityLevel.MID,
    primary_language: str = "Python",
    interview_focus: str = "Balanced Screening",
    spotlight_topic: str = "",
) -> InterviewBlueprint:
    """
    Deterministic fallback blueprint guaranteeing uninterrupted interview availability
    with full 6 questions adapted to candidate seniority (student vs experienced).
    """
    if isinstance(seniority, SeniorityLevel):
        seniority_enum = seniority
    elif isinstance(seniority, str):
        s_clean = seniority.strip().lower()
        if "student" in s_clean or "intern" in s_clean or "fresher" in s_clean or "college" in s_clean:
            seniority_enum = SeniorityLevel.STUDENT
        elif "junior" in s_clean:
            seniority_enum = SeniorityLevel.JUNIOR
        elif "senior" in s_clean:
            seniority_enum = SeniorityLevel.SENIOR
        elif "staff" in s_clean or "principal" in s_clean:
            seniority_enum = SeniorityLevel.STAFF
        else:
            seniority_enum = SeniorityLevel.MID
    else:
        seniority_enum = SeniorityLevel.MID

    clean_company = company.strip() or "Technology Firm"
    clean_role = role.strip() or "Software Engineer"
    clean_language = (primary_language or "Python").strip()
    is_student = seniority_enum == SeniorityLevel.STUDENT

    if is_student:
        return InterviewBlueprint(
            blueprint_id=f"bp_student_{re.sub(r'[^a-zA-Z0-9]', '_', clean_company.lower())}_{re.sub(r'[^a-zA-Z0-9]', '_', clean_role.lower())}",
            company=clean_company,
            role=clean_role,
            seniority=SeniorityLevel.STUDENT,
            domain="Software Engineering Fundamentals",
            primary_language=clean_language,
            interview_focus=interview_focus,
            spotlight_topic=spotlight_topic,
            strategy_summary=f"Student & Fresher calibration: Evaluates core CS data structures in {clean_language}, clean modular architecture, and structured debugging.",
            preparation_tips=[
                f"Explain the time and space complexity of your {clean_language} code clearly.",
                "Describe how you test your code for boundary edge cases (nulls, empty collections, off-by-one errors).",
                "Be ready to discuss the design choices and trade-offs of your capstone or course project."
            ],
            keywords=["Data Structures", clean_language, "Time Complexity", "Space Complexity", "Debugging", "Modular Design", "Unit Testing", "APIs", "Git"],
            rounds=[
                "Core Data Structures & Complexity",
                "Algorithmic Logic & Boundary Cases",
                "Modular Component Design",
                "Capstone Project Deep-Dive",
                "Structured Debugging & Edge Cases",
                "Technical Retrospective & Growth",
            ],
            questions=[
                BlueprintQuestion(
                    id="q_01",
                    text=f"Welcome to your technical session for {clean_company}. In {clean_language}, how do you evaluate the trade-offs between contiguous array-based lists and hash map / dictionary lookups?",
                    competency="Data Structures & Lookup Complexity",
                    category=QuestionCategory.TECHNICAL_DSA,
                    assertions=[
                        BinaryAssertion(name="asymptotic_bounds", weight=0.3, description="Identifies O(1) average hash lookup vs O(1) indexed list access vs O(N) linear search"),
                        BinaryAssertion(name="memory_overhead", weight=0.3, description="Explains hash table bucket collision handling and memory overhead compared to lists"),
                        BinaryAssertion(name="use_case_justification", weight=0.4, description="Provides concrete use case for when to choose an array list over a hash table")
                    ],
                    model_answer=f"In {clean_language}, lists provide contiguous memory with O(1) indexing by position, while hash maps provide O(1) average key-value lookups with hash calculation and collision overhead."
                ),
                BlueprintQuestion(
                    id="q_02",
                    text="When implementing an algorithm that processes incoming user data, how do you handle boundary edge cases like empty inputs, duplicate entries, or off-by-one errors?",
                    competency="Defensive Coding & Boundary Conditions",
                    category=QuestionCategory.TECHNICAL_DSA,
                    assertions=[
                        BinaryAssertion(name="boundary_validation", weight=0.3, description="Explains explicit input validation for null, empty, or unexpected values"),
                        BinaryAssertion(name="deduplication_approach", weight=0.3, description="Proposes hash set or sorting for handling duplicate keys in linear or log-linear time"),
                        BinaryAssertion(name="test_verification", weight=0.4, description="Mentions unit test assertions or edge case test fixtures")
                    ],
                    model_answer="Strong candidates demonstrate defensive input guards, validate boundaries before loops, and write automated tests for empty and duplicate inputs."
                ),
                BlueprintQuestion(
                    id="q_03",
                    text="In software development, how do you structure your code into modular classes or functions to achieve clean separation of concerns?",
                    competency="Code Modularity & Clean Architecture",
                    category=QuestionCategory.SYSTEM_DESIGN,
                    assertions=[
                        BinaryAssertion(name="single_responsibility", weight=0.3, description="Cites single responsibility principle or keeping functions focused"),
                        BinaryAssertion(name="dependency_isolation", weight=0.3, description="Decouples business logic from input/output or database calls"),
                        BinaryAssertion(name="maintainability_rationale", weight=0.4, description="Explains how modularity simplifies unit testing and future refactoring")
                    ],
                    model_answer="Candidates articulate organizing code into distinct layers (e.g. data access, service logic, controller) so each component can be tested independently."
                ),
                BlueprintQuestion(
                    id="q_04",
                    text="Walk me through a prominent project or capstone you built. What major design choice did you make, and why did you choose that approach over simpler alternatives?",
                    competency="Capstone Project Architecture & Ownership",
                    category=QuestionCategory.SYSTEM_DESIGN,
                    assertions=[
                        BinaryAssertion(name="project_architecture", weight=0.3, description="Clearly describes the project components, data flow, and tech stack"),
                        BinaryAssertion(name="design_justification", weight=0.3, description="Explains why specific libraries or database models were chosen"),
                        BinaryAssertion(name="tradeoff_evaluation", weight=0.4, description="Articulates the pros and cons considered during implementation")
                    ],
                    model_answer="Candidates demonstrate genuine ownership by explaining the project architecture, why they selected their stack, and what trade-offs they balanced."
                ),
                BlueprintQuestion(
                    id="q_05",
                    text="Describe how you investigate and debug an unexpected runtime exception or infinite loop in your code. What systematic steps do you take?",
                    competency="Structured Debugging & Problem Isolation",
                    category=QuestionCategory.TECHNICAL_DSA,
                    assertions=[
                        BinaryAssertion(name="stack_trace_analysis", weight=0.3, description="Reads stack trace and error logs to identify the exact failing line"),
                        BinaryAssertion(name="hypothesis_isolation", weight=0.3, description="Forms a specific hypothesis and reproduces the issue with minimal test inputs"),
                        BinaryAssertion(name="permanent_fix", weight=0.4, description="Applies a verified fix and adds a regression test to prevent recurrence")
                    ],
                    model_answer="Effective candidates avoid random guessing; they inspect the stack trace, reproduce the bug in isolation, verify the root cause, and write a test case."
                ),
                BlueprintQuestion(
                    id="q_06",
                    text="Looking back at your coding projects, describe a mistake or technical challenge you encountered. What did you learn from it, and what would you do differently today?",
                    competency="Technical Retrospective & Growth Mindset",
                    category=QuestionCategory.BEHAVIORAL,
                    assertions=[
                        BinaryAssertion(name="self_awareness", weight=0.3, description="Honestly discusses a real coding error, poor design choice, or unexpected bug"),
                        BinaryAssertion(name="root_cause_grasp", weight=0.3, description="Understands the underlying cause of the failure"),
                        BinaryAssertion(name="growth_takeaway", weight=0.4, description="Highlights concrete lessons learned and improved engineering habits adopted")
                    ],
                    model_answer="Candidates show maturity and growth by candidly explaining a past hurdle, what it taught them about software quality, and how they apply that lesson now."
                )
            ]
        )

    return InterviewBlueprint(
        blueprint_id=f"bp_canonical_{re.sub(r'[^a-zA-Z0-9]', '_', clean_company.lower())}_{re.sub(r'[^a-zA-Z0-9]', '_', clean_role.lower())}",
        company=clean_company,
        role=clean_role,
        seniority=seniority_enum,
        domain="Distributed Systems & Infrastructure",
        primary_language=clean_language,
        interview_focus=interview_focus,
        spotlight_topic=spotlight_topic,
        strategy_summary=f"Calibrated {seniority_enum.value} interview for {clean_role} at {clean_company}. Focus on practical distributed architecture, scale, and operational reliability.",
        preparation_tips=[
            "Structure your answers with clear architectural trade-offs (e.g. latency vs consistency).",
            f"Ground your code references in {clean_language} best practices.",
            "State your assumptions and failure handling strategies explicitly."
        ],
        keywords=["Data Structures", clean_language, "Distributed Systems", "Idempotency", "Concurrency", "Kafka", "Redis", "PostgreSQL", "Observability", "Trade-Offs"],
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
