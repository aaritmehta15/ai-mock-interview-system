"""
services/evaluation_service.py

Offline Grounded Dossier Evaluator:
Evaluates interview performance strictly using verifiable evidence from the Turn Ledger.
Mathematical scoring is computed deterministically in Python based on binary assertion passes.
Zero hallucinated scores. Zero phantom questions.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Dict, List, Optional
from pydantic import BaseModel, Field
from groq import AsyncGroq
from dotenv import load_dotenv

from services.blueprint_service import InterviewBlueprint, BlueprintQuestion, BinaryAssertion, get_blueprint
from services.ledger_service import ledger_service, TurnEvent

load_dotenv()
logger = logging.getLogger(__name__)

_groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"), max_retries=1)

# ─────────────────────────────────────────────────────────────────────────────
# Dossier Data Models
# ─────────────────────────────────────────────────────────────────────────────

class AssertionResult(BaseModel):
    name: str
    weight: float
    passed: bool
    evidence_quote: str = Field(..., description="Verbatim quote from candidate transcript supporting the decision")
    reasoning: str = Field(..., description="Concise rationale for why the assertion passed or failed")

class QuestionEvaluation(BaseModel):
    question_id: str
    question_text: str
    competency: str
    category: str
    score: float = Field(..., description="0 to 100 score computed mathematically in Python")
    assertion_results: List[AssertionResult]
    candidate_transcript: str
    interviewer_reply: str = ""

class UnreachedQuestion(BaseModel):
    question_id: str
    question_text: str
    competency: str
    reason: str = "Session concluded before question was audibly reached"

class InterviewDossier(BaseModel):
    session_id: str
    company: str
    role: str
    seniority: str
    overall_score: float = Field(..., description="Calibrated 0-100 overall score")
    recommendation: str = Field(..., description="Strong Hire | Hire | Borderline | No Hire")
    executive_summary: str
    evaluated_questions: List[QuestionEvaluation]
    unreached_questions: List[UnreachedQuestion] = Field(default_factory=list)
    total_turns_analyzed: int
    strengths: List[str]
    growth_areas: List[str]

# ─────────────────────────────────────────────────────────────────────────────
# Evidence Extraction Engine (Structured LLM Probe)
# ─────────────────────────────────────────────────────────────────────────────

async def evaluate_question_evidence(
    question: BlueprintQuestion,
    transcript: str,
) -> List[AssertionResult]:
    """
    Extracts evidence quotes and assesses pass/fail for each binary assertion in the question.
    LLM is used solely as an evidence finder; scores are never assigned by the LLM.
    """
    if not transcript or len(transcript.split()) < 3:
        return [
            AssertionResult(
                name=a.name,
                weight=a.weight,
                passed=False,
                evidence_quote="No verbal response provided.",
                reasoning="Candidate did not provide a substantive answer to evaluate.",
            )
            for a in question.assertions
        ]

    assertions_spec = "\n".join([
        f"- Tag: '{a.name}' (Weight: {a.weight}): {a.description}"
        for a in question.assertions
    ])

    prompt = f"""You are a Calibrated Engineering Bar Raiser evaluating a candidate's answer against strict binary requirements.

QUESTION ASKED:
"{question.text}"

BENCHMARK MODEL ANSWER:
"{question.model_answer}"

CANDIDATE'S VERBATIM SPOKEN TRANSCRIPT:
"{transcript}"

BINARY ASSERTIONS TO VERIFY:
{assertions_spec}

