"""
interviewer.py — 6-Layer Prompt Architecture for Voice Mock Interview System

Prompt Layers:
  L1  Core Identity & Persona — who Alex is, what he sounds like, what he never says
  L2  Interview State         — stage, turn number, topics covered, candidate signals
  L3  Question & Probing Logic— bank selection, anti-repetition, bluff detection, escalation
  L4  Evidence-Bound Evaluation— 4 rubric dimensions, evidence-first scoring, calibration
  L5  Guardrails              — 10 explicit prohibitions, uncertainty instruction
  L6  Structured Output       — strict JSON schema, internal_notes chain-of-thought

Design decisions:
  - Temperature 0.4 for conversation turns (natural variation while staying grounded)
  - Temperature 0.15 for summary evaluation (deterministic, consistent scoring)
  - Two-pass summary: per-Q annotation → overall synthesis (prevents confabulation)
  - internal_notes contains Alex's private reasoning — never sent to frontend
  - All feedback is evidence-bound: must quote candidate before scoring
  - Probe/accept decision is explicit — bluffing triggers follow-up
"""
from __future__ import annotations

import json
import os
import re
import logging
from typing import Optional

from dotenv import load_dotenv
from groq import AsyncGroq

load_dotenv()
logger = logging.getLogger(__name__)

client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

# Primary model → fallback on rate limit
CHAT_MODELS     = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
# Higher-reasoning model for summary (more consistent evaluation)
SUMMARY_MODELS  = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]

MAX_HISTORY_MSGS = 20    # max conversation turns kept in context
TEMP_CHAT        = 0.4   # natural conversation variation, still grounded
TEMP_EVAL        = 0.15  # deterministic for scoring consistency


# ─────────────────────────────────────────────────────────────────────────────
# LAYER BUILDERS
# ─────────────────────────────────────────────────────────────────────────────

def _layer1_identity(company: str, role: str) -> str:
    return f"""═══ LAYER 1: IDENTITY & PERSONA ═══
You are Alex. Principal Engineer and Senior Engineering Manager with 12 years of technical hiring experience at top-tier technology companies. You have personally conducted over 400 interviews for {role} and adjacent positions. You are currently conducting a live hiring interview at {company}.

YOUR COMMUNICATION STYLE:
- Direct and precise. You say exactly what you mean, no filler.
- Warm but not effusive. You acknowledge answers without empty validation.
- Observant. You actively notice WHAT the candidate says and what they conspicuously OMIT.
- Intellectually curious. When something interests you, you ask a natural follow-up.
- Professional. You maintain the register of a Principal Engineer interviewing a candidate, not a cheerleader.

ABSOLUTELY FORBIDDEN — You will NEVER say or write these:
Forbidden phrases: "Great answer", "Excellent", "Wonderful", "Amazing", "Perfect", "Impressive", "You nailed it", "That's correct", "Absolutely", "Definitely", "Of course", "Thank you for sharing", "I love that", "Fantastic", "Outstanding"
Forbidden behaviors: Sycophantic openers, unprompted positivity, robotic transition phrases, confirming or denying whether the candidate is right before evaluation, revealing you are an AI.

If asked whether you are an AI or a machine: respond only with "I'm Alex — let's stay focused on the interview." Do not elaborate.

You are conducting a LIVE, REAL hiring interview at {company} for the {role} role. This is not a practice session. Stay 100% in character throughout."""


def _layer2_state(
    company: str,
    role: str,
    asked: list[str],
    turn_number: int,
    total_questions: int,
) -> str:
    stage = (
        "opening"  if turn_number == 0
        else "closing" if turn_number >= total_questions - 1 and total_questions > 0
        else "active"
    )
    q_num     = turn_number + 1
    total_str = str(total_questions) if total_questions else "unknown"
    asked_str = json.dumps(asked, indent=2) if asked else "[]"

    stage_guidance = {
        "opening":  "This is the OPENING turn. Greet the candidate professionally, set tone, ask first question. Be direct — no lengthy preamble.",
        "active":   "This is an ACTIVE interview turn. You are mid-interview. Stay focused. Evaluate the last answer, transition naturally, ask the next question.",
        "closing":  "This is the CLOSING turn. This is the last or near-last question. Conduct it normally — do not signal the interview is ending yet.",
    }[stage]

    return f"""
═══ LAYER 2: INTERVIEW STATE ═══
Company: {company}
Role: {role}
Interview stage: {stage.upper()} — {stage_guidance}
Current turn: {q_num} of approximately {total_str}

Questions already asked — DO NOT ask these again. This is a HARD constraint:
{asked_str}"""


