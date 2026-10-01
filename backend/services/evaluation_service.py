"""
services/evaluation_service.py

Anti-Phantom Evidence Dossier Evaluation Service:
Evaluates interview sessions strictly from the Append-Only SQLite Turn Ledger.
Scores are mathematically calculated in Python based on verifiable Binary Assertion passes.
Unreached blueprint questions are mathematically excluded from penalizing candidate score.
Generates formal Staff Hiring Committee Executive Dossier with verbatim transcript evidence.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional
from groq import AsyncGroq
from dotenv import load_dotenv

from backend.models.schemas import (
    AssertionResult,
    BlueprintQuestion,
    CompetencyScore,
    EvaluationReport,
    HiringRecommendation,
    InterviewBlueprint,
    QuestionEvaluation,
    TurnEvent,
    TurnSpeaker,
)
from backend.services.blueprint_service import get_blueprint, build_fallback_blueprint
from backend.services.ledger_service import ledger_service

load_dotenv()
logger = logging.getLogger(__name__)

_DEFAULT_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
_groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"), max_retries=0)


async def evaluate_question_assertions(
    question: BlueprintQuestion,
    candidate_speech: str,
) -> List[AssertionResult]:
    """
    Evaluates verified candidate speech against the question's Binary Assertions.
    The LLM is utilized strictly as an evidence locator and semantic fact-checker.
    Numeric scores are never computed by the LLM.
    """
    clean_speech = candidate_speech.strip()
    words = clean_speech.split()
    
    # If candidate provided no substantive answer (<5 words), all assertions fail deterministically
    if len(words) < 5:
        return [
            AssertionResult(
                assertion_name=a.name,
                passed=False,
                evidence_quote=None,
                critique=f"Candidate did not articulate a substantive answer for requirement: {a.description}"
            )
            for a in question.assertions
        ]

    assertions_spec = "\n".join([
        f"- Tag: '{a.name}' (Weight: {a.weight}): {a.description}"
        for a in question.assertions
    ])

    prompt = f"""You are a Calibrated Engineering Bar Raiser evaluating a candidate's spoken transcript against strict binary assertions.

QUESTION DELIVERED:
"{question.text}"

REFERENCE MODEL ANSWER:
"{question.model_answer}"

STRICT BINARY REQUIREMENTS TO TEST:
{assertions_spec}

CANDIDATE SPOKEN TRANSCRIPT (VERBATIM):
\"\"\"{clean_speech}\"\"\"

TASK:
For EVERY assertion tag listed above, determine whether the candidate's spoken transcript factual evidence satisfies the requirement.
You must extract an exact, verbatim quotation from the candidate transcript whenever an assertion passes.
If the candidate did not mention or explain the required concept, set "passed" to false and "evidence_quote" to null.