EVALUATION INSTRUCTIONS:
1. For EACH assertion listed above, inspect the candidate transcript for direct factual evidence.
2. If the candidate explicitly addresses the requirement with accurate engineering reasoning, mark passed: true.
3. If they omit it, give incorrect information, or speak only in vague hand-waving generalities, mark passed: false.
4. Extract the EXACT VERBATIM SUBSTRING QUOTE from the candidate transcript demonstrating their claim. If failed, quote the closest sentence or write 'Omitted from response'.
5. Return ONLY a valid JSON array of objects with the exact schema:
[
  {{
    "name": "<assertion tag>",
    "passed": true/false,
    "evidence_quote": "<verbatim excerpt from candidate>",
    "reasoning": "<1-2 sentence engineering justification>"
  }}
]
Do not wrap with backticks or Markdown. Output raw JSON array only.
"""

    models_to_try = [
        os.getenv("GROQ_CLASSIFY_MODEL", "groq/compound-mini"),
        "groq/compound-mini",
        "qwen/qwen3.8-27b",
        "groq/compound",
    ]

    for model in models_to_try:
        try:
            response = await _groq_client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=512,
            )
            raw = response.choices[0].message.content.strip()
            # Strip potential code fence
            raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
            raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE).strip()

            parsed = json.loads(raw)
            if isinstance(parsed, list):
                assertion_map = {item.get("name"): item for item in parsed if isinstance(item, dict)}
                results = []
                for a in question.assertions:
                    match = assertion_map.get(a.name, {})
                    results.append(
                        AssertionResult(
                            name=a.name,
                            weight=a.weight,
                            passed=bool(match.get("passed", False)),
                            evidence_quote=str(match.get("evidence_quote", "Omitted from response")),
                            reasoning=str(match.get("reasoning", "Requirement not demonstrated in answer.")),
                        )
                    )
                return results
        except Exception as e:
            logger.warning("[evaluation] Assertion extraction failed on %s: %s", model, e)
            continue

    # Fallback if API unavailable: keyword substring scan
    logger.warning("[evaluation] Using heuristic keyword matching fallback for assertions")
    results = []
    lower_t = transcript.lower()
    for a in question.assertions:
        kw = a.name.lower().replace("_", " ")
        passed = kw in lower_t or any(word in lower_t for word in a.description.lower().split() if len(word) > 5)
        results.append(
            AssertionResult(
                name=a.name,
                weight=a.weight,
                passed=passed,
                evidence_quote=transcript[:100] + "..." if len(transcript) > 100 else transcript,
                reasoning=f"Evaluated via heuristic criteria for {a.name}.",
            )
        )
    return results

# ─────────────────────────────────────────────────────────────────────────────
# Python Deterministic Scoring & Dossier Synthesis
# ─────────────────────────────────────────────────────────────────────────────

def calculate_question_score(assertion_results: List[AssertionResult]) -> float:
    """
    Computes deterministic score for a question:
    Score = sum(weight * passed) / sum(weight) * 100
    """
    if not assertion_results:
        return 0.0
    total_weight = sum(a.weight for a in assertion_results)
    if total_weight <= 0:
        return 0.0
    earned = sum(a.weight for a in assertion_results if a.passed)
    return round((earned / total_weight) * 100.0, 1)

def determine_recommendation(overall_score: float) -> str:
    """Standardized bar raiser thresholds."""
    if overall_score >= 85.0:
        return "Strong Hire"
    elif overall_score >= 70.0:
        return "Hire"
    elif overall_score >= 55.0:
        return "Borderline"
    else:
        return "No Hire"

async def generate_interview_dossier(session_id: str) -> InterviewDossier:
    """
    Main evaluation pipeline:
    1. Fetches verified turns from append-only Turn Ledger.
    2. Fetches immutable InterviewBlueprint.
    3. Evaluates ONLY questions with verified candidate answers.
    4. Computes deterministic mathematical scores in Python.
    5. Categorizes unasked questions as 'Not Attempted' (never penalized with 0/5).
    """
    session = ledger_service.get_session(session_id)
    verified_turns = ledger_service.get_verified_turns(session_id)
    
    bp = session.blueprint if session else get_blueprint(session_id)
    if not bp:
        from services.blueprint_service import _build_fallback_blueprint
        bp = _build_fallback_blueprint("Tech Company", "Software Engineer", "Mid-Level")

    # Map verified turns by question_id (consolidating multi-turn probe dialogues if any)
    turns_by_qid: Dict[str, List[TurnEvent]] = {}
    for turn in verified_turns:
        turns_by_qid.setdefault(turn.question_id, []).append(turn)

    evaluated_questions: List[QuestionEvaluation] = []
    question_scores: List[float] = []
    strengths: List[str] = []
    growth_areas: List[str] = []

    for q in bp.questions:
        if q.id in turns_by_qid:
            turns = turns_by_qid[q.id]
            # Combine candidate speech across this question's turns
            combined_transcript = " ".join([t.candidate_transcript for t in turns if t.candidate_transcript])
            interviewer_reply = " ".join([t.interviewer_reply for t in turns if t.interviewer_reply])
            
            # Extract evidence and verify assertions
            assertion_results = await evaluate_question_evidence(q, combined_transcript)
            q_score = calculate_question_score(assertion_results)
            question_scores.append(q_score)

            # Extract highlights for feedback
            for a in assertion_results:
                if a.passed:
                    strengths.append(f"[{q.competency}] {a.name.replace('_', ' ').title()}: '{a.evidence_quote[:80]}'")
                else:
                    growth_areas.append(f"[{q.competency}] {a.name.replace('_', ' ').title()} missed: {a.reasoning}")

            evaluated_questions.append(
                QuestionEvaluation(
                    question_id=q.id,
                    question_text=q.text,
                    competency=q.competency,
                    category=q.category,
                    score=q_score,
                    assertion_results=assertion_results,
                    candidate_transcript=combined_transcript,
                    interviewer_reply=interviewer_reply,
                )
            )

    # Compute overall calibrated score
    if question_scores:
        overall_score = round(sum(question_scores) / len(question_scores), 1)
    else:
        overall_score = 0.0

    recommendation = determine_recommendation(overall_score)

    # Compute unreached questions (Zero Phantom Question Guarantee)
    evaluated_qids = {eq.question_id for eq in evaluated_questions}
    unreached_questions = [
        UnreachedQuestion(
            question_id=q.id,
            question_text=q.text,
            competency=q.competency,
        )
        for q in bp.questions
        if q.id not in evaluated_qids
    ]

    # Executive Summary Synthesis
    summary_text = (
        f"Candidate completed {len(evaluated_questions)} out of {len(bp.questions)} planned technical rounds for the "
        f"{bp.seniority} {bp.role} position at {bp.company}. "
        f"Calculated overall performance is {overall_score}/100 resulting in a recommendation of '{recommendation}'. "
    )
    if unreached_questions:
        summary_text += f"{len(unreached_questions)} planned questions were not reached during the live dialogue and were excluded from scoring to ensure mathematical fairness."

    dossier = InterviewDossier(
        session_id=session_id,
        company=bp.company,
        role=bp.role,
        seniority=bp.seniority,
        overall_score=overall_score,
        recommendation=recommendation,
        executive_summary=summary_text,
        evaluated_questions=evaluated_questions,
        unreached_questions=unreached_questions,
        total_turns_analyzed=len(verified_turns),
        strengths=strengths[:5],
        growth_areas=growth_areas[:5],
    )

    logger.info("[evaluation] Completed dossier for session %s: Score %.1f/100, Recommendation: %s (%d evaluated, %d unreached)",
                session_id, overall_score, recommendation, len(evaluated_questions), len(unreached_questions))
    return dossier
