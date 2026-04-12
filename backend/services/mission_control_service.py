"""
services/mission_control_service.py

Autonomous mission control background service.
Scans Gmail for application state changes and updates the Kanban board.
Aggregates performance metrics (study hours + mock interview scores).
"""
import asyncio
import logging
from typing import List, Optional
from datetime import datetime

from services import firebase_service, gmail_service, groq_service
from models.schemas import ApplicationStatus, PerformanceMetric, MissionControlSummary
from utils.date_utils import today_utc

logger = logging.getLogger(__name__)

# Search for application-related keywords to keep the scan focused
_APP_QUERY = (
    "subject:(Applied OR Assessment OR Interview OR Shortlisted OR "
    "Offer OR Rejected OR 'Job Application')"
)

async def sync_applications(user_id: str, google_access_token: Optional[str]) -> List[ApplicationStatus]:
    """
    Scans Gmail for application status updates and persists them to Firestore.
    """
    if not google_access_token:
        logger.warning("No Google access token — Mission Control sync skipped.")
        return []

    logger.info("Syncing applications for user=%s", user_id)
    
    # Fetch matching emails (limited to 10 for performance)
    emails = await gmail_service.fetch_emails(google_access_token, query=_APP_QUERY, max_results=10)
    
    # Fan out to Groq for status extraction
    async def _process_one(email):
        status_update = await groq_service.extract_application_status(email.subject, email.body)
        if status_update:
            app = {
                "id": status_update["company"].lower().replace(" ", "_"),
                "company": status_update["company"],
                "status": status_update["status"],
                "last_updated": datetime.now().isoformat(),
                "email_id": email.id
            }
            await firebase_service.save_application(user_id, app)
            return ApplicationStatus(**app)
        return None

    tasks = [_process_one(e) for e in emails]
    results = await asyncio.gather(*tasks)
    
    apps = [r for r in results if r is not None]
    logger.info("Mission Control: Synced %d application status updates.", len(apps))
    return apps

async def get_mission_control_summary(user_id: str) -> MissionControlSummary:
    """
    Aggregates Kanban data and Performance metrics for the Dashboard.
    """
    today_str = today_utc().isoformat()
    
    # Fetch Data
    apps_task = firebase_service.get_applications(user_id)
    history_task = firebase_service.get_performance_history(user_id, limit=7)
    
    # We also need current urgency (from Priority Engine data)
    # For MVP, we check the closest drive in the profile or cached plan.
    # Logic: if days_until <= 2 -> high urgency
    
    raw_apps, raw_history = await asyncio.gather(apps_task, history_task)
    
    # Process history to include study hours from study_logs
    # (firebase_service currently has separate collections)
    history: List[PerformanceMetric] = []
    for item in raw_history:
        date = item.get("date", "")
        # Try to get study hours for that specific date
        sh = await firebase_service.get_study_hours(user_id, date)
        history.append(PerformanceMetric(
            date=date,
            interview_score=item.get("interview_score"),
            study_hours=sh
        ))

    # Determine Urgency
    # Mocking high urgency if an interview is today
    has_interview_today = any(a.get("status") == "interview" for a in raw_apps)
    urgency = "high" if has_interview_today else "low"
    cta = "Start Final Mock Interview" if urgency == "high" else "Keep learning CS Fundamentals"

    return MissionControlSummary(
        user_id=user_id,
        applications=[ApplicationStatus(**a) for a in raw_apps],
        performance_history=history,
        urgency_level=urgency,
        action_cta=cta
    )
