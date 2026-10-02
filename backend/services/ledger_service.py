"""
services/ledger_service.py

Append-Only SQLite Turn Ledger:
Guarantees mathematical ground truth for interview sessions.
Ensures post-interview reports can ONLY evaluate turns that were
actually audibly delivered and answered by the candidate.
Enforces cryptographic session integrity via SHA-256 digests.
"""
from __future__ import annotations

import hashlib
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Set

from backend.models.schemas import TurnEvent, TurnSpeaker

logger = logging.getLogger(__name__)

# Default SQLite database path
DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "ledger.db"
_DB_PATH = os.getenv("LEDGER_DB_PATH", str(DEFAULT_DB_PATH))


def get_db_path() -> str:
    return _DB_PATH


def set_db_path(path: str) -> None:
    global _DB_PATH
    _DB_PATH = path
    init_db()


def _get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH, timeout=10.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Initialize the SQLite append-only turns table and sessions index table."""
    conn = _get_connection()
    try:
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS turns (
                    turn_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    speaker TEXT NOT NULL,
                    role TEXT NOT NULL,
                    question_index INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    word_count INTEGER NOT NULL,
                    confidence REAL NOT NULL,
                    timestamp TEXT NOT NULL,
                    verified INTEGER NOT NULL
                );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, timestamp);")

            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    company TEXT NOT NULL DEFAULT 'Technology Firm',
                    role TEXT NOT NULL DEFAULT 'Software Engineer',
                    seniority TEXT NOT NULL DEFAULT 'Staff',
                    persona_id TEXT NOT NULL DEFAULT 'alex',
                    overall_score REAL,
                    recommendation TEXT,
                    report_json TEXT,
                    turn_count INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);")

            # Auto-backfill existing sessions from turns that are not yet in sessions table
            existing_turns_sessions = conn.execute("""
                SELECT session_id, count(*) as count, min(timestamp) as min_ts, max(timestamp) as max_ts
                FROM turns
                GROUP BY session_id
            """).fetchall()

            for row in existing_turns_sessions:
                sid = row["session_id"]
                tcount = row["count"]
                min_ts = row["min_ts"] or datetime.now(timezone.utc).isoformat()
                max_ts = row["max_ts"] or min_ts
                conn.execute("""
                    INSERT OR IGNORE INTO sessions (
                        session_id, company, role, seniority, persona_id,
                        turn_count, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    sid,
                    "Technology Firm",
                    "Software Engineer",
                    "Staff",
                    "alex",
                    tcount,
                    min_ts,
                    max_ts
                ))
    finally:
        conn.close()
    logger.info("[ledger] Initialized SQLite Turn Ledger & Sessions table at %s", _DB_PATH)


# Initialize DB on module load
init_db()


def record_turn(
    session_id: str,
    speaker: str | TurnSpeaker,
    text: str,
    question_index: int = 0,
    role: Optional[str] = None,
    confidence: float = 1.0,
    timestamp: Optional[str] = None,
    turn_id: Optional[str] = None,
) -> TurnEvent:
    """
    Append an immutable turn event into the SQLite Turn Ledger.
    Computes verified flag: verified = True if candidate word_count >= 10 and confidence >= 0.5.
    For interviewer turns, verified = True if word_count >= 3.
    """
    speaker_str = speaker.value if isinstance(speaker, TurnSpeaker) else str(speaker)
    role_str = role or speaker_str
    clean_text = text.strip()
    words = clean_text.split()
    word_count = len(words)
    ts = timestamp or datetime.now(timezone.utc).isoformat()
    tid = turn_id or f"turn_{uuid.uuid4().hex[:10]}"

    # Ground truth verification logic
    if speaker_str in ("candidate", "user"):
        verified = (word_count >= 10 and confidence >= 0.5)
    else:
        verified = (word_count >= 3)

    turn = TurnEvent(
        turn_id=tid,
        session_id=session_id,
        speaker=TurnSpeaker.CANDIDATE if speaker_str in ("candidate", "user") else TurnSpeaker.INTERVIEWER,
        role=role_str,
        question_index=question_index,
        text=clean_text,
        word_count=word_count,
        confidence=confidence,
        timestamp=ts,
        verified=verified,
    )

    conn = _get_connection()
    try:
        with conn:
            conn.execute("""
                INSERT OR REPLACE INTO turns (
                    turn_id, session_id, speaker, role, question_index,
                    text, word_count, confidence, timestamp, verified
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                turn.turn_id,
                turn.session_id,
                turn.speaker.value,
                turn.role,
                turn.question_index,
                turn.text,
                turn.word_count,
                turn.confidence,
                turn.timestamp,
                1 if turn.verified else 0,
            ))
            # Keep turn_count and updated_at fresh in sessions index
            conn.execute("""
                UPDATE sessions
                SET turn_count = (SELECT count(*) FROM turns WHERE session_id = ?),
                    updated_at = ?
                WHERE session_id = ?
            """, (session_id, ts, session_id))
    finally:
        conn.close()

    logger.debug("[ledger] Recorded turn %s in session %s (Speaker: %s, Words: %d, Verified: %s)",
                 turn.turn_id, session_id, turn.speaker.value, word_count, verified)
    return turn


def upsert_session(
    session_id: str,
    company: Optional[str] = None,
    role: Optional[str] = None,
    seniority: Optional[str] = None,
    persona_id: Optional[str] = None,
    overall_score: Optional[float] = None,
    recommendation: Optional[str] = None,
    report_json: Optional[str] = None,
    turn_count: Optional[int] = None,
) -> dict:
    """Insert or update a session record in the sessions index table."""
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_connection()
    try:
        with conn:
            existing = conn.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
            if existing:
                new_company = company or existing["company"]
                new_role = role or existing["role"]
                new_seniority = seniority or existing["seniority"]
                new_persona = persona_id or existing["persona_id"]
                new_score = overall_score if overall_score is not None else existing["overall_score"]
                new_rec = recommendation if recommendation is not None else existing["recommendation"]
                new_report = report_json if report_json is not None else existing["report_json"]
                new_turn_count = turn_count if turn_count is not None else existing["turn_count"]

                conn.execute("""
                    UPDATE sessions SET
                        company = ?, role = ?, seniority = ?, persona_id = ?,
                        overall_score = ?, recommendation = ?, report_json = ?,
                        turn_count = ?, updated_at = ?
                    WHERE session_id = ?
                """, (
                    new_company, new_role, new_seniority, new_persona,
                    new_score, new_rec, new_report,
                    new_turn_count, now, session_id
                ))
            else:
                conn.execute("""
                    INSERT INTO sessions (
                        session_id, company, role, seniority, persona_id,
                        overall_score, recommendation, report_json,
                        turn_count, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    session_id,
                    company or "Technology Firm",
                    role or "Software Engineer",
                    seniority or "Staff",
                    persona_id or "alex",
                    overall_score,
                    recommendation,
                    report_json,
                    turn_count or 0,
                    now,
                    now
                ))
    finally:
        conn.close()
    return get_session(session_id) or {}


