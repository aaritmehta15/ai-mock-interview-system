import json
import os
from dotenv import load_dotenv
from groq import AsyncGroq
import asyncio

load_dotenv()

client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
MAX_HISTORY_MESSAGES = 20


def build_system_prompt(company: str, role: str, questions: list[str], asked: list[str]) -> str:
    questions_json = json.dumps(questions, indent=2)
    asked_json = json.dumps(asked, indent=2) if asked else "[]"
    return f"""You are Alex, a senior technical interviewer at {company} with 10 years of hiring experience.
You are currently conducting a REAL job interview for a {role} position.

INTERVIEW RULES — NEVER break these:
1. Ask EXACTLY ONE question at a time, chosen from the QUESTION BANK below.
2. After EVERY candidate message (even if off-topic, evasive, or wrong), ALWAYS fill feedback JSON with specific, honest content — never leave 'good', 'missing', or 'improve' as empty strings.
3. If the candidate DODGES the question or gives an irrelevant answer, the feedback must explicitly say so. Example: missing: 'Candidate did not address the question at all', improve: 'Answer the question directly before adding context'.
4. If the candidate asks you to give them the answer or reveal hints, FIRMLY REFUSE. Say something like: 'I cannot give you the answer — this is a real interview. Please attempt the question in your own words.' Then repeat the current question.
5. If the candidate goes off-topic (cricket, weather, jokes, etc.), politely but firmly redirect: 'Let's stay focused on the interview. Here is your question again:' and repeat it.
6. Stay 100% in character as Alex — never reveal you are an AI.
7. Remember EVERYTHING the candidate has said in the full conversation history.
8. NEVER ask any question from the ALREADY ASKED list below — STRICTLY FORBIDDEN.
9. Keep tone professional, direct, and warm — like a real senior interviewer who genuinely wants the candidate to succeed.

QUESTION BANK (use ONLY these):
{questions_json}

ALREADY ASKED — DO NOT REPEAT:
{asked_json}

RESPONSE FORMAT — always return valid JSON only, no markdown, no extra text:
{{
  "reply": "Your full conversational response as Alex (must always address what the candidate just said)",
  "feedback": {{
    "good": "<specific thing the candidate did well — NEVER leave empty, even for bad answers>",
    "missing": "<specific gap — NEVER leave empty. If answer was off-topic say so explicitly>",
    "improve": "<one concrete actionable tip — NEVER leave empty>"
  }},
  "next_question": "<next question from bank NOT in already-asked — empty string ONLY when all questions exhausted>"
}}
Note: Set feedback to null ONLY on the very first greeting before any candidate answer."""


async def _run_groq(messages: list[dict], max_tokens: int = 600) -> str:
    last_error = None
    for model in MODELS:
        try:
            completion = await client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
            return completion.choices[0].message.content
        except Exception as e:
            last_error = e
            err_str = str(e).lower()
            if "429" in str(e) or "rate_limit" in err_str or "quota" in err_str:
                continue
            raise RuntimeError(f"LLM error on model {model}: {e}") from e
    raise RuntimeError(f"All Groq models failed. Last error: {last_error}")


async def _safe_json_call(messages: list[dict], max_tokens: int = 600) -> dict:
    """Call Groq and parse JSON. Retry once on parse failure."""
    for attempt in range(2):
        raw = await _run_groq(messages, max_tokens)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            if attempt == 0:
                print(f"[interviewer] JSON parse failed, retrying... Raw: {raw[:200]}")
                continue
            raise RuntimeError(f"Groq returned invalid JSON after 2 attempts: {raw[:300]}")


def _prune_history(history: list[dict]) -> list[dict]:
    system_msgs = [m for m in history if m.get("role") == "system"]
    other_msgs  = [m for m in history if m.get("role") != "system"]
    if len(other_msgs) > MAX_HISTORY_MESSAGES - 1:
        other_msgs = other_msgs[-(MAX_HISTORY_MESSAGES - 1):]
    return system_msgs + other_msgs


async def chat(
    history: list[dict],
    user_message: str,
    company: str,
    role: str,
    questions: list[str],
    asked_questions: list[str],
) -> dict:
    system_prompt = build_system_prompt(company, role, questions, asked_questions)
    non_system = [m for m in history if m.get("role") != "system"]
    messages = (
        [{"role": "system", "content": system_prompt}]
        + non_system
        + [{"role": "user", "content": user_message}]
    )
    messages = _prune_history(messages)

    parsed = await _safe_json_call(messages)
    return {
        "reply":         parsed.get("reply", ""),
        "feedback":      parsed.get("feedback", None),
        "next_question": parsed.get("next_question", ""),
    }


async def generate_summary(
    history: list[dict],
    company: str,
    role: str,
    questions_asked: list[str],
) -> dict:
    """
    Analyse the full interview transcript and return a rich structured summary.
    """
    qa_pairs = []
    msgs = [m for m in history if m.get("role") in ("user", "assistant")]
    for i in range(0, len(msgs) - 1, 2):
        if msgs[i]["role"] == "user" and i + 1 < len(msgs):
            qa_pairs.append({
                "candidate_answer": msgs[i]["content"],
                "alex_response":    msgs[i + 1]["content"] if i + 1 < len(msgs) else "",
            })

    summary_prompt = f"""You are reviewing a completed mock job interview at {company} for a {role} position.

Interview transcript (Q&A pairs):
{json.dumps(qa_pairs, indent=2)}

Questions that were asked:
{json.dumps(questions_asked, indent=2)}

Provide a DETAILED, HONEST, SPECIFIC post-interview analysis. Be direct — no generic praise.

RESPONSE FORMAT — valid JSON only:
{{
  "overall_score": <integer 0-100>,
  "overall_verdict": "<one sentence honest assessment>",
  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "weaknesses": ["<specific weakness 1>", "<specific weakness 2>", "<specific weakness 3>"],
  "improvement_areas": [
    {{"area": "<topic>", "advice": "<concrete, actionable step to improve>"}},
    {{"area": "<topic>", "advice": "<concrete, actionable step to improve>"}},
    {{"area": "<topic>", "advice": "<concrete, actionable step to improve>"}}
  ],
  "question_reviews": [
    {{
      "question": "<question text>",
      "score": <integer 0-10>,
      "what_was_good": "<specific thing that was good>",
      "what_was_missing": "<specific gap in the answer>",
      "model_answer_hint": "<key point a strong candidate would have said>"
    }}
  ],
  "final_recommendation": "<hire / borderline / no hire with 2-sentence justification>"
}}"""

    messages = [
        {"role": "system", "content": summary_prompt},
        {"role": "user",   "content": "Please generate the full post-interview summary now."},
    ]

    parsed = await _safe_json_call(messages, max_tokens=1500)
    return {
        "overall_score":      parsed.get("overall_score", 0),
        "overall_verdict":    parsed.get("overall_verdict", ""),
        "strengths":          parsed.get("strengths", []),
        "weaknesses":         parsed.get("weaknesses", []),
        "improvement_areas":  parsed.get("improvement_areas", []),
        "question_reviews":   parsed.get("question_reviews", []),
        "final_recommendation": parsed.get("final_recommendation", ""),
    }

