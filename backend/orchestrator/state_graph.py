"""
DAAZLING Conversational Orchestrator - LangGraph State Graph
============================================================
Formal cyclical state machine managing multi-turn interview flow:
Warmup -> DeliverQuestion -> CandidateTurn -> AnalyzeTurn -> (Nudge | Doubt | Probe | Advance) -> Conclude
"""

import os
import re
import logging
from typing import TypedDict, Optional, List, Dict, Any
from langgraph.graph import StateGraph, START, END

from orchestrator.personas import (
    get_persona,
    PersonaProfile,
    PersonaId,
)
from services.blueprint_service import get_blueprint, InterviewBlueprint

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Conversational State Schema
# ─────────────────────────────────────────────────────────────────────────────

class InterviewState(TypedDict):
    session_id: str
    blueprint_id: str
    persona_id: str
    current_question_index: int
    current_probe_count: int
    max_probes_per_question: int
    stage: str  # "warmup" | "question" | "probing" | "concluded"
    last_candidate_utterance: str
    turn_action: str  # "nudge" | "doubt" | "escalation_probe" | "advance_question" | "conclude"
    interviewer_utterance: str
    questions_total: int
    detected_buzzwords: List[str]


# ─────────────────────────────────────────────────────────────────────────────
# 2. Turn Analysis & Heuristics
# ─────────────────────────────────────────────────────────────────────────────

TECHNICAL_BUZZWORDS = [
    "kafka", "redis", "microservices", "kubernetes", "k8s", "distributed lock",
    "two-phase commit", "2pc", "saga", "sharding", "consistent hashing",
    "eventual consistency", "cap theorem", "load balancer", "raft", "paxos",
    "o(1)", "o(log n)", "idempotency", "rate limiter", "circuit breaker"
]


def extract_buzzwords(text: str) -> List[str]:
    """Identify key architectural keywords used in candidate utterance."""
    lower_text = text.lower()
    found = []
    for word in TECHNICAL_BUZZWORDS:
        if re.search(r'\b' + re.escape(word) + r'\b', lower_text):
            found.append(word)
    return found


HESITATION_PATTERNS = [
    r"\b(i don'?t know|not sure|not certain|no idea|blanking)\b",
    r"\b(let me think|give me a second|give me a moment)\b",
    r"\b(um+|uh+|err+)\b",
]


def analyze_candidate_turn(
    utterance: str,
    probe_count: int,
    max_probes: int,
    persona: PersonaProfile,
    is_last_question: bool
) -> str:
    """
    Determines next state transition:
    - 'nudge': if candidate spoke < 8 words or expressed hesitation
    - 'escalation_probe': if candidate dropped architectural buzzwords without depth
    - 'doubt': if candidate made absolute claims under skeptical personas (Marcus/Priya)
    - 'advance_question': if candidate delivered a comprehensive answer or max probes reached
    - 'conclude': if last question is completed
    """
    clean = utterance.strip()
    word_count = len(clean.split())
    lower = clean.lower()

    # If already reached maximum allowed follow-ups on this question, advance or conclude
    if probe_count >= max_probes:
        return "conclude" if is_last_question else "advance_question"

    # Case A: Terse or silent answer (< 8 words) or overt hesitation pattern
    has_hesitation = any(re.search(p, lower) for p in HESITATION_PATTERNS)
    if word_count < 8 or (word_count < 15 and has_hesitation):
        return "nudge"

    # Extract technical terms
    buzzwords = extract_buzzwords(clean)

    # Case B: High confidence or absolute claims ("always", "never", "guarantee", "bulletproof") -> Doubt under Marcus/Priya
    absolute_claims = ["always", "never", "guarantee", "bulletproof", "zero latency", "completely safe", "100%"]
    has_absolute = any(c in lower for c in absolute_claims)
    if has_absolute and persona.id in [PersonaId.MARCUS, PersonaId.PRIYA]:
        return "doubt"

    # Case C: Buzzwords dropped without deep explanation -> Escalation Probe
    if buzzwords and probe_count < 1:
        return "escalation_probe"

    # Case D: Substantive answer delivered (> 25 words) -> Advance
    if word_count >= 25 or probe_count >= 1:
        return "conclude" if is_last_question else "advance_question"

    # Default to persona-guided probe or advance
    if persona.id == PersonaId.MARCUS:
        return "doubt"
    return "conclude" if is_last_question else "advance_question"