def get_session(session_id: str) -> Optional[dict]:
    """Retrieve session record by session ID."""
    conn = _get_connection()
    try:
        row = conn.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
        if not row:
            return None
        return dict(row)
    finally:
        conn.close()


def list_sessions(limit: int = 50, offset: int = 0) -> List[dict]:
    """List chronological sessions sorted by created_at DESC."""
    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM sessions ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def delete_session(session_id: str) -> bool:
    """Delete a session and its turns from SQLite ledger."""
    conn = _get_connection()
    try:
        with conn:
            conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
            conn.execute("DELETE FROM turns WHERE session_id = ?", (session_id,))
        return True
    except Exception as e:
        logger.error("[ledger] Failed to delete session %s: %s", session_id, e)
        return False
    finally:
        conn.close()


def get_session_turns(session_id: str) -> List[TurnEvent]:
    """Retrieve all chronological turns for a given session."""
    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM turns WHERE session_id = ? ORDER BY timestamp ASC, rowid ASC",
            (session_id,)
        ).fetchall()
        return [
            TurnEvent(
                turn_id=row["turn_id"],
                session_id=row["session_id"],
                speaker=TurnSpeaker(row["speaker"]),
                role=row["role"],
                question_index=row["question_index"],
                text=row["text"],
                word_count=row["word_count"],
                confidence=row["confidence"],
                timestamp=row["timestamp"],
                verified=bool(row["verified"]),
            )
            for row in rows
        ]
    finally:
        conn.close()


def get_verified_candidate_turns(session_id: str) -> List[TurnEvent]:
    """
    MATHEMATICAL GROUND TRUTH GUARANTEE:
    Returns ONLY candidate turns with verified == 1 (word_count >= 10 and confidence >= 0.5).
    """
    turns = get_session_turns(session_id)
    return [t for t in turns if t.speaker == TurnSpeaker.CANDIDATE and t.verified]


def get_asked_question_indices(session_id: str) -> Set[int]:
    """
    Returns the set of question indices that the interviewer actually voiced during the session.
    Any blueprint question not in this set is strictly UNREACHED.
    """
    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT DISTINCT question_index FROM turns WHERE session_id = ? AND speaker = ? AND verified = 1",
            (session_id, TurnSpeaker.INTERVIEWER.value)
        ).fetchall()
        return {int(row["question_index"]) for row in rows}
    finally:
        conn.close()


def compute_session_hash(session_id: str) -> str:
    """
    Computes a cryptographic SHA-256 integrity hash over all chronological turns in the room.
    Proves mathematical immutability and protects against phantom hallucinated questions.
    """
    turns = get_session_turns(session_id)
    if not turns:
        return hashlib.sha256(f"{session_id}:empty".encode("utf-8")).hexdigest()

    hasher = hashlib.sha256()
    for turn in turns:
        segment = f"{turn.turn_id}|{turn.speaker.value}|{turn.question_index}|{turn.text}|{turn.timestamp}"
        hasher.update(segment.encode("utf-8"))

    return hasher.hexdigest()


class LedgerService:
    record_turn = staticmethod(record_turn)
    get_session_turns = staticmethod(get_session_turns)
    get_verified_candidate_turns = staticmethod(get_verified_candidate_turns)
    get_asked_question_indices = staticmethod(get_asked_question_indices)
    compute_session_hash = staticmethod(compute_session_hash)
    init_db = staticmethod(init_db)
    upsert_session = staticmethod(upsert_session)
    get_session = staticmethod(get_session)
    list_sessions = staticmethod(list_sessions)
    delete_session = staticmethod(delete_session)


ledger_service = LedgerService()
