"""
_test_module4.py — Integration test for Module 4 (Resume-Based Auto Apply System)

Tests:
  1. PDF text extraction (PyMuPDF / pdfplumber)
  2. Resume text sanitisation
  3. Groq resume parsing → structured profile
  4. Deterministic link generation (Internshala / LinkedIn / Unstop)
  5. Groq AI apply-link generation (live HTTP call)
  6. Full apply_service.generate_apply_links() pipeline
  7. Firebase profile save + retrieve (in-memory fallback)

Run from the backend/ directory:
    python _test_module4.py
"""
from __future__ import annotations

import asyncio
import io
import json
import os
import sys

# Force UTF-8 output on Windows so Unicode characters don't crash cp1252
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# -- Make sure backend/ is on the path ----------------------------------------
sys.path.insert(0, os.path.dirname(__file__))

# -- Load .env before importing anything else ---------------------------------
from dotenv import load_dotenv
load_dotenv(override=True)

# ─────────────────────────────────────────────────────────────────────────────
# ANSI colours
# ─────────────────────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def ok(msg: str):   print(f"  {GREEN}[PASS]  {msg}{RESET}")
def fail(msg: str): print(f"  {RED}[FAIL]  {msg}{RESET}")
def warn(msg: str): print(f"  {YELLOW}[WARN]  {msg}{RESET}")
def hdr(msg: str):  print(f"\n{BOLD}{CYAN}{'-'*60}\n  {msg}\n{'-'*60}{RESET}")
def info(msg: str): print(f"     {msg}")

PASS = 0
FAIL = 0

def check(condition: bool, label: str, detail: str = ""):
    global PASS, FAIL
    if condition:
        PASS += 1
        ok(label)
    else:
        FAIL += 1
        fail(label)
    if detail:
        info(detail)


# ─────────────────────────────────────────────────────────────────────────────
# Synthetic resume fixture
# ─────────────────────────────────────────────────────────────────────────────

SAMPLE_RESUME_TEXT = """
Devanshu Sharma
devanshu@example.com | +91 99999 00000 | LinkedIn: linkedin.com/in/devanshu

SKILLS
Python, Machine Learning, Deep Learning, TensorFlow, PyTorch, React, Node.js,
FastAPI, SQL, MongoDB, Docker, AWS, Git

PROJECTS
1. AI Resume Screener
   Tech: Python, Groq API, FastAPI, Firebase
   Built a resume parsing system that extracts structured profiles using LLMs.

2. Placement Priority Engine
   Tech: Python, Firebase, Gmail API
   Automated email parsing and event prioritisation for campus placements.

EXPERIENCE
ML Intern — XYZ Corp (June 2024 – Aug 2024)
  - Trained image classification models with 94% accuracy.
  - Deployed model as a REST API using FastAPI + Docker.

EDUCATION
B.Tech Computer Engineering — XYZ University (2021–2025)
CGPA: 8.7/10
"""


# ─────────────────────────────────────────────────────────────────────────────
# Test 1 — Text sanitisation
# ─────────────────────────────────────────────────────────────────────────────

def test_sanitisation():
    hdr("TEST 1 — Resume text sanitisation")
    from services.resume_service import sanitize_resume_text

    sanitised = sanitize_resume_text(SAMPLE_RESUME_TEXT)

    check("[EMAIL]" in sanitised,
          "Email address replaced with [EMAIL]",
          f"Contains: {sanitised[:100]}...")

    check("[PHONE]" in sanitised,
          "Phone number replaced with [PHONE]")

    check(len(sanitised) > 0,
          "Sanitised text is non-empty",
          f"Length: {len(sanitised)} chars")

    # Truncation test — pass a 15 000-char string
    huge = "A" * 15_000
    truncated = sanitize_resume_text(huge)
    check(len(truncated) <= 12_000,
          "Oversized text truncated to ≤ 12 000 chars",
          f"Truncated length: {len(truncated)}")


# ─────────────────────────────────────────────────────────────────────────────
# Test 2 — PDF extraction (create a real minimal PDF in memory)
# ─────────────────────────────────────────────────────────────────────────────

def test_pdf_extraction():
    hdr("TEST 2 — PDF text extraction")
    try:
        import fitz  # type: ignore

        # Build a tiny valid PDF in-memory with fitz
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), "Hello from PyMuPDF test PDF!")
        pdf_bytes = doc.tobytes()
        doc.close()

        from services.resume_service import extract_text_from_pdf
        extracted = extract_text_from_pdf(pdf_bytes)

        check("Hello from PyMuPDF" in extracted,
              "PyMuPDF extracted text from in-memory PDF",
              f"Extracted: {extracted.strip()[:80]}")
    except ImportError:
        warn("PyMuPDF (fitz) not installed — skipping PDF extraction test.")