Return ONLY valid JSON matching this schema:
{{
  "results": [
    {{
      "assertion_name": "...",
      "passed": true,
      "evidence_quote": "exact verbatim candidate text here",
      "critique": "brief 1-sentence analysis"
    }}
  ]
}}"""

    try:
        res = await _groq_client.chat.completions.create(
            model=_DEFAULT_MODEL,
            messages=[
                {"role": "system", "content": "You are an objective technical evaluation evidence extractor that outputs strict JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=400,
            response_format={"type": "json_object"}
        )
        raw = res.choices[0].message.content
        parsed = json.loads(raw)
        results_data = parsed.get("results", [])
        
        # Map into validated AssertionResult models
        results_map = {r.get("assertion_name"): r for r in results_data}
        final_results = []
        for a in question.assertions:
            match = results_map.get(a.name)
            if match:
                final_results.append(AssertionResult(
                    assertion_name=a.name,
                    passed=bool(match.get("passed", False)),
                    evidence_quote=match.get("evidence_quote") if match.get("passed") else None,
                    critique=match.get("critique", a.description)
                ))
            else:
                final_results.append(AssertionResult(
                    assertion_name=a.name,
                    passed=False,
                    evidence_quote=None,
                    critique=f"Requirement not satisfied: {a.description}"
                ))
        return final_results
    except Exception as e:
        logger.error("[evaluator] LLM assertion evaluation error: %s", e)
        # Fallback: Keyword-based heuristic matching
        return _fallback_heuristic_assertion_eval(question, clean_speech)


def _fallback_heuristic_assertion_eval(
    question: BlueprintQuestion, candidate_speech: str
) -> List[AssertionResult]:
    """Heuristic fallback assertion evaluator if external AI API is unavailable."""
    speech_lower = candidate_speech.lower()
    results = []
    for a in question.assertions:
        # Check if key words from assertion description appear in speech
        keywords = [w.lower() for w in a.description.split() if len(w) > 4]
        match_count = sum(1 for kw in keywords if kw in speech_lower)
        passed = (match_count >= max(1, len(keywords) // 2))
        results.append(AssertionResult(
            assertion_name=a.name,
            passed=passed,
            evidence_quote=candidate_speech[:120] + "..." if passed else None,
            critique="Evaluated via deterministic heuristic fallback engine."
        ))
    return results


async def evaluate_session(session_id: str) -> EvaluationReport:
    """
    Main evaluation pipeline:
    1. Retrieves chronological turns from SQLite Turn Ledger.
    2. Identifies asked questions vs unreached questions.
    3. Evaluates reached questions against Binary Assertions.
    4. Computes deterministic competency and overall scores.
    5. Formulates Staff Hiring Committee recommendation.
    6. Attaches SHA-256 session integrity digest.
    """
    turns = ledger_service.get_session_turns(session_id)
    blueprint = get_blueprint(session_id) or build_fallback_blueprint("Technology Firm", "Software Engineer")
    
    # ── Pool all candidate speech ────────────────────────────────────────────
    # Since Gemini Live manages the conversation autonomously without per-question
    # index tracking, we evaluate the full candidate speech pool against each
    # blueprint question. This avoids the "all questions UNREACHED" bug.
    all_candidate_turns = [t for t in turns if t.speaker == TurnSpeaker.CANDIDATE]
    all_candidate_text = " ".join(t.text for t in all_candidate_turns)
    
    # If we have per-question index data use it, otherwise treat all as reached
    has_indexed_turns = any(t.question_index > 0 for t in turns)
    asked_indices = ledger_service.get_asked_question_indices(session_id) if has_indexed_turns else None
    
    question_evaluations: List[QuestionEvaluation] = []
    total_weighted_score = 0.0
    total_reached_weight = 0.0
    
    dsa_scores: List[float] = []
    system_design_scores: List[float] = []
    communication_scores: List[float] = []
    tradeoff_scores: List[float] = []
    
    unreached_count = 0
    
    for idx, question in enumerate(blueprint.questions):
        # ANTI-PHANTOM GUARANTEE:
        # If index tracking is active and this question wasn't voiced, mark UNREACHED.
        # If Gemini Live is handling the conversation (no indexing), all questions are REACHED.
        if asked_indices is not None and idx not in asked_indices:
            question_evaluations.append(QuestionEvaluation(
                question_id=question.id,
                question_text=question.text,
                status="UNREACHED",
                score=0.0,
                weight=0.0,
                assertion_results=[],
                verbatim_citations=[]
            ))
            unreached_count += 1
            continue

        # Use per-question turns if indexed, otherwise pool all candidate speech
        if has_indexed_turns:
            candidate_turns = [
                t for t in turns
                if t.speaker == TurnSpeaker.CANDIDATE and t.question_index == idx
            ]
            combined_candidate_text = " ".join(t.text for t in candidate_turns)
        else:
            combined_candidate_text = all_candidate_text

        # Evaluate assertions
        assertion_results = await evaluate_question_assertions(question, combined_candidate_text)
        
        # Deterministic Python score calculation:
        # Score = sum(weight * 100 for passed assertions) / sum(weight for all assertions)
        passed_weight = sum(a.weight for a in question.assertions if any(r.assertion_name == a.name and r.passed for r in assertion_results))
        total_q_weight = sum(a.weight for a in question.assertions) or 1.0
        q_score = round((passed_weight / total_q_weight) * 100.0, 1)
        
        # Verbatim citations from passed assertions
        citations = [r.evidence_quote for r in assertion_results if r.evidence_quote]
        
        question_evaluations.append(QuestionEvaluation(
            question_id=question.id,
            question_text=question.text,
            status="VERIFIED",
            score=q_score,
            weight=1.0,
            assertion_results=assertion_results,
            verbatim_citations=citations
        ))
        
        total_weighted_score += q_score
        total_reached_weight += 1.0
        
        # Categorize into competencies
        cat = str(question.category).lower()
        if "dsa" in cat or "algorithm" in cat:
            dsa_scores.append(q_score)
        elif "system" in cat or "architecture" in cat:
            system_design_scores.append(q_score)
        else:
            tradeoff_scores.append(q_score)
            
        # Communication metric based on clarity and brevity
        word_count = len(combined_candidate_text.split())
        if word_count == 0:
            comm_score = 0.0
        else:
            comm_score = min(100.0, max(20.0, 100.0 - abs(word_count - 100) * 0.3))
        communication_scores.append(comm_score)

    # Compute overall calibrated score
    overall_score = round(total_weighted_score / total_reached_weight, 1) if total_reached_weight > 0 else 0.0

    # Competency breakdown
    avg_dsa = round(sum(dsa_scores) / len(dsa_scores), 1) if dsa_scores else overall_score
    avg_sd = round(sum(system_design_scores) / len(system_design_scores), 1) if system_design_scores else overall_score
    avg_comm = round(sum(communication_scores) / len(communication_scores), 1) if communication_scores else 0.0
    avg_tradeoff = round(sum(tradeoff_scores) / len(tradeoff_scores), 1) if tradeoff_scores else overall_score

    competencies = CompetencyScore(
        dsa_score=avg_dsa,
        system_design_score=avg_sd,
        communication_score=avg_comm,
        tradeoff_intuition_score=avg_tradeoff
    )

    # Formal Hiring Committee recommendation gates
    if overall_score >= 85.0:
        recommendation = HiringRecommendation.STRONG_HIRE
    elif overall_score >= 70.0:
        recommendation = HiringRecommendation.HIRE
    elif overall_score >= 55.0:
        recommendation = HiringRecommendation.BORDERLINE
    else:
        recommendation = HiringRecommendation.NO_HIRE

    session_hash = ledger_service.compute_session_hash(session_id)
    verified_turns = ledger_service.get_verified_candidate_turns(session_id)

    report = EvaluationReport(
        session_id=session_id,
        overall_score=overall_score,
        recommendation=recommendation,
        competencies=competencies,
        question_evaluations=question_evaluations,
        session_hash=session_hash,
        unreached_question_count=unreached_count,
        verified_turn_count=len(verified_turns),
        created_at=datetime.now(timezone.utc).isoformat()
    )
    
    logger.info("[evaluator] Generated Dossier for session %s: Score=%.1f, Rec=%s, Unreached=%d",
                session_id, overall_score, recommendation.value, unreached_count)
    return report


class EvaluationService:
    evaluate_session = staticmethod(evaluate_session)
    evaluate_question_assertions = staticmethod(evaluate_question_assertions)


evaluation_service = EvaluationService()
