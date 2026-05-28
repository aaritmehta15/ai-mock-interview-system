import os
from dotenv import load_dotenv

load_dotenv(override=True)   # override=True: re-reads .env even if vars already exist in os.environ

# ── Groq ─────────────────────────────────────────────────────────────────────
GROQ_API_KEY: str           = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL: str             = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_CLASSIFY_MODEL: str    = os.getenv("GROQ_CLASSIFY_MODEL", "llama-3.1-8b-instant")

# ── Firebase ──────────────────────────────────────────────────────────────────
# Path to the service-account credentials JSON downloaded from Firebase console.
# If not present, Firestore falls back to an in-memory store automatically.
FIREBASE_CREDENTIALS_FILE: str = os.getenv("FIREBASE_CREDENTIALS_FILE", "firebase_credentials.json")
FIREBASE_PROJECT_ID: str       = os.getenv("FIREBASE_PROJECT_ID", "")

# ── App settings ──────────────────────────────────────────────────────────────
APP_ENV: str   = os.getenv("APP_ENV", "development")
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