# ─────────────────────────────────────────────────────────────────────────────
# Test 3 — Deterministic link builders
# ─────────────────────────────────────────────────────────────────────────────

def test_deterministic_links():
    hdr("TEST 3 — Deterministic link generation")
    from services.apply_service import (
        _internshala_links_from_skills,
        _linkedin_links_from_profile,
        _unstop_link,
    )

    # ── Internshala ──────────────────────────────────────────────────────────
    skills = ["machine learning", "react", "python", "aws"]
    i_links = _internshala_links_from_skills(skills)

    check(len(i_links) > 0,
          "Internshala: at least 1 link generated",
          f"Got {len(i_links)} link(s)")

    for lnk in i_links:
        check("internshala.com" in lnk["url"].lower(),
              f"Internshala URL valid → {lnk['url']}",
              f"  Role: {lnk['role']}")

    # Test unknown skill → generic fallback
    generic = _internshala_links_from_skills(["cobol", "fortran"])
    check(generic[0]["url"].endswith("internships/"),
          "Internshala: generic fallback URL for unrecognised skills",
          f"URL: {generic[0]['url']}")

    # ── LinkedIn ─────────────────────────────────────────────────────────────
    roles = ["Machine Learning Engineer", "Backend Developer"]
    l_links = _linkedin_links_from_profile(roles, skills)

    check(len(l_links) > 0,
          "LinkedIn: at least 1 link generated",
          f"Got {len(l_links)} link(s)")

    for lnk in l_links:
        check("linkedin.com/jobs/search" in lnk["url"],
              f"LinkedIn URL valid → {lnk['url'][:80]}")
        check("f_JT=I" in lnk["url"],
              "LinkedIn URL contains Internship filter (f_JT=I)")

    # Test URL encoding of multi-word roles
    encoded_links = _linkedin_links_from_profile(["Data Science Intern"], [])
    check("Data+Science+Intern" in encoded_links[0]["url"] or
          "Data%20Science%20Intern" in encoded_links[0]["url"],
          "LinkedIn URL properly encodes multi-word role",
          f"URL: {encoded_links[0]['url']}")

    # ── Unstop ───────────────────────────────────────────────────────────────
    u = _unstop_link()
    check(u["url"] == "https://unstop.com/jobs",
          "Unstop URL is correct",
          f"URL: {u['url']}")
    check(u["company"] == "Unstop",
          "Unstop company name correct")


# ─────────────────────────────────────────────────────────────────────────────
# Test 4 — Groq resume parsing (live API call)
# ─────────────────────────────────────────────────────────────────────────────

async def test_groq_resume_parse():
    hdr("TEST 4 — Groq resume parsing (live API call)")

    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        warn("GROQ_API_KEY not set — skipping live Groq test.")
        return

    from services.resume_service import sanitize_resume_text, parse_resume_with_groq

    clean = sanitize_resume_text(SAMPLE_RESUME_TEXT)
    profile = await parse_resume_with_groq(clean)

    check(profile is not None,
          "Groq returned a non-null profile",
          f"Raw keys: {list(profile.keys()) if profile else '—'}")

    if profile:
        check("skills" in profile and isinstance(profile["skills"], list),
              "Profile contains 'skills' list",
              f"Skills: {profile['skills'][:5]}")

        check("projects" in profile and isinstance(profile["projects"], list),
              "Profile contains 'projects' list",
              f"Projects: {[p.get('name','?') for p in profile['projects']]}")

        check("preferredRoles" in profile,
              "Profile contains 'preferredRoles'",
              f"Roles: {profile.get('preferredRoles', [])}")

        check("targetCompanies" in profile,
              "Profile contains 'targetCompanies'",
              f"Companies: {profile.get('targetCompanies', [])}")

        print()
        info("── Parsed Profile ──────────────────────────────────────")
        info(json.dumps(profile, indent=2))


# ─────────────────────────────────────────────────────────────────────────────
# Test 5 — Groq AI apply-link generation (live API call)
# ─────────────────────────────────────────────────────────────────────────────

