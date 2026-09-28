"""
orchestrator/sweet_spot.py

Dynamic Sweet-Spot & Confidence Tracker:
Implements mathematical modeling of human interviewer assessment evolution.
Assessment begins at favorable baseline (S_0 = 70, C_0 = 0.3) and shifts as
evidence accumulates across conversational turns.
Controls behavioral action triggers: Nudge, Escalation Probe, and Doubt Interrogation.
"""
from __future__ import annotations

import re
from typing import List, Optional, Tuple
from pydantic import BaseModel, Field

from backend.models.schemas import PersonaProfile


# ── Buzzwords & Hesitation Lexicons ──────────────────────────────────────────

TECHNICAL_BUZZWORDS = [
    "kafka",
    "redis",
    "microservices",
    "two-phase commit",
    "2pc",
    "saga",
    "raft",
    "paxos",
    "idempotency",
    "consistent hashing",
    "circuit breaker",
    "eventual consistency",
    "sharding",
    "distributed lock",
    "vector clock",
]

HESITATION_PATTERNS = [
    r"\bi don't know\b",
    r"\bnot sure\b",
    r"\bgive me a second\b",
    r"\blet me think\b",
    r"\bi'm blanking\b",
    r"\bum+\b",
    r"\buh+\b",
    r"\blost my train of thought\b",
]

ABSOLUTE_CLAIMS = [
    r"\bcompletely bulletproof\b",
    r"\bzero latency\b",
    r"\b100% (reliable|uptime|guaranteed)\b",
    r"\bimpossible to fail\b",
    r"\balways works\b",
    r"\bnever goes down\b",
    r"\bcompletely safe\b",
]


class SweetSpotState(BaseModel):
    """
    Internal state tracking for candidate assessment throughout the session.
    """
    session_id: str
    running_score: float = Field(default=70.0, ge=0.0, le=100.0, description="S_t: Current running assessment")
    confidence: float = Field(default=0.3, ge=0.0, le=1.0, description="C_t: Interviewer assessment certainty")
    turns_count: int = Field(default=0)
    nudges_count: int = Field(default=0)
    probes_count: int = Field(default=0)
    doubts_count: int = Field(default=0)

    def update_evidence(self, score_delta: float, weight: float = 0.08) -> Tuple[float, float]:
        """
        Bayesian-style update:
        S_t = S_{t-1} + Delta_S * C_t
        C_t = min(1.0, C_{t-1} + weight)
        """
        self.running_score = max(0.0, min(100.0, self.running_score + (score_delta * self.confidence)))
        self.confidence = min(1.0, self.confidence + weight)
        self.turns_count += 1
        return self.running_score, self.confidence


class ConversationalActionTracker:
    """
    Determines real-time interviewer actions (Nudge, Escalation Probe, Doubt)
    based on candidate speech metrics, silence duration, and persona archetype.
    """

    @staticmethod
    def should_nudge(pause_seconds: float, candidate_text: str, persona: PersonaProfile) -> bool:
        """
        Triggers a gentle scaffolding hint if candidate pause exceeds persona threshold
        or candidate explicitly expresses hesitation.
        """
        if pause_seconds >= persona.pause_tolerance:
            return True

        text_lower = candidate_text.lower()
        for pattern in HESITATION_PATTERNS:
            if re.search(pattern, text_lower):
                return True

        return False

    @staticmethod
    def detect_buzzwords(candidate_text: str) -> List[str]:
        """
        Identifies high-level distributed systems buzzwords mentioned in the turn.
        """
        text_lower = candidate_text.lower()
        found = []
        for word in TECHNICAL_BUZZWORDS:
            if word in text_lower:
                found.append(word)
        return found

    @staticmethod
    def should_escalate_probe(candidate_text: str, persona: PersonaProfile) -> Optional[str]:
        """
        Under high/elite difficulty (Marcus / Priya), drops an escalation probe when
        candidate drops advanced architecture buzzwords without explaining failure semantics.
        """
        if persona.difficulty not in ("High", "Elite"):
            return None

        buzzwords = ConversationalActionTracker.detect_buzzwords(candidate_text)
        if not buzzwords:
            return None

        # Return targeted probe prompt based on primary buzzword
        primary = buzzwords[0]
        probes = {
            "kafka": "You mentioned Kafka. How do you handle consumer group rebalancing under high rebalance latency without message loss?",
            "redis": "You mentioned Redis. What happens during a network partition if a distributed lock expires while work is ongoing?",
            "microservices": "You mentioned microservices. How do you guarantee cross-service consistency during network timeouts without distributed deadlocks?",
            "two-phase commit": "Two-phase commit is blocking. How do you handle coordinator failure after the prepare phase?",
            "2pc": "Two-phase commit is blocking. How do you handle coordinator failure after the prepare phase?",
            "distributed lock": "What fencing tokens do you use with distributed locks to prevent split-brain writes?",
            "idempotency": "How do you implement idempotency keys across distributed nodes when database writes fail midway?",
        }
        return probes.get(primary, f"You mentioned {primary}. What are the failure modes and operational trade-offs of that approach?")

    @staticmethod
    def should_doubt(candidate_text: str, persona: PersonaProfile) -> Optional[str]:
        """
        Tests candidate conviction under skeptical personas when absolute claims are made.
        """
        if persona.id not in ("marcus", "priya"):
            return None

        text_lower = candidate_text.lower()
        for pattern in ABSOLUTE_CLAIMS:
            if re.search(pattern, text_lower):
                return "Are you sure? In production at scale, what edge case causes that guarantee to break down?"

        return None