# ─────────────────────────────────────────────────────────────────────────────
# 3. State Nodes
# ─────────────────────────────────────────────────────────────────────────────

def warmup_node(state: InterviewState) -> Dict[str, Any]:
    """Initial warm greeting tailored to the chosen interviewer persona."""
    persona = get_persona(state.get("persona_id"))
    blueprint = get_blueprint(state.get("session_id")) or get_blueprint(state.get("blueprint_id"))
    
    role = blueprint.role if blueprint else "Software Engineer"
    company = blueprint.company if blueprint else "our team"

    if persona.id == PersonaId.ALEX:
        greeting = (
            f"Hi, welcome! I'm Alex. Thanks so much for taking the time to speak with us today. "
            f"We're looking forward to discussing the {role} role at {company}. "
            f"To start off, could you briefly introduce yourself and what you've been working on recently?"
        )
    elif persona.id == PersonaId.MARCUS:
        greeting = (
            f"Hello. I'm Marcus Vance. Today we'll be evaluating your systems and architectural depth "
            f"for the {role} role at {company}. We have several specific technical areas to cover. "
            f"Let's dive straight in."
        )
    else:  # Priya
        greeting = (
            f"Hello. I'm Priya Sharma. We have a focused agenda today covering distributed scale, "
            f"system trade-offs, and operational resiliency for the {role} position. "
            f"Let's get right to our first technical problem."
        )

    return {
        "stage": "warmup",
        "interviewer_utterance": greeting,
        "turn_action": "deliver_question",
        "current_question_index": 0,
        "current_probe_count": 0,
    }


def deliver_question_node(state: InterviewState) -> Dict[str, Any]:
    """Delivers the current blueprint question."""
    blueprint = get_blueprint(state.get("session_id")) or get_blueprint(state.get("blueprint_id"))
    idx = state.get("current_question_index", 0)

    if blueprint and idx < len(blueprint.questions):
        q = blueprint.questions[idx]
        question_text = q.text
    else:
        question_text = "Could you walk me through your architectural approach to scaling high-throughput write systems?"

    return {
        "stage": "question",
        "interviewer_utterance": question_text,
        "turn_action": "await_candidate",
        "current_probe_count": 0,
    }


def analyze_turn_node(state: InterviewState) -> Dict[str, Any]:
    """Evaluates the candidate's last utterance and determines the conversational branch."""
    persona = get_persona(state.get("persona_id"))
    blueprint = get_blueprint(state.get("session_id")) or get_blueprint(state.get("blueprint_id"))
    
    total_q = state.get("questions_total", 3)
    if blueprint:
        total_q = len(blueprint.questions)

    curr_idx = state.get("current_question_index", 0)
    is_last = (curr_idx + 1) >= total_q

    utterance = state.get("last_candidate_utterance", "")
    probe_cnt = state.get("current_probe_count", 0)
    max_probes = state.get("max_probes_per_question", 2)

    action = analyze_candidate_turn(
        utterance=utterance,
        probe_count=probe_cnt,
        max_probes=max_probes,
        persona=persona,
        is_last_question=is_last,
    )
    buzzwords = extract_buzzwords(utterance)

    return {
        "turn_action": action,
        "detected_buzzwords": buzzwords,
    }