async def test_groq_apply_links():
    hdr("TEST 5 — Groq AI apply-link generation (live API call)")

    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        warn("GROQ_API_KEY not set — skipping live Groq test.")
        return

    from services.apply_service import _generate_ai_links

    mock_profile = {
        "skills": ["Python", "Machine Learning", "React", "FastAPI", "AWS"],
        "preferredRoles": ["Machine Learning Engineer", "Backend Developer"],
        "targetCompanies": ["Google", "Razorpay"],
        "experience": ["ML Intern — XYZ Corp (June–Aug 2024)"],
    }

    links = await _generate_ai_links(mock_profile)

    check(isinstance(links, list),
          "Groq AI apply links returned as list",
          f"Count: {len(links)}")

    check(len(links) >= 1,
          "At least 1 AI-generated apply link returned")

    required_keys = {"company", "role", "url", "whyFit", "difficulty"}
    for i, lnk in enumerate(links, 1):
        missing = required_keys - set(lnk.keys())
        check(not missing,
              f"Link #{i} ({lnk.get('company','?')}) has all required fields",
              f"URL: {lnk.get('url','—')}")

    if links:
        print()
        info("── AI-Generated Apply Links ────────────────────────────")
        for lnk in links:
            info(f"  [{lnk.get('difficulty','?')}] {lnk.get('company','?')} — {lnk.get('role','?')}")
            info(f"    URL : {lnk.get('url','—')}")
            info(f"    Why : {lnk.get('whyFit','—')}")
            info("")


# ─────────────────────────────────────────────────────────────────────────────
# Test 6 — Full pipeline: generate_apply_links()
# ─────────────────────────────────────────────────────────────────────────────

async def test_full_pipeline():
    hdr("TEST 6 — Full generate_apply_links() pipeline")

    from services.apply_service import generate_apply_links

    mock_profile = {
        "skills": ["Python", "deep learning", "react", "docker"],
        "preferredRoles": ["Data Scientist", "Full Stack Developer"],
        "targetCompanies": [],
        "experience": [],
    }

    all_links = await generate_apply_links(mock_profile)

    check(isinstance(all_links, list),
          "generate_apply_links returned a list")

    check(len(all_links) >= 4,
          f"At least 4 links total (got {len(all_links)})",
          "Expected: ≥1 Groq AI + ≥1 Internshala + ≥1 LinkedIn + 1 Unstop")

    sources = {lnk.get("company", "").lower() for lnk in all_links}
    check("internshala" in sources,
          "Internshala link present in combined output")
    check("linkedin" in sources,
          "LinkedIn link present in combined output")
    check("unstop" in sources,
          "Unstop link present in combined output")

    print()
    info("── All Links (Company → URL) ────────────────────────────")
    for lnk in all_links:
        info(f"  {lnk.get('company','?'):20s}  {lnk.get('url','—')[:70]}")


# ─────────────────────────────────────────────────────────────────────────────
# Test 7 — Firebase in-memory save + retrieve
# ─────────────────────────────────────────────────────────────────────────────

async def test_firebase_in_memory():
    hdr("TEST 7 — Firebase profile save + retrieve (in-memory fallback)")

    from services.resume_service import save_resume_profile, get_resume_profile

    test_user = "test_user_module4_999"
    test_profile = {
        "name": "Test User",
        "skills": ["Python", "React"],
        "projects": [],
        "experience": [],
        "preferredRoles": ["Software Engineer"],
        "targetCompanies": ["Google"],
    }

    await save_resume_profile(test_user, test_profile)
    ok("save_resume_profile() called without exception")

    retrieved = await get_resume_profile(test_user)
    check(retrieved is not None,
          "get_resume_profile() returned the saved profile")
    check(retrieved.get("name") == "Test User",
          "Profile data round-trips correctly",
          f"name={retrieved.get('name')}, skills={retrieved.get('skills')}")


# ─────────────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────────────

async def main():
    print(f"\n{BOLD}{'='*60}")
    print("  MODULE 4 — Integration Test Suite")
    print(f"{'='*60}{RESET}")

    # Synchronous tests
    test_sanitisation()
    test_pdf_extraction()
    test_deterministic_links()

    # Async tests (live Groq + Firebase)
    await test_groq_resume_parse()
    await test_groq_apply_links()
    await test_full_pipeline()
    await test_firebase_in_memory()

    # ── Summary ──────────────────────────────────────────────────────────────
    total = PASS + FAIL
    print(f"\n{BOLD}{'='*60}")
    print(f"  Results: {GREEN}{PASS} passed{RESET}{BOLD}  /  {RED}{FAIL} failed{RESET}{BOLD}  /  {total} total")
    print(f"{'='*60}{RESET}\n")

    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())
