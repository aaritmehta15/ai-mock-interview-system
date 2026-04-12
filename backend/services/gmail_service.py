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


async def _list_message_ids(
    client: httpx.AsyncClient,
    access_token: str,
    query: Optional[str] = None,
    max_results: Optional[int] = None,
) -> list[str]:
    """Return a list of message IDs matching the placement query."""
    target_query = query or _GMAIL_QUERY
    target_max = max_results or GMAIL_MAX_RESULTS

    resp = await client.get(
        f"{_GMAIL_BASE}/messages",
        headers=_auth_headers(access_token),
        params={"q": target_query, "maxResults": target_max},
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


async def _fetch_real_emails(
    access_token: str,
    query: Optional[str] = None,
    max_results: Optional[int] = None,
) -> list[RawEmail]:
    """
    Fetch real emails from Gmail using the provided OAuth access token.
    All message fetches run concurrently inside a single shared httpx client.
    """
    async with httpx.AsyncClient() as client:
        msg_ids = await _list_message_ids(client, access_token, query=query, max_results=max_results)
        logger.info("Gmail returned %d message IDs.", len(msg_ids))

        tasks = [_fetch_message(client, access_token, mid) for mid in msg_ids]
        results = await asyncio.gather(*tasks)

    emails = [r for r in results if r is not None]
    logger.info("Successfully fetched %d emails from Gmail.", len(emails))
    return emails


async def fetch_emails(
    google_access_token: Optional[str],
    query: Optional[str] = None,
    max_results: Optional[int] = None,
) -> list[RawEmail]:
    """
    Public entry point to fetch emails from Gmail.
    If google_access_token is missing, returns an empty list.
    """
    if not google_access_token:
        logger.info("No valid Google access token provided — returning EMPTY email list.")
        return []

    try:
        return await _fetch_real_emails(google_access_token, query=query, max_results=max_results)
    except PermissionError:
        raise
    except Exception as e:
        logger.error("Error fetching emails: %s", e)
        return []