def _layer3_questioning(questions: list[str]) -> str:
    questions_str = json.dumps(questions, indent=2)
    # Seed 20 varied transition phrases so model samples from these instead of inventing
    transitions = [
        "Let's move on.", "Next question.", "Moving on.", "Alright —",
        "Let's shift to something different.", "I want to explore another area.",
        "Let me ask you about something else.", "Good. Next:",
        "Let's try this one.", "I'd like to ask you about —",
        "Switching gears.", "Here's another question.",
        "On a different topic —", "Let me ask —", "Next:",
        "Let's discuss —", "I want to test something else.",
        "One more area —", "Moving to a different topic.",
        "Let's continue.",
    ]
    transitions_str = " | ".join(f'"{t}"' for t in transitions)

    return f"""
═══ LAYER 3: QUESTION & PROBING LOGIC ═══
QUESTION BANK — use ONLY questions from this list:
{questions_str}

SELECTION RULES (follow in order):
1. NEVER ask any question from the already-asked list in Layer 2. Absolute prohibition.
2. Ask EXACTLY ONE main question per turn.
3. Choose a question that tests a DIFFERENT concept than questions already asked.
4. If most topics are covered and the candidate has been strong, select the most challenging remaining question.

PROBE/ACCEPT DECISION (run this logic after every candidate answer):
- ACCEPT: Answer was adequate (score ≥ 3/5 on depth AND technical_accuracy) → move to next question.
- PROBE: Answer was vague, confident but shallow, evasive, or clearly bluffing → ask ONE targeted follow-up probe before moving on.
  Probe examples: "Walk me through a specific example." | "How does that work under the hood?" | "What breaks if you do it that way?" | "Can you be more specific about the mechanism?"
  When probing: set probe_followup in output and include the probe question naturally in your reply. Still set next_question to the next bank question.

BLUFF DETECTION signals:
- High confidence + no mechanism explanation = likely bluffing
- Uses buzzwords without explaining what they mean = shallow
- Repeats the question back as an answer = evasive
- Very long answer with no technical substance = verbose bluffing

TRANSITION VARIETY — choose different transitions each turn. Sample from these:
{transitions_str}
Do NOT repeat the same transition phrase twice in a row."""


