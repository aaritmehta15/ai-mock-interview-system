import os
from dotenv import load_dotenv

load_dotenv(override=True)   # override=True: re-reads .env even if vars already exist in os.environ

# ── Groq ─────────────────────────────────────────────────────────────────────
GROQ_API_KEY: str           = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL: str             = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_CLASSIFY_MODEL: str    = os.getenv("GROQ_CLASSIFY_MODEL", "llama-3.1-8b-instant")

# ── Gmail REST API ────────────────────────────────────────────────────────────
# The Google OAuth access token comes from the frontend (Firebase Auth popup).
# No credentials.json or token.json needed on the backend.
GMAIL_MAX_RESULTS: int = int(os.getenv("GMAIL_MAX_RESULTS", "20"))

# ── Firebase ──────────────────────────────────────────────────────────────────
# Path to the service-account credentials JSON downloaded from Firebase console.
# If not present, Firestore falls back to an in-memory store automatically.
FIREBASE_CREDENTIALS_FILE: str = os.getenv("FIREBASE_CREDENTIALS_FILE", "firebase_credentials.json")
FIREBASE_PROJECT_ID: str       = os.getenv("FIREBASE_PROJECT_ID", "")

# ── App settings ──────────────────────────────────────────────────────────────
APP_ENV: str   = os.getenv("APP_ENV", "development")
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

# ── Priority Engine ───────────────────────────────────────────────────────────
EVENT_WEIGHTS: dict[str, int] = {
    "placement_drive":     10,
    "aptitude_test":        8,
    "college_exam":         6,
    "internship_deadline":  5,
    "college_quiz":         3,
    "assignment":           2,
}

# Company-tier bonus — applied ONLY for placement_drive events
TIER_BONUS: dict[str, float] = {
    "Tier1":   3.0,
    "Tier2":   2.0,
    "Tier3":   1.0,
    "Unknown": 0.0,
}

# Bonus when company name matches the student's targetCompanies list
STUDENT_TARGET_MATCH_BONUS: float = 2.0
