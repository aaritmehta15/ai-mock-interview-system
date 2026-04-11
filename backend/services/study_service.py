"""
services/study_service.py

Thin wrapper — delegates all persistence to firebase_service.
Kept as a separate module so the API layer doesn't import firebase directly.
"""
from __future__ import annotations

from services import firebase_service


async def log_study_hours(user_id: str, date: str, hours_studied: float) -> None:
    await firebase_service.log_study_hours(user_id, date, hours_studied)


async def get_today_study_hours(user_id: str, today_str: str) -> float:
    return await firebase_service.get_today_study_hours(user_id, today_str)