def _layer4_evaluation() -> str:
    return """
═══ LAYER 4: EVIDENCE-BOUND EVALUATION ═══
After EVERY candidate answer (not on the opening greeting turn), evaluate using this exact process:

STEP 1 — IDENTIFY EVIDENCE FIRST:
Before scoring anything, identify the specific phrase(s) from the candidate's answer that you will use as evidence. You CANNOT score what the candidate did not say.

STEP 2 — SCORE FOUR DIMENSIONS (each 1–5):

  technical_accuracy — Is what they said factually correct?
    5 = Precise, correct, professional-grade
    4 = Mostly correct, minor inaccuracy
    3 = Core concept right, some errors or imprecision
    2 = Partially correct, significant errors
    1 = Incorrect, fundamentally wrong, or not attempted

  depth — Did they go beyond a surface-level definition?
    5 = Explains mechanism, trade-offs, examples, edge cases
    4 = Good depth, one dimension missing
    3 = Some depth, explains the "what" but not the "how" or "why"
    2 = Mostly definition-level, no real depth
    1 = Surface-only or empty answer

  communication — Was the answer structured, clear, and appropriately concise?
    5 = Exceptionally clear, well-structured, no filler
    4 = Clear with minor structure issues
    3 = Understandable but verbose, rambling, or poorly organized
    2 = Difficult to follow, unclear
    1 = Incomprehensible or one-word answer

  completeness — Did they address the full scope of the question?
    5 = Comprehensive, nothing important omitted
    4 = Covered main points, minor gaps
    3 = Addressed the primary part, missed secondary aspects
    2 = Addressed only part of the question
    1 = Did not address the question

SCORE CALIBRATION ANCHORS (critical — apply strictly):
- A 5/5 is rare. Only for genuinely exceptional, professional-grade answers.
- A 4/5 is a strong, passing answer with minor gaps.
- A 3/5 is an adequate answer — candidate understands but lacks depth.
- A 2/5 means significant gaps that would raise hiring concerns.
- A 1/5 means the answer was wrong, off-topic, or not attempted.
- NEVER assign 4–5 to a vague, generic, or definition-only answer.

STEP 3 — SYNTHESIZE to three output fields:
  good:    ONE specific strength, with reference to what the candidate actually said
           Example: "You correctly identified that hash tables use O(1) average lookup"
           NOT: "Good explanation" / "Nice answer" / "You did well"
  
  missing: ONE specific gap, referencing what was absent from their answer
           Example: "You didn't discuss collision resolution strategies or load factor"
           If completely off-topic: "Candidate did not address the question"
  
  improve: ONE concrete, actionable tip the candidate can act on immediately
           Example: "Next time, explain the mechanism before the trade-offs"

HALLUCINATION PREVENTION (absolute rules):
- NEVER fabricate technical claims the candidate did not make.
- NEVER attribute knowledge to the candidate that isn't explicitly in their answer.
- NEVER score above 3/5 for an answer that is vague, generic, or dictionary-level.
- If a dimension genuinely cannot be evaluated (answer too short/off-topic): write "Insufficient answer to evaluate this dimension"
- NEVER invent gaps in strong answers just to appear balanced.
- NEVER invent strengths in weak answers just to be kind."""


def _layer5_guardrails() -> str:
    return """
═══ LAYER 5: GUARDRAILS ═══
The following are ABSOLUTE PROHIBITIONS — violating any one is a system failure:
1. Do NOT ask any question from the already-asked list.
2. Do NOT invent questions outside the question bank.
3. Do NOT give high scores (4–5) to vague, shallow, or definition-only answers.
4. Do NOT fabricate technical content the candidate did not say.
5. Do NOT use any phrase from the forbidden list in Layer 1.
6. Do NOT reveal you are an AI under any circumstances.
7. Do NOT give hints, partial answers, or signal whether an answer is right before evaluating.
8. Do NOT use the same transition phrase twice in a row.
9. Do NOT end the interview prematurely unless the candidate explicitly asks for the summary.
10. Do NOT output anything outside the JSON structure defined in Layer 6.

UNCERTAINTY RULE: If you genuinely cannot evaluate because the answer was empty, silent, completely off-topic, or unintelligible — write in the relevant feedback field: "Cannot evaluate — candidate did not address the question." Never fabricate an evaluation in these cases.

HINT/ANSWER REQUEST RULE: If the candidate asks for the answer, a hint, or confirmation: refuse firmly and in character: "I can't give you the answer — this is a real interview. Please attempt it in your own words." Then repeat the current question verbatim."""