def nudge_node(state: InterviewState) -> Dict[str, Any]:
    """Provides an encouraging nudge or scaffolding hint based on the persona."""
    persona = get_persona(state.get("persona_id"))
    if persona.id == PersonaId.ALEX:
        nudge_text = (
            "Take your time. Feel free to think out loud—how would you break this problem down into "
            "its core components first?"
        )
    elif persona.id == PersonaId.MARCUS:
        nudge_text = (
            "Don't worry about being completely exhaustive upfront. Give me your high-level thesis "
            "on the primary trade-off."
        )
    else:
        nudge_text = (
            "What is your immediate intuition regarding the asymptotic bottleneck here?"
        )

    return {
        "stage": "probing",
        "interviewer_utterance": nudge_text,
        "current_probe_count": state.get("current_probe_count", 0) + 1,
    }


def doubt_node(state: InterviewState) -> Dict[str, Any]:
    """Challenges an assumption or claim made by the candidate."""
    persona = get_persona(state.get("persona_id"))
    buzzwords = state.get("detected_buzzwords", [])
    subject = buzzwords[0] if buzzwords else "that approach"

    if persona.id == PersonaId.MARCUS:
        doubt_text = (
            f"You sound quite certain about using {subject}. But under high write contention "
            f"or network partitions, what happens when latency spikes? What is the breaking point?"
        )
    elif persona.id == PersonaId.PRIYA:
        doubt_text = (
            f"Are you confident {subject} holds up at 500k QPS? How does the memory footprint "
            f"and cache invalidation degrade at scale?"
        )
    else:
        doubt_text = (
            f"That's one way to solve it with {subject}. What would be the biggest drawback or "
            f"risk of doing it that way?"
        )

    return {
        "stage": "probing",
        "interviewer_utterance": doubt_text,
        "current_probe_count": state.get("current_probe_count", 0) + 1,
    }


def escalation_probe_node(state: InterviewState) -> Dict[str, Any]:
    """Digs into implementation mechanics when candidate mentions high-level buzzwords."""
    persona = get_persona(state.get("persona_id"))
    buzzwords = state.get("detected_buzzwords", [])
    target = buzzwords[0] if buzzwords else "that architecture"

    if persona.id == PersonaId.MARCUS:
        probe_text = (
            f"You brought up {target}. Walk me through the exact failure mode when an instance dies "
            f"mid-transaction. How do you guarantee idempotency?"
        )
    elif persona.id == PersonaId.PRIYA:
        probe_text = (
            f"Given you chose {target}, what are the explicit mathematical guarantees on partition tolerance "
            f"and write throughput across availability zones?"
        )
    else:
        probe_text = (
            f"You mentioned {target}—could you elaborate a bit more on how you'd configure the data flow "
            f"and prevent cascading failures?"
        )

    return {
        "stage": "probing",
        "interviewer_utterance": probe_text,
        "current_probe_count": state.get("current_probe_count", 0) + 1,
    }


def advance_question_node(state: InterviewState) -> Dict[str, Any]:
    """Transitions from the previous question to the next question in the blueprint."""
    new_idx = state.get("current_question_index", 0) + 1
    blueprint = get_blueprint(state.get("session_id")) or get_blueprint(state.get("blueprint_id"))

    if blueprint and new_idx < len(blueprint.questions):
        next_q = blueprint.questions[new_idx]
        transition = f"Great, thank you. Let's move on to our next area: {next_q.text}"
    else:
        transition = "Thank you for that explanation. Let's move forward to the next topic."

    return {
        "stage": "question",
        "current_question_index": new_idx,
        "current_probe_count": 0,
        "interviewer_utterance": transition,
        "turn_action": "await_candidate",
    }


