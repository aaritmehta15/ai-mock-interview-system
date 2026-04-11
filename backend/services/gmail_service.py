"""
services/gmail_service.py

Gmail integration via the Gmail REST API using the Google OAuth access token
that Firebase Auth issues when the user signs in with Google (popup flow).

HOW IT WORKS:
─────────────
  Frontend (React/TS):
    1. User clicks "Sign in with Google" → Firebase Auth popup
    2. Firebase Auth signs the user in and returns a credential that contains
       the Google OAuth access token (user.accessToken or via provider data)
    3. Frontend sends the access token to this backend as:
         Authorization: Bearer <google_access_token>

  Backend (here):
    1. Receives the access token from the request header
    2. Calls https://gmail.googleapis.com/gmail/v1/ directly via httpx
    3. Parses and returns RawEmail objects

  FALLBACK:
    If no token is provided OR the Gmail call fails, the module silently
    returns the dynamic mock corpus so the rest of the pipeline keeps working.

IMPORTANT — Gmail scope:
  The Firebase Google Sign-In on the frontend MUST request the Gmail readonly
  scope.  Example (using firebase/auth + googleAuthProvider):

      provider.addScope('https://www.googleapis.com/auth/gmail.readonly');

  Without this scope the API call will return 403 — the backend will log a
  clear error and fall through to mock data.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import re
from datetime import timedelta
from typing import Optional

import httpx

from config import GMAIL_MAX_RESULTS
from models.schemas import RawEmail
from utils.date_utils import today_utc

logger = logging.getLogger(__name__)

_GMAIL_BASE    = "https://gmail.googleapis.com/gmail/v1/users/me"
_GMAIL_QUERY   = (
    "subject:(placement OR drive OR aptitude OR exam OR internship "
    "OR assignment OR quiz OR deadline OR shortlist OR offer)"
)


# ─────────────────────────────────────────────────────────────────────────────
# Gmail REST helpers (pure httpx — no google-api-python-client)
# ─────────────────────────────────────────────────────────────────────────────

def _auth_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


async def _list_message_ids(client: httpx.AsyncClient, access_token: str) -> list[str]:
    """Return a list of message IDs matching the placement query."""
    resp = await client.get(
        f"{_GMAIL_BASE}/messages",
        headers=_auth_headers(access_token),
        params={"q": _GMAIL_QUERY, "maxResults": GMAIL_MAX_RESULTS},
        timeout=20.0,
    )
    if resp.status_code == 401:
        raise PermissionError("Google access token is invalid or expired (401).")
    if resp.status_code == 403:
        raise PermissionError(
            "Access token lacks the Gmail readonly scope. "
            "Add provider.addScope('https://www.googleapis.com/auth/gmail.readonly') "
            "to your Firebase Google Auth provider on the frontend."
        )
    resp.raise_for_status()
    return [m["id"] for m in resp.json().get("messages", [])]


def _decode_part(payload: dict) -> str:
    """Recursively extract plain-text from a Gmail message payload dict."""
    mime = payload.get("mimeType", "")
    data = payload.get("body", {}).get("data", "")

    if data:
        decoded = base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
        if "text/plain" in mime:
            return decoded
        if "text/html" in mime:
            # crude HTML → plain-text (strips tags)
            return re.sub(r"<[^>]+>", " ", decoded)

    parts = []
    for part in payload.get("parts", []):
        parts.append(_decode_part(part))
    return "\n".join(p for p in parts if p)


async def _fetch_message(
    client: httpx.AsyncClient,
    access_token: str,
    msg_id: str,
) -> Optional[RawEmail]:
    """Fetch one full message and parse it into a RawEmail."""
    try:
        resp = await client.get(
            f"{_GMAIL_BASE}/messages/{msg_id}",
            headers=_auth_headers(access_token),
            params={"format": "full"},
            timeout=20.0,
        )
        resp.raise_for_status()
        data = resp.json()

        headers_map = {
            h["name"]: h["value"]
            for h in data["payload"].get("headers", [])
        }
        return RawEmail(
            id=msg_id,
            subject=headers_map.get("Subject", "(no subject)"),
            sender=headers_map.get("From", "unknown"),
            received_at=headers_map.get("Date", ""),
            body=_decode_part(data["payload"]) or "(empty)",
        )
    except Exception as exc:
        logger.warning("Failed to fetch message %s: %s", msg_id, exc)
        return None


async def _fetch_real_emails(access_token: str) -> list[RawEmail]:
    """
    Fetch real emails from Gmail using the provided OAuth access token.
    All message fetches run concurrently inside a single shared httpx client.
    """
    async with httpx.AsyncClient() as client:
        msg_ids = await _list_message_ids(client, access_token)
        logger.info("Gmail returned %d message IDs.", len(msg_ids))

        tasks = [_fetch_message(client, access_token, mid) for mid in msg_ids]
        results = await asyncio.gather(*tasks)

    emails = [r for r in results if r is not None]
    logger.info("Successfully fetched %d emails from Gmail.", len(emails))
    return emails


# ─────────────────────────────────────────────────────────────────────────────
# Dynamic mock corpus (fallback — dates always relative to today)
# ─────────────────────────────────────────────────────────────────────────────

def _rel(offset: int) -> str:
    return (today_utc() + timedelta(days=offset)).isoformat()


def _build_mock_emails() -> list[RawEmail]:
    t = today_utc().isoformat()
    return [
        RawEmail(
            id="mock_001",
            subject="Amazon SDE Campus Drive – Register Now",
            sender="placements@college.edu",
            received_at=f"{t}T08:00:00Z",
            body=(
                f"Dear Student,\nAmazon is conducting an on-campus SDE placement drive "
                f"on {_rel(2)}. Online assessment + 3 interview rounds. "
                f"Registration deadline: {_rel(1)}.\nPlacement Cell"
            ),
        ),
        RawEmail(
            id="mock_002",
            subject="URGENT: TCS NQT – Aptitude Test Tomorrow",
            sender="noreply@tcs-careers.com",
            received_at=f"{t}T09:30:00Z",
            body=(
                f"Your TCS National Qualifier Test (NQT) is on {_rel(1)} at 10:00 AM. "
                f"Covers Quantitative Aptitude, Reasoning, and Coding. Duration: 3 hrs."
            ),
        ),
        RawEmail(
            id="mock_003",
            subject="End-Semester Exam Timetable Released",
            sender="exams@college.edu",
            received_at=f"{t}T07:00:00Z",
            body=(
                f"Data Structures & Algorithms – {_rel(5)} – 9:00 AM – 100 marks\n"
                f"Operating Systems – {_rel(7)} – 2:00 PM – 100 marks\n"
                f"Computer Networks – {_rel(9)} – 9:00 AM – 100 marks"
            ),
        ),
        RawEmail(
            id="mock_004",
            subject="Google STEP Internship – Application Deadline Reminder",
            sender="internships@google.com",
            received_at=f"{t}T06:00:00Z",
            body=(
                f"Google STEP Internship application deadline: {_rel(3)} at 11:59 PM PST. "
                f"Upload resume, transcripts, and cover letter."
            ),
        ),
        RawEmail(
            id="mock_005",
            subject="OS Lab Assignment – Due Soon",
            sender="os.lab@college.edu",
            received_at=f"{t}T10:00:00Z",
            body=(
                f"OS Lab Assignment on Process Scheduling is due {_rel(4)}. "
                f"Submit via LMS. Total marks: 20."
            ),
        ),
        RawEmail(
            id="mock_006",
            subject="Microsoft Internship Drive – Summer 2026",
            sender="placements@college.edu",
            received_at=f"{t}T11:00:00Z",
            body=(
                f"Microsoft internship drive on {_rel(6)}. SDE role, CGPA >= 7.5. "
                f"Register by {_rel(4)}."
            ),
        ),
        RawEmail(
            id="mock_007",
            subject="Weekly Quiz – Data Science – 15 Marks",
            sender="ds.course@college.edu",
            received_at=f"{t}T08:30:00Z",
            body=(
                f"ML Basics quiz on {_rel(1)} at 3:00 PM, Room 204. "
                f"15 marks. Topics: Linear Regression, Gradient Descent."
            ),
        ),
        RawEmail(
            id="mock_008",
            subject="Flipkart GRiD 6.0 – Registration Open",
            sender="grid@flipkart.com",
            received_at=f"{t}T10:30:00Z",
            body=(
                f"Flipkart GRiD 6.0 – Software Development Track. "
                f"Register before {_rel(5)}. Online round: {_rel(10)}. Teams of 2."
            ),
        ),
        RawEmail(
            id="mock_009",
            subject="Razorpay Off-Campus Drive – Apply Now",
            sender="careers@razorpay.com",
            received_at=f"{t}T09:00:00Z",
            body=(
                f"Razorpay is hiring 2026 grads for SWE roles. "
                f"Online assessment: {_rel(8)}. Deadline: {_rel(6)}."
            ),
        ),
        RawEmail(
            id="mock_010",
            subject="Internal Assessment – Computer Networks – 30 Marks",
            sender="cn.faculty@college.edu",
            received_at=f"{t}T07:45:00Z",
            body=(
                f"CN Internal Assessment (Unit 3 & 4) on {_rel(3)} at 11:00 AM. "
                f"30 marks. Syllabus: Network, Transport, and Application layers."
            ),
        ),
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Public async API
# ─────────────────────────────────────────────────────────────────────────────

async def fetch_emails(google_access_token: Optional[str] = None) -> list[RawEmail]:
    """
    Fetch emails.

    Args:
        google_access_token: The Google OAuth access token obtained from
            Firebase Auth on the frontend after Google Sign-In.
            If None or empty, falls back to the dynamic mock corpus.

    Returns:
        List of RawEmail objects ready for Groq extraction.
    """
    if google_access_token:
        try:
            return await _fetch_real_emails(google_access_token)
        except PermissionError as exc:
            # Scope / auth problem — log clearly, fall through to mock
            logger.error("Gmail auth error: %s", exc)
        except httpx.HTTPStatusError as exc:
            logger.error("Gmail API HTTP error %s — falling back to mock.", exc.response.status_code)
        except Exception as exc:
            logger.error("Gmail API unexpected error: %s — falling back to mock.", exc)

    logger.warning(
        "No valid Google access token provided — using MOCK email corpus. "
        "Pass the Firebase Auth Google access token as 'Authorization: Bearer <token>'."
    )
    await asyncio.sleep(0.02)   # simulate I/O latency
    return _build_mock_emails()