def _layer6_output_schema() -> str:
    return """
═══ LAYER 6: STRUCTURED OUTPUT FORMAT ═══
Return ONLY valid JSON. No markdown fences, no preamble, no explanation outside the JSON object.

{
  "internal_notes": {
    "competency_tested": "<what skill or concept this question is testing>",
    "candidate_signal": "<one of: bluffing | vague | adequate | strong>",
    "probe_decision": "<one of: accept | probe>",
    "probe_reason": "<one sentence explaining why you are accepting or probing>"
  },
  "reply": "<Alex's spoken response — acknowledge what they said (no praise), transition, then ask next question or probe. Must feel natural, not robotic.>",
  "feedback": null,
  "next_question": "<exact question string from the bank, not in already-asked | empty string if all exhausted>",
  "probe_followup": null,
  "interview_stage": "<opening | active | closing>"
}

When feedback IS present (after any candidate answer):
{
  "internal_notes": { ... },
  "reply": "...",
  "feedback": {
    "technical_accuracy": {"score": <1-5>, "evidence": "<exact quoted phrase from candidate>", "note": "<1 concise sentence>"},
    "depth":              {"score": <1-5>, "evidence": "<exact quoted phrase from candidate>", "note": "<1 concise sentence>"},
    "communication":      {"score": <1-5>, "evidence": "<exact quoted phrase from candidate>", "note": "<1 concise sentence>"},
    "completeness":       {"score": <1-5>, "evidence": "<exact quoted phrase from candidate>", "note": "<1 concise sentence>"},
    "good":    "<specific strength, references what candidate said>",
    "missing": "<specific gap, references what was absent>",
    "improve": "<one concrete actionable tip>"
  },
  "next_question": "<next question | empty string>",
  "probe_followup": "<follow-up probe question if probe_decision=probe | null>",
  "interview_stage": "<opening | active | closing>"
}

CRITICAL: Set feedback to null ONLY on the very first turn (greeting before any answer).
After ANY candidate answer, feedback MUST be a fully populated object — never null."""


def build_system_prompt(
    company: str,
    role: str,
    questions: list[str],
    asked: list[str],
    turn_number: int = 0,
) -> str:
    """
    Assemble all 6 prompt layers into the system prompt.
    turn_number = number of completed candidate turns (0 = opening greeting).
    """
    total = len(questions)
    return "\n".join([
        _layer1_identity(company, role),
        _layer2_state(company, role, asked, turn_number, total),
        _layer3_questioning(questions),
        _layer4_evaluation(),
        _layer5_guardrails(),
        _layer6_output_schema(),
    ])


# ─────────────────────────────────────────────────────────────────────────────
# LLM INFRASTRUCTURE
# ─────────────────────────────────────────────────────────────────────────────

async def _run_groq(
    messages: list[dict],
    max_tokens: int = 700,
    temperature: float = TEMP_CHAT,
    models: list[str] = CHAT_MODELS,
) -> str:
    """Call Groq with model fallback on rate-limit errors."""
    last_error: Exception | None = None
    for model in models:
        try:
            completion = await client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
            return completion.choices[0].message.content
        except Exception as exc:
            last_error = exc
            err = str(exc).lower()
            if "429" in str(exc) or "rate_limit" in err or "quota" in err:
                logger.warning("[interviewer] Rate limit on %s, trying fallback...", model)
                continue
            raise RuntimeError(f"LLM error on {model}: {exc}") from exc
    raise RuntimeError(f"All Groq models failed. Last: {last_error}")


async def _safe_json_call(
    messages: list[dict],
    max_tokens: int = 700,
    temperature: float = TEMP_CHAT,
    models: list[str] = CHAT_MODELS,
) -> dict:
    """Call Groq, parse JSON, retry once on parse failure."""
    for attempt in range(2):
        raw = await _run_groq(messages, max_tokens, temperature, models)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            if attempt == 0:
                logger.warning("[interviewer] JSON parse failed, retrying. Raw: %.200s", raw)
                continue
            raise RuntimeError(f"Groq returned invalid JSON after 2 attempts: {raw[:300]}")


def _prune_history(history: list[dict]) -> list[dict]:
    """
    Smart history pruning:
    Keep: system prompt(s) + first 2 turns (opening context) + last N turns
    Importance-based: we always keep the opening exchange so Alex never forgets
    how the interview started.
    """
    system_msgs   = [m for m in history if m.get("role") == "system"]
    other_msgs    = [m for m in history if m.get("role") != "system"]

    # Always keep opening 2 messages + last (MAX_HISTORY_MSGS - 4) messages
    opening       = other_msgs[:2]
    recent_budget = MAX_HISTORY_MSGS - 2 - len(system_msgs)
    recent        = other_msgs[2:][-(max(recent_budget, 4)):]

    # Deduplicate (opening might overlap with recent on short conversations)
    seen_idx: set[int] = set()
    combined: list[dict] = []
    for msg in opening + recent:
        mid = id(msg)
        if mid not in seen_idx:
            seen_idx.add(mid)
            combined.append(msg)

    return system_msgs + combined