def conclude_interview_node(state: InterviewState) -> Dict[str, Any]:
    """Concludes the interview gracefully."""
    persona = get_persona(state.get("persona_id"))
    
    if persona.id == PersonaId.ALEX:
        conclude_text = (
            "That wraps up all of our questions for today! You did a wonderful job discussing "
            "some complex architectural concepts. I'll pass my notes along to the team, and you can "
            "review your detailed performance dossier right now. Thank you so much!"
        )
    elif persona.id == PersonaId.MARCUS:
        conclude_text = (
            "That completes our technical evaluation. I have sufficient signal across all our core "
            "engineering rubrics. You can now examine your grounded performance dossier. Goodbye."
        )
    else:
        conclude_text = (
            "We have completed all technical assessment dimensions. Thank you for your time today. "
            "Your comprehensive evaluation dossier is ready for review."
        )

    return {
        "stage": "concluded",
        "interviewer_utterance": conclude_text,
        "turn_action": "concluded",
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. Conditional Edge Router
# ─────────────────────────────────────────────────────────────────────────────

def route_entry(state: InterviewState) -> str:
    """Routes initial invocation: warmup for new sessions, analyze_turn for active candidate turns."""
    if state.get("stage") == "warmup" or not state.get("last_candidate_utterance"):
        return "warmup"
    return "analyze_turn"


def route_action(state: InterviewState) -> str:
    """Routes LangGraph execution based on analyze_turn_node determination."""
    action = state.get("turn_action", "advance_question")
    if action == "nudge":
        return "nudge"
    elif action == "doubt":
        return "doubt"
    elif action == "escalation_probe":
        return "escalation_probe"
    elif action == "conclude":
        return "conclude"
    else:
        return "advance_question"


# ─────────────────────────────────────────────────────────────────────────────
# 5. Graph Compilation
# ─────────────────────────────────────────────────────────────────────────────

def build_interview_graph() -> StateGraph:
    """Builds and compiles the cyclical LangGraph conversational state machine."""
    workflow = StateGraph(InterviewState)

    # Add Nodes
    workflow.add_node("warmup", warmup_node)
    workflow.add_node("deliver_question", deliver_question_node)
    workflow.add_node("analyze_turn", analyze_turn_node)
    workflow.add_node("nudge", nudge_node)
    workflow.add_node("doubt", doubt_node)
    workflow.add_node("escalation_probe", escalation_probe_node)
    workflow.add_node("advance_question", advance_question_node)
    workflow.add_node("conclude", conclude_interview_node)

    # Route from START
    workflow.add_conditional_edges(
        START,
        route_entry,
        {
            "warmup": "warmup",
            "analyze_turn": "analyze_turn",
        }
    )
    workflow.add_edge("warmup", "deliver_question")
    workflow.add_edge("deliver_question", END)

    # analyze_turn branches out
    workflow.add_conditional_edges(
        "analyze_turn",
        route_action,
        {
            "nudge": "nudge",
            "doubt": "doubt",
            "escalation_probe": "escalation_probe",
            "advance_question": "advance_question",
            "conclude": "conclude",
        }
    )

    # Probing / advancing / concluding transitions to END (waiting for candidate turn or concluding)
    workflow.add_edge("advance_question", END)
    workflow.add_edge("nudge", END)
    workflow.add_edge("doubt", END)
    workflow.add_edge("escalation_probe", END)
    workflow.add_edge("conclude", END)

    return workflow.compile()


# Global compiled app
interview_graph_app = build_interview_graph()


def step_interview_turn(
    session_id: str,
    blueprint_id: str,
    persona_id: str,
    candidate_utterance: str,
    current_question_index: int = 0,
    current_probe_count: int = 0,
    max_probes_per_question: int = 2,
    questions_total: int = 3,
) -> Dict[str, Any]:
    """
    Convenience runner that steps the LangGraph state machine with the candidate's latest utterance.
    """
    initial_state: InterviewState = {
        "session_id": session_id,
        "blueprint_id": blueprint_id,
        "persona_id": persona_id,
        "current_question_index": current_question_index,
        "current_probe_count": current_probe_count,
        "max_probes_per_question": max_probes_per_question,
        "stage": "in_progress",
        "last_candidate_utterance": candidate_utterance,
        "turn_action": "",
        "interviewer_utterance": "",
        "questions_total": questions_total,
        "detected_buzzwords": [],
    }

    # Step through analyze_turn and its routed child node
    result = interview_graph_app.invoke(initial_state)
    return result
