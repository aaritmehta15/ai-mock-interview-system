"""
utils/date_utils.py — deterministic date arithmetic helpers.

All functions are pure (no side-effects, no I/O) so they are trivially testable.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Optional


_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def today_utc() -> date:
    """Return today's date in UTC."""
    return datetime.now(tz=timezone.utc).date()


def parse_date_safe(raw: Optional[str]) -> Optional[date]:
    """
    Parse a 'YYYY-MM-DD' string into a ``datetime.date``.

    Returns ``None`` if the string is missing, malformed, or out of range.
    Never raises.
    """
    if not raw:
        return None
    raw = raw.strip()
    if not _DATE_PATTERN.match(raw):
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def days_until(event_date: Optional[date], reference: Optional[date] = None) -> Optional[int]:
    """
    Return the number of calendar days between *reference* (default: today UTC)
    and *event_date*.  Returns ``None`` when *event_date* is ``None``.

    Negative values mean the event is in the past; callers decide how to handle
    that (the priority engine clamps to 1).
    """
    if event_date is None:
        return None
    ref = reference or today_utc()
    return (event_date - ref).days


def is_tomorrow(event_date: Optional[date], reference: Optional[date] = None) -> bool:
    """Return ``True`` iff *event_date* is exactly one day after *reference*."""
    delta = days_until(event_date, reference)
    return delta == 1


def format_date(d: Optional[date]) -> Optional[str]:
    """Return an ISO-8601 string or ``None``."""
    return d.isoformat() if d else None


def now_iso() -> str:
    """Return the current UTC timestamp as an ISO-8601 string."""
    return datetime.now(tz=timezone.utc).isoformat()