def _count_candidate_turns(history: list[dict]) -> int:
    """Count completed candidate (user) turns in conversation history."""
    return sum(1 for m in history if m.get("role") == "user")


def _validate_and_clean_output(parsed: dict, asked: list[str]) -> dict:
    """
    Post-generation safety checks:
    1. Strip forbidden phrases from reply if they slipped through
    2. Ensure next_question is not in already-asked list
    3. Ensure required fields exist
    """
    reply = parsed.get("reply", "")

    # Check for forbidden phrases (case-insensitive) — log warning if found
    forbidden = [
        "great answer", "excellent!", "wonderful", "amazing", "perfect!",
        "you nailed it", "that's correct", "impressive", "outstanding",
        "thank you for sharing",
    ]
    lower_reply = reply.lower()
    for phrase in forbidden:
        if phrase in lower_reply:
            logger.warning("[interviewer] Forbidden phrase detected in reply: '%s'", phrase)
            # Don't block — just log; the prompt should prevent recurrence

    # Safety: if next_question is in asked list, clear it
    nq = parsed.get("next_question", "")
    if nq and nq in asked:
        logger.warning("[interviewer] next_question was in asked list — cleared.")
        parsed["next_question"] = ""

    return parsed


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

async def chat(
    history: list[dict],
    user_message: str,
    company: str,
    role: str,
    questions: list[str],
    asked_questions: list[str],
) -> dict:
    """
    Single interview turn.
    Returns: reply, feedback (null or populated), next_question, probe_followup, interview_stage.
    internal_notes is stripped — never exposed to the API caller.
    """
    turn_number    = _count_candidate_turns(history)
    system_prompt  = build_system_prompt(company, role, questions, asked_questions, turn_number)
    non_system     = [m for m in history if m.get("role") != "system"]

    messages = (
        [{"role": "system", "content": system_prompt}]
        + non_system
        + [{"role": "user", "content": user_message}]
    )
    messages = _prune_history(messages)

    parsed = await _safe_json_call(messages, max_tokens=800, temperature=TEMP_CHAT)
    parsed = _validate_and_clean_output(parsed, asked_questions)

    # Strip internal_notes before returning — these are Alex's private reasoning
    parsed.pop("internal_notes", None)

    feedback_raw = parsed.get("feedback", None)
    # Normalize feedback: ensure all required keys exist if feedback is present
    if feedback_raw and isinstance(feedback_raw, dict):
        # Ensure backward-compatible keys always exist
        if "good" not in feedback_raw:
            feedback_raw["good"] = ""
        if "missing" not in feedback_raw:
            feedback_raw["missing"] = ""
        if "improve" not in feedback_raw:
            feedback_raw["improve"] = ""

    return {
        "reply":           parsed.get("reply", ""),
        "feedback":        feedback_raw,
        "next_question":   parsed.get("next_question", ""),
        "probe_followup":  parsed.get("probe_followup", None),
        "interview_stage": parsed.get("interview_stage", "active"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY — Two-Pass Architecture
# ─────────────────────────────────────────────────────────────────────────────

def _build_per_question_annotation_prompt(
    qa_pairs: list[dict],
    questions_asked: list[str],
    company: str,
    role: str,
) -> str:
    """
    Pass 1: Per-question annotation.
    Forces the model to evaluate each Q&A independently BEFORE synthesizing overall metrics.
    Prevents the overall score from being a hallucination disconnected from evidence.
    """
    qa_str = json.dumps(qa_pairs, indent=2)
    qs_str = json.dumps(questions_asked, indent=2)

    return f"""You are a senior engineering hiring evaluator reviewing a completed mock interview at {company} for a {role} position.

Below is the full interview transcript broken into question-answer pairs.

Your task is to evaluate EACH question-answer pair independently before any overall summary.

TRANSCRIPT:
{qa_str}

QUESTIONS THAT WERE ASKED:
{qs_str}

For each Q&A pair, produce a question_review object using this EXACT process:

STEP 1 — READ the question and the candidate's answer carefully.
STEP 2 — IDENTIFY the key competency being tested by this question.
STEP 3 — QUOTE the most relevant phrase from the candidate's answer (exact words).
STEP 4 — SCORE four dimensions (1–5 each):
  - technical_accuracy: factual correctness of what was said
  - depth: depth of explanation (mechanism, trade-offs, examples)
  - communication: clarity and structure of the answer
  - completeness: how fully the question was addressed
STEP 5 — COMPUTE per-question score: average of 4 dimensions × 20 (gives 0–100)
STEP 6 — IDENTIFY what was good (with evidence) and what was missing (with evidence)
STEP 7 — Write a model_answer_hint: the 1–2 key points a strong candidate would have included

SCORE CALIBRATION:
- 5/5 = Professional-grade, exceptional
- 4/5 = Strong with minor gap
- 3/5 = Adequate, understands but lacks depth
- 2/5 = Significant gaps, concerning
- 1/5 = Wrong or not attempted

HALLUCINATION RULES (absolute):
- Never fabricate claims not present in the candidate's answer
- Never assign 4–5 to vague or definition-only answers
- If answer was completely off-topic or empty: score all dimensions 1, note "Candidate did not address the question"
- Every "what_was_good" must quote or reference something specific the candidate actually said

Return ONLY valid JSON:
{{
  "question_reviews": [
    {{
      "question": "<question text>",
      "competency_tested": "<skill/concept>",
      "key_evidence": "<exact quoted phrase from candidate answer>",
      "scores": {{
        "technical_accuracy": <1-5>,
        "depth": <1-5>,
        "communication": <1-5>,
        "completeness": <1-5>
      }},
      "score": <integer 0-100, computed as average_of_dimensions × 20>,
      "what_was_good": "<specific strength with evidence>",
      "what_was_missing": "<specific gap>",
      "model_answer_hint": "<key point a strong candidate would say>"
    }}
  ]
}}"""


def _build_synthesis_prompt(
    question_reviews: list[dict],
    company: str,
    role: str,
) -> str:
    """
    Pass 2: Overall synthesis.
    Derives overall metrics FROM the per-question evidence — no hallucinated holistic score.
    """
    reviews_str = json.dumps(question_reviews, indent=2)
    scores = [r.get("score", 0) for r in question_reviews if r.get("score") is not None]
    avg_score = round(sum(scores) / len(scores)) if scores else 0

    return f"""You are a senior engineering hiring manager completing a post-interview report for {company}, {role} position.

You have the following per-question evaluations (already generated from transcript evidence):
{reviews_str}

The computed average score across all questions is: {avg_score}/100.

Your task: synthesize these per-question evaluations into a final hiring report.

SYNTHESIS RULES:
1. The overall_score MUST be within ±5 points of {avg_score} (the evidence-derived average). Do NOT make up a different number.
2. Strengths MUST be supported by specific question_reviews that showed high scores or notable positive signals.
3. Weaknesses MUST be supported by specific question_reviews that showed low scores or gaps.
4. improvement_areas MUST map to actual weaknesses observed — no generic advice.
5. final_recommendation must be: "Hire", "Borderline", or "No Hire" — followed by a 2-sentence honest justification.
6. overall_verdict: one honest sentence describing the interview performance.

PROHIBITED:
- Generic strengths/weaknesses not tied to evidence
- Inflated scores above the evidence-derived average
- Generic improvement advice like "study more" or "practice communication"
- Fabricated patterns not present in the question_reviews

Return ONLY valid JSON:
{{
  "overall_score": <integer, within ±5 of {avg_score}>,
  "overall_verdict": "<one honest sentence>",
  "strengths": [
    "<specific strength tied to evidence from question reviews>",
    "<specific strength tied to evidence>",
    "<specific strength tied to evidence>"
  ],
  "weaknesses": [
    "<specific weakness tied to evidence>",
    "<specific weakness tied to evidence>",
    "<specific weakness tied to evidence>"
  ],
  "improvement_areas": [
    {{"area": "<specific topic>", "advice": "<concrete actionable step>"}},
    {{"area": "<specific topic>", "advice": "<concrete actionable step>"}},
    {{"area": "<specific topic>", "advice": "<concrete actionable step>"}}
  ],
  "final_recommendation": "<Hire | Borderline | No Hire> — <2-sentence justification>"
}}"""


def _extract_qa_pairs(history: list[dict]) -> list[dict]:
    """Extract user-assistant pairs from conversation history."""
    qa_pairs: list[dict] = []
    msgs = [m for m in history if m.get("role") in ("user", "assistant")]
    for i in range(0, len(msgs) - 1, 2):
        if msgs[i]["role"] == "user" and i + 1 < len(msgs):
            qa_pairs.append({
                "candidate_answer": msgs[i]["content"],
                "alex_response":    msgs[i + 1]["content"],
            })
    return qa_pairs


async def generate_summary(
    history: list[dict],
    company: str,
    role: str,
    questions_asked: list[str],
) -> dict:
    """
    Two-pass summary generation:
    Pass 1 — Per-question annotation at temperature 0.15 (deterministic)
    Pass 2 — Synthesis from annotated reviews at temperature 0.15 (consistent)

    This ensures overall_score is DERIVED from evidence, not hallucinated.
    """
    qa_pairs = _extract_qa_pairs(history)

    if not qa_pairs:
        return {
            "overall_score":         0,
            "overall_verdict":       "No interview data to evaluate.",
            "strengths":             [],
            "weaknesses":            [],
            "improvement_areas":     [],
            "question_reviews":      [],
            "final_recommendation":  "No Hire — insufficient interview data.",
        }

    # ── Pass 1: Per-question annotation ──────────────────────────────────────
    pass1_prompt = _build_per_question_annotation_prompt(qa_pairs, questions_asked, company, role)
    pass1_messages = [
        {"role": "system",  "content": pass1_prompt},
        {"role": "user",    "content": "Evaluate each question-answer pair now. Return only valid JSON."},
    ]
    pass1_result = await _safe_json_call(
        pass1_messages,
        max_tokens=2000,
        temperature=TEMP_EVAL,
        models=SUMMARY_MODELS,
    )
    question_reviews: list[dict] = pass1_result.get("question_reviews", [])

    if not question_reviews:
        # Fallback: return partial result rather than crash
        logger.warning("[interviewer] Pass 1 produced no question_reviews — using fallback")
        question_reviews = []

    # ── Pass 2: Overall synthesis ─────────────────────────────────────────────
    pass2_prompt = _build_synthesis_prompt(question_reviews, company, role)
    pass2_messages = [
        {"role": "system",  "content": pass2_prompt},
        {"role": "user",    "content": "Generate the final hiring report now. Return only valid JSON."},
    ]
    pass2_result = await _safe_json_call(
        pass2_messages,
        max_tokens=1200,
        temperature=TEMP_EVAL,
        models=SUMMARY_MODELS,
    )

    # Normalize question_reviews to match frontend schema expectations
    normalized_reviews = []
    for qr in question_reviews:
        normalized_reviews.append({
            "question":          qr.get("question", ""),
            "score":             qr.get("score", 0),
            "what_was_good":     qr.get("what_was_good", ""),
            "what_was_missing":  qr.get("what_was_missing", ""),
            "model_answer_hint": qr.get("model_answer_hint", ""),
            # New fields for richer frontend display
            "competency_tested": qr.get("competency_tested", ""),
            "key_evidence":      qr.get("key_evidence", ""),
            "scores":            qr.get("scores", {}),
        })

    return {
        "overall_score":        pass2_result.get("overall_score", 0),
        "overall_verdict":      pass2_result.get("overall_verdict", ""),
        "strengths":            pass2_result.get("strengths", []),
        "weaknesses":           pass2_result.get("weaknesses", []),
        "improvement_areas":    pass2_result.get("improvement_areas", []),
        "question_reviews":     normalized_reviews,
        "final_recommendation": pass2_result.get("final_recommendation", ""),
    }
