"""
services/evaluation_service.py

Anti-Phantom Evidence Dossier Evaluation Service:
- Evaluates interview sessions strictly from the Append-Only SQLite Turn Ledger.
- Scores are mathematically calculated in Python based on verifiable Binary Assertion passes.
- Multimodal evaluation: tests both spoken transcript and written code/architecture scratchpad against assertions.
- Incorporates speech telemetry (average WPM, verbal filler count and density) into communication scoring.
- Synthesizes a 3-sentence spoken executive debrief normalized for Edge Neural TTS playback.
- Guaranteed against phantom questions: unreached questions do not penalize candidate score.
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional
from groq import AsyncGroq
from dotenv import load_dotenv

from backend.models.schemas import (
    AssertionResult,
    BlueprintQuestion,
    CommunicationTelemetry,
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
from backend.services.tts_service import normalize_text_for_voice

load_dotenv()
logger = logging.getLogger(__name__)

_DEFAULT_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
_groq_api_key = os.getenv("GROQ_API_KEY")
_groq_client = AsyncGroq(api_key=_groq_api_key, max_retries=1) if _groq_api_key else None


async def evaluate_question_assertions(
    question: BlueprintQuestion,
    candidate_speech: str,
    candidate_code: Optional[str] = None,
) -> List[AssertionResult]:
    """
    Evaluates verified candidate speech and written code/architecture scratchpad
    against the question's Binary Assertions.
    The LLM is utilized strictly as an evidence locator and semantic fact-checker.
    Numeric scores are never computed by the LLM.
    """
    clean_speech = candidate_speech.strip()
    clean_code = (candidate_code or "").strip()
    words = clean_speech.split()
    
    # If candidate provided no substantive answer (<5 words) and no code, all assertions fail
    if len(words) < 5 and not clean_code:
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

    code_block = f"\nCANDIDATE CODE / ARCHITECTURE SCRATCHPAD:\n```\n{clean_code}\n```\n" if clean_code else ""

    prompt = f"""You are a Calibrated Engineering Bar Raiser evaluating a candidate's spoken transcript and written code scratchpad against strict binary assertions.

QUESTION DELIVERED:
"{question.text}"

REFERENCE MODEL ANSWER:
"{question.model_answer}"

STRICT BINARY REQUIREMENTS TO TEST:
{assertions_spec}

CANDIDATE SPOKEN TRANSCRIPT (VERBATIM):
\"\"\"{clean_speech}\"\"\"{code_block}

TASK:
For EVERY assertion tag listed above, determine whether the candidate's spoken transcript OR written code scratchpad provides factual evidence satisfying the requirement.
You must extract an exact, verbatim quotation from the candidate transcript or code whenever an assertion passes.
If the candidate did not demonstrate or explain the required concept, set "passed" to false and "evidence_quote" to null.

Return ONLY valid JSON matching this schema:
{{
  "results": [
    {{
      "assertion_name": "...",
      "passed": true,
      "evidence_quote": "exact verbatim candidate speech or code here",
      "critique": "brief 1-sentence analysis"
    }}
  ]
}}"""

    if not _groq_client:
        return _fallback_heuristic_assertion_eval(question, clean_speech, clean_code)

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
        return _fallback_heuristic_assertion_eval(question, clean_speech, clean_code)


def _fallback_heuristic_assertion_eval(
    question: BlueprintQuestion,
    candidate_speech: str,
    candidate_code: str = "",
) -> List[AssertionResult]:
    """Heuristic fallback assertion evaluator if external AI API is unavailable."""
    combined_lower = f"{candidate_speech} {candidate_code}".lower()
    results = []
    for a in question.assertions:
        keywords = set(re.findall(r'[a-zA-Z]{3,}', f"{a.name} {a.description}".lower()))
        match_count = sum(1 for kw in keywords if kw in combined_lower)
        threshold = max(1, min(2, len(keywords) // 3))
        passed = (match_count >= threshold)
        results.append(AssertionResult(
            assertion_name=a.name,
            passed=passed,
            evidence_quote=(candidate_speech[:120] + "...") if (passed and candidate_speech) else (candidate_code[:120] if passed else None),
            critique="Evaluated via deterministic heuristic fallback engine."
        ))
    return results


async def synthesize_executive_spoken_debrief(
    blueprint: InterviewBlueprint,
    overall_score: float,
    recommendation: HiringRecommendation,
    competencies: CompetencyScore,
    telemetry: CommunicationTelemetry,
    question_evaluations: List[QuestionEvaluation],
) -> str:
    """
    Synthesizes a 3-sentence spoken executive debrief written for ears:
    Sentence 1: Overall recommendation and primary architectural/algorithmic strength.
    Sentence 2: Primary growth area, edge-case vulnerability, or pacing critique.
    Sentence 3: Next steps guidance for the candidate.
    """
    passed_asserts: List[str] = []
    missed_asserts: List[str] = []
    for qe in question_evaluations:
        for a in qe.assertion_results:
            if a.passed:
                passed_asserts.append(a.assertion_name.replace("_", " "))
            else:
                missed_asserts.append(a.assertion_name.replace("_", " "))

    strengths = ", ".join(passed_asserts[:3]) or "solid core systems intuition"
    growth_areas = ", ".join(missed_asserts[:3]) or "distributed edge-case handling"

    prompt = f"""You are a Senior Engineering Bar Raiser giving a brief spoken executive debrief to the candidate.
