"""
services/firebase_service.py

Firestore integration with bulletproof in-memory fallback.

Design decision:
  python-firebase-admin maintains a PROCESS-WIDE global app registry.
  If another Firebase project (e.g. from a different workspace) initialized
  firebase_admin in the same Python process, _apps will be non-empty and
  firestore.client() will succeed but return a broken client.

  To guard against this, every single Firestore operation is wrapped in a
  try/except.  On any failure, the operation falls through to the in-memory
  store.  This makes the entire service completely crash-proof.

  In-memory data survives only for the lifetime of the server process.
  To get real persistence, supply firebase_credentials.json.
"""
from __future__ import annotations

import asyncio
import logging
import os
import datetime
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

from config import FIREBASE_CREDENTIALS_FILE, FIREBASE_PROJECT_ID

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# In-memory store  (always available, always correct)
# ─────────────────────────────────────────────────────────────────────────────
_mem: dict[str, Any] = {}

def _mem_set(key: str, data: dict) -> None:
    _mem[key] = data

def _mem_get(key: str) -> Optional[dict]:
    return _mem.get(key)


def _sanitize_data(data: Any) -> Any:
    """
    Recursively converts Firestore-native objects (datetime, Timestamp)
    to JSON-friendly formats (ISO strings).
    """
    if isinstance(data, dict):
        return {k: _sanitize_data(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_sanitize_data(v) for v in data]
    elif isinstance(data, datetime.datetime):
        return data.isoformat()
    # Check for google.cloud.firestore.Timestamp if possible, but isoformat() covers standard SDK
    elif hasattr(data, "isoformat"):
        return data.isoformat()
    return data


# ─────────────────────────────────────────────────────────────────────────────
# Firestore client  (optional)
# ─────────────────────────────────────────────────────────────────────────────
_db: Any   = None
_executor  = ThreadPoolExecutor(max_workers=4, thread_name_prefix="firestore")


def _try_init_firestore() -> None:
    """
    Initialise firebase_admin from either:
      1. FIREBASE_CREDENTIALS_JSON env var (JSON string) — used on Render/Railway
      2. A credentials FILE on disk — used locally

    Falls back to in-memory store if neither is available.
    """
    global _db
    import json

    # ── Option A: credentials from environment variable (cloud deployment) ─
    creds_json_str = os.environ.get("FIREBASE_CREDENTIALS_JSON", "").strip()
    if creds_json_str:
        try:
            creds_data = json.loads(creds_json_str)
            if "project_id" not in creds_data:
                logger.warning("FIREBASE_CREDENTIALS_JSON missing 'project_id' — using in-memory store.")
            else:
                import firebase_admin                                # type: ignore
                from firebase_admin import credentials, firestore   # type: ignore
                for stale in list(firebase_admin._apps.values()):
                    try: firebase_admin.delete_app(stale)
                    except Exception: pass
                firebase_admin.initialize_app(credentials.Certificate(creds_data))
                _db = firestore.client()
                logger.info("Firestore ready via env var (project=%s).", creds_data.get("project_id"))
                return
        except Exception as exc:
            logger.error("Firestore init from env var failed (%s) — using in-memory store.", exc)
            _db = None
            return

    # ── Option B: credentials from file (local dev) ────────────────────────
    creds_path = os.path.abspath(FIREBASE_CREDENTIALS_FILE)

    if not os.path.isfile(creds_path):
        logger.warning(
            "Firestore: credentials file '%s' not found — using in-memory store.",
            creds_path,
        )
        return

    try:
        with open(creds_path) as f:
            creds_data = json.load(f)
        if "project_id" not in creds_data:
            logger.warning(
                "Firestore: '%s' does not look like a service-account key — using in-memory store.",
                creds_path,
            )
            return
    except Exception as exc:
        logger.warning("Firestore: could not read credentials file: %s", exc)
        return

    try:
        import firebase_admin                                # type: ignore
        from firebase_admin import credentials, firestore   # type: ignore
        for stale in list(firebase_admin._apps.values()):
            try: firebase_admin.delete_app(stale)
            except Exception: pass
        firebase_admin.initialize_app(credentials.Certificate(creds_path))
        _db = firestore.client()
        logger.info(
            "Firestore ready via file (project=%s).",
            creds_data.get("project_id", FIREBASE_PROJECT_ID or "?"),
        )
    except Exception as exc:
        logger.error("Firestore init failed (%s) — using in-memory store.", exc)
        _db = None


_try_init_firestore()


def _use_firestore() -> bool:
    """True only when a real, tested Firestore client is available."""
    return _db is not None


# ─────────────────────────────────────────────────────────────────────────────
# Async executor helper
# ─────────────────────────────────────────────────────────────────────────────

async def _run(fn) -> Any:
    """Run a zero-arg blocking function on the thread-pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, fn)


# ─────────────────────────────────────────────────────────────────────────────
# Student profile
# ─────────────────────────────────────────────────────────────────────────────

async def get_student_profile(user_id: str) -> Optional[dict]:
    key = f"user_profiles/{user_id}"
    if not _use_firestore():
        return _mem_get(key)
    try:
        def _r():
            doc = _db.document(key).get()
            return doc.to_dict() if doc.exists else None
        raw = await _run(_r)
        return _sanitize_data(raw) if raw else None
    except Exception as exc:
        logger.warning("Firestore get_student_profile failed (%s) — using in-memory.", exc)
        return _mem_get(key)


async def save_student_profile(user_id: str, profile_data: dict) -> None:
    key = f"user_profiles/{user_id}"
    _mem_set(key, profile_data)   # always keep in-memory copy
    if not _use_firestore():
        return
    try:
        await _run(lambda: _db.document(key).set(profile_data, merge=True))
        logger.info("Saved profile for user=%s", user_id)
    except Exception as exc:
        logger.warning("Firestore save_student_profile failed (%s) — kept in-memory.", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Study logs
# ─────────────────────────────────────────────────────────────────────────────

async def log_study_hours(user_id: str, date: str, hours_studied: float) -> None:
    key  = f"users/{user_id}/study_logs/{date}"
    data = {"user_id": user_id, "date": date, "hours_studied": hours_studied}
    _mem_set(key, data)
    if not _use_firestore():
        return
    try:
        await _run(lambda: _db.document(key).set(data))
        logger.info("Logged %.2f hours for user=%s date=%s", hours_studied, user_id, date)
    except Exception as exc:
        logger.warning("Firestore log_study_hours failed (%s) — kept in-memory.", exc)


async def get_study_hours(user_id: str, date: str) -> Optional[float]:
    key = f"users/{user_id}/study_logs/{date}"
    if not _use_firestore():
        doc = _mem_get(key)
        return doc["hours_studied"] if doc else None
    try:
        def _r():
            doc = _db.document(key).get()
            return doc.to_dict().get("hours_studied") if doc.exists else None
        result = await _run(_r)
        return _sanitize_data(result)
    except Exception as exc:
        logger.warning("Firestore get_study_hours failed (%s) — using in-memory.", exc)
        doc = _mem_get(key)
        return doc["hours_studied"] if doc else None


async def get_today_study_hours(user_id: str, today_str: str) -> float:
    hours = await get_study_hours(user_id, today_str)
    return hours if hours is not None else 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Events snapshot
# ─────────────────────────────────────────────────────────────────────────────

async def save_scored_events(user_id: str, date: str, events: list[dict]) -> None:
    key  = f"users/{user_id}/events/{date}"
    data = {"user_id": user_id, "date": date, "events": events}
    _mem_set(key, data)
    if not _use_firestore():
        return
    try:
        await _run(lambda: _db.document(key).set(data))
    except Exception as exc:
        logger.warning("Firestore save_scored_events failed (%s).", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Daily plan
# ─────────────────────────────────────────────────────────────────────────────

async def save_daily_plan(user_id: str, date: str, plan: dict) -> None:
    key  = f"users/{user_id}/plans/{date}"
    data = {"user_id": user_id, "date": date, "plan": plan}
    _mem_set(key, data)
    if not _use_firestore():
        return
    try:
        await _run(lambda: _db.document(key).set(data))
    except Exception as exc:
        logger.warning("Firestore save_daily_plan failed (%s).", exc)


async def get_daily_plan(user_id: str, date: str) -> Optional[dict]:
    key = f"users/{user_id}/plans/{date}"
    if not _use_firestore():
        doc = _mem_get(key)
        return doc["plan"] if doc else None
    try:
        def _r():
            doc = _db.document(key).get()
            return doc.to_dict().get("plan") if doc.exists else None
        raw = await _run(_r)
        return _sanitize_data(raw) if raw else None
    except Exception as exc:
        logger.warning("Firestore get_daily_plan failed (%s) — using in-memory.", exc)
        doc = _mem_get(key)
        return doc["plan"] if doc else None


# ─────────────────────────────────────────────────────────────────────────────
# Mission Control — Applications
# ─────────────────────────────────────────────────────────────────────────────

async def save_application(user_id: str, app: dict) -> None:
    app_id = app.get("id") or app.get("company").lower().replace(" ", "_")
    key = f"users/{user_id}/applications/{app_id}"
    _mem_set(key, app)
    if not _use_firestore():
        return
    try:
        await _run(lambda: _db.document(key).set(app, merge=True))
    except Exception as exc:
        logger.warning("Firestore save_application failed (%s).", exc)


async def get_applications(user_id: str) -> list[dict]:
    path = f"users/{user_id}/applications"
    if not _use_firestore():
        return [v for k, v in _mem.items() if k.startswith(path)]
    try:
        def _r():
            docs = _db.collection(path).stream()
            return [doc.to_dict() for doc in docs]
        raw = await _run(_r)
        return _sanitize_data(raw)
    except Exception as exc:
        logger.warning("Firestore get_applications failed (%s).", exc)
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Mission Control — Performance History
# ─────────────────────────────────────────────────────────────────────────────

async def log_performance_score(user_id: str, date: str, score: int) -> None:
    key = f"users/{user_id}/performance_logs/{date}"
    existing = _mem_get(key) or {}
    existing["interview_score"] = score
    existing["date"] = date
    _mem_set(key, existing)
    if not _use_firestore():
        return
    try:
        await _run(lambda: _db.document(key).set({"interview_score": score, "date": date}, merge=True))
    except Exception as exc:
        logger.warning("Firestore log_performance_score failed (%s).", exc)


async def get_performance_history(user_id: str, limit: int = 30) -> list[dict]:
    path = f"users/{user_id}/performance_logs"
    if not _use_firestore():
        return sorted(
            [v for k, v in _mem.items() if k.startswith(path)],
            key=lambda x: x.get("date", ""),
            reverse=True
        )[:limit]
    try:
        def _r():
            docs = _db.collection(path).order_by("date", direction="DESCENDING").limit(limit).stream()
            return [doc.to_dict() for doc in docs]
        raw = await _run(_r)
        return _sanitize_data(raw)
    except Exception as exc:
        logger.warning("Firestore get_performance_history failed (%s).", exc)
        return []