Generate a concise, exactly 3-sentence verbal summary to be read aloud via neural text-to-speech.

CONTEXT:
Role: {blueprint.role} ({blueprint.seniority})
Overall Score: {overall_score}/100 ({recommendation.value})
Key Strengths: {strengths}
Areas for Growth: {growth_areas}
Speech Cadence: {telemetry.average_wpm:.1f} WPM, {telemetry.total_fillers} filler words

REQUIREMENTS:
1. Sentence 1: State the overall result and acknowledge their primary technical strength.
2. Sentence 2: Detail the single most impactful architectural or algorithmic area for improvement.
3. Sentence 3: Conclude with encouraging next-step career guidance.
4. Total length strictly between 45 and 65 words. No markdown, no asterisks, no numbers like '1.', no bullet points.

Return ONLY the plain text 3 sentences."""

    if _groq_client:
        try:
            res = await _groq_client.chat.completions.create(
                model=_DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": "You are an executive engineering interviewer giving a 3-sentence verbal debrief."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                max_tokens=110,
            )
            raw_debrief = res.choices[0].message.content.strip()
            return normalize_text_for_voice(raw_debrief)
        except Exception as e:
            logger.warning("[evaluator] LLM debrief generation error: %s", e)

    rec_val = recommendation.value if hasattr(recommendation, "value") else str(recommendation)
    fallback_debrief = (
        f"Overall, your performance was rated as {rec_val} with an overall score of {overall_score} out of 100. "
        f"You demonstrated strong intuition in your core approaches, though you should focus on probing scaling constraints and concurrent failure modes earlier. "
        f"Review the detailed assertions in your committee dossier to continue refining your engineering interview skills."
    )
    return normalize_text_for_voice(fallback_debrief)


async def evaluate_session(session_id: str, force_reevaluate: bool = False) -> EvaluationReport:
    """
    Main evaluation pipeline:
    1. Retrieves chronological turns from SQLite Turn Ledger.
    2. Checks if previously evaluated report is cached in SQLite session ledger.
    3. Evaluates reached questions against Binary Assertions (speech + code).
    4. Computes speech telemetry (WPM, filler count, cadence).
    5. Computes deterministic competency and overall scores.
    6. Formulates Staff Hiring Committee recommendation.
    7. Synthesizes spoken executive debrief for audio playback.
    8. Attaches SHA-256 session integrity digest.
    9. Persists report into SQLite session ledger for instant retrieval in History.
    """
    # 0. Check cache first for instant retrieval
    if not force_reevaluate:
        meta = ledger_service.get_session(session_id)
        if meta and meta.get("report_json"):
            try:
                cached_data = json.loads(meta["report_json"])
                logger.info("[evaluator] Returning cached EvaluationReport for session %s", session_id)
                return EvaluationReport(**cached_data)
            except Exception as e:
                logger.warning("[evaluator] Failed to parse cached report for %s: %s", session_id, e)

    turns = ledger_service.get_session_turns(session_id)
    blueprint = get_blueprint(session_id) or build_fallback_blueprint("Technology Firm", "Software Engineer")
    
    all_candidate_turns = [t for t in turns if t.speaker == TurnSpeaker.CANDIDATE]
    all_candidate_text = " ".join(t.text for t in all_candidate_turns)
    all_candidate_code = "\n".join(t.code_snippet for t in all_candidate_turns if t.code_snippet)
    
    # Check asked questions
    interviewer_indices = ledger_service.get_asked_question_indices(session_id)
    has_indexed_turns = len(interviewer_indices) > 0
    asked_indices = interviewer_indices if has_indexed_turns else None
    
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
        # Questions in chat_service are 1-indexed (Q1 has question_index 1).
        q_num = idx + 1
        if asked_indices is not None and (idx not in asked_indices and q_num not in asked_indices):
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

        # Per-question candidate speech + code
        if has_indexed_turns:
            candidate_turns = [
                t for t in turns
                if t.speaker == TurnSpeaker.CANDIDATE and (t.question_index == idx or t.question_index == q_num)
            ]
            combined_candidate_text = " ".join(t.text for t in candidate_turns)
            combined_candidate_code = "\n".join(t.code_snippet for t in candidate_turns if t.code_snippet)
        else:
            combined_candidate_text = all_candidate_text
            combined_candidate_code = all_candidate_code

        # Evaluate assertions with multimodal code + speech
        assertion_results = await evaluate_question_assertions(
            question=question,
            candidate_speech=combined_candidate_text,
            candidate_code=combined_candidate_code,
        )
        
        # Deterministic Python score calculation:
        passed_weight = sum(a.weight for a in question.assertions if any(r.assertion_name == a.name and r.passed for r in assertion_results))
        total_q_weight = sum(a.weight for a in question.assertions) or 1.0
        q_score = round((passed_weight / total_q_weight) * 100.0, 1)
        
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
            
        word_count = len(combined_candidate_text.split())
        if word_count == 0 and not combined_candidate_code:
            comm_score = 0.0
        else:
            comm_score = min(100.0, max(20.0, 100.0 - abs(word_count - 100) * 0.3))
        communication_scores.append(comm_score)

    # Compute overall calibrated score
    overall_score = round(total_weighted_score / total_reached_weight, 1) if total_reached_weight > 0 else 0.0

    # ── Speech Telemetry Computation ─────────────────────────────────────────────
    wpm_values = [t.wpm for t in all_candidate_turns if t.wpm is not None and t.wpm > 0]
    filler_counts = [t.filler_count for t in all_candidate_turns if t.filler_count is not None]
    total_words = sum(t.word_count for t in all_candidate_turns)
    avg_wpm = round(sum(wpm_values) / len(wpm_values), 1) if wpm_values else 140.0
    total_fillers = sum(filler_counts) if filler_counts else 0
    filler_density = round((total_fillers / max(1, total_words)) * 100, 2) if total_words > 0 else 0.0

    if avg_wpm < 115.0:
        wpm_rating = "Pacing: Measured / Deliberate (<115 WPM)"
    elif avg_wpm > 170.0:
        wpm_rating = "Pacing: High Velocity (>170 WPM)"
    else:
        wpm_rating = "Optimal Executive Cadence (120-160 WPM)"

    telemetry = CommunicationTelemetry(
        average_wpm=avg_wpm,
        total_fillers=total_fillers,
        wpm_rating=wpm_rating,
        filler_density=filler_density,
    )

    # Calibrate communication score with speech telemetry
    base_comm = round(sum(communication_scores) / len(communication_scores), 1) if communication_scores else 70.0
    filler_penalty = min(15.0, filler_density * 2.5)
    pacing_mod = 5.0 if (120.0 <= avg_wpm <= 165.0) else (-5.0 if (avg_wpm < 100.0 or avg_wpm > 180.0) else 0.0)
    final_comm_score = max(20.0, min(100.0, round(base_comm - filler_penalty + pacing_mod, 1)))

    avg_dsa = round(sum(dsa_scores) / len(dsa_scores), 1) if dsa_scores else overall_score
    avg_sd = round(sum(system_design_scores) / len(system_design_scores), 1) if system_design_scores else overall_score
    avg_tradeoff = round(sum(tradeoff_scores) / len(tradeoff_scores), 1) if tradeoff_scores else overall_score

    competencies = CompetencyScore(
        dsa_score=avg_dsa,
        system_design_score=avg_sd,
        communication_score=final_comm_score,
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

    # Synthesize Spoken Executive Debrief
    debrief = await synthesize_executive_spoken_debrief(
        blueprint=blueprint,
        overall_score=overall_score,
        recommendation=recommendation,
        competencies=competencies,
        telemetry=telemetry,
        question_evaluations=question_evaluations,
    )

    report = EvaluationReport(
        session_id=session_id,
        overall_score=overall_score,
        recommendation=recommendation,
        competencies=competencies,
        question_evaluations=question_evaluations,
        session_hash=session_hash,
        unreached_question_count=unreached_count,
        verified_turn_count=len(verified_turns),
        created_at=datetime.now(timezone.utc).isoformat(),
        executive_spoken_debrief=debrief,
        communication_telemetry=telemetry,
    )

    # Persist evaluation into SQLite session ledger
    try:
        report_json = report.model_dump_json()
        rec_str = recommendation.value if hasattr(recommendation, "value") else str(recommendation)
        ledger_service.upsert_session(
            session_id=session_id,
            overall_score=overall_score,
            recommendation=rec_str,
            report_json=report_json,
        )
    except Exception as e:
        logger.warning("[evaluator] Failed to cache report in sessions index for %s: %s", session_id, e)

    logger.info("[evaluator] Generated Dossier for session %s: Score=%.1f, Rec=%s, Unreached=%d, WPM=%.1f",
                session_id, overall_score, recommendation.value, unreached_count, avg_wpm)
    return report


class EvaluationService:
    evaluate_session = staticmethod(evaluate_session)
    evaluate_question_assertions = staticmethod(evaluate_question_assertions)
    synthesize_executive_spoken_debrief = staticmethod(synthesize_executive_spoken_debrief)


evaluation_service = EvaluationService()
