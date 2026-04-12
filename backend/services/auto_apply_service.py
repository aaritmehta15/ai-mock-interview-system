"""
services/auto_apply_service.py  —  Module 4-B: Resume-Based Auto Apply Engine
(ported from backend_4: matchingService.js, opportunityService.js,
 fallbackParser.js, aiService.js / parseService.js)

Flow:
  POST /auto-apply/upload          → extract text, create session
  POST /auto-apply/parse           → parse profile via Groq AI (or fallback)
  POST /auto-apply/opportunities   → match roles + generate opportunities
  GET  /auto-apply/results/{id}    → fetch cached session results
  POST /auto-apply/process-all     → one-shot: upload + parse + opportunities

All logic is self-contained here; main.py only handles HTTP plumbing.
Uses the existing groq_service helpers — no new API keys needed.
"""
from __future__ import annotations

import io
import json
import logging
import re
import uuid
from typing import Optional
from urllib.parse import quote

from services.groq_service import _call_groq, extract_json

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# In-memory session store  (mirrors backend_4's sessions Map)
# ─────────────────────────────────────────────────────────────────────────────

_sessions: dict[str, dict] = {}


def create_session() -> str:
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {}
    return session_id


def get_session(session_id: str) -> Optional[dict]:
    return _sessions.get(session_id)


def set_session(session_id: str, data: dict) -> None:
    _sessions[session_id] = data


# ─────────────────────────────────────────────────────────────────────────────
# Text extraction  (mirrors parseService.js)
# ─────────────────────────────────────────────────────────────────────────────

def _clean_text(text: str) -> str:
    """Mirrors parseService.cleanText()"""
    text = text.replace("\r\n", "\n")
    text = re.sub(r"\t", " ", text)
    text = re.sub(r" +", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """PyMuPDF → pdfplumber fallback (mirrors extractFromPDF)."""
    text: Optional[str] = None
    try:
        import fitz  # type: ignore
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages = [page.get_text() for page in doc]
        doc.close()
        text = _clean_text("\n".join(pages))
    except ImportError:
        logger.debug("PyMuPDF not installed, trying pdfplumber.")
    except Exception as exc:
        logger.warning("PyMuPDF failed: %s", exc)

    if not text:
        try:
            import pdfplumber  # type: ignore
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                pages = [p.extract_text() or "" for p in pdf.pages]
            text = _clean_text("\n".join(pages))
        except ImportError:
            logger.debug("pdfplumber not installed.")
        except Exception as exc:
            logger.warning("pdfplumber failed: %s", exc)

    if not text or len(text) < 50:
        raise ValueError("PDF appears to contain very little text. It may be image-based.")
    return text


def extract_text_from_docx(docx_bytes: bytes) -> str:
    """python-docx extractor (mirrors extractFromDOCX via mammoth)."""
    try:
        import docx  # type: ignore
        doc = docx.Document(io.BytesIO(docx_bytes))
        paragraphs = [p.text for p in doc.paragraphs]
        text = _clean_text("\n".join(paragraphs))
        if not text or len(text) < 50:
            raise ValueError("DOCX appears to contain very little text.")
        return text
    except ImportError:
        raise ValueError(
            "python-docx not installed. Run: pip install python-docx"
        )
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Failed to parse DOCX: {exc}") from exc


def extract_text(file_bytes: bytes, mime_type: str, filename: str) -> str:
    """Route to correct extractor based on mime/extension (mirrors extractText)."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if mime_type == "application/pdf" or ext == "pdf":
        return extract_text_from_pdf(file_bytes)
    if (
        mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or ext == "docx"
    ):
        return extract_text_from_docx(file_bytes)
    if mime_type == "text/plain" or ext == "txt":
        text = _clean_text(file_bytes.decode("utf-8", errors="replace"))
        if len(text) < 50:
            raise ValueError("Text file appears to contain very little content.")
        return text
    raise ValueError(f"Unsupported file type: {ext}. Upload PDF, DOCX, or TXT.")


# ─────────────────────────────────────────────────────────────────────────────
# Fallback parser  (mirrors fallbackParser.js — pure regex, no AI)
# ─────────────────────────────────────────────────────────────────────────────

SKILL_DATABASE = {
    "technical": [
        "python", "java", "javascript", "typescript", "c++", "c#", "c", "go", "golang",
        "rust", "ruby", "php", "swift", "kotlin", "dart", "scala", "r", "matlab",
        "perl", "shell", "bash", "powershell", "sql", "nosql", "html", "css",
        "data structures", "algorithms", "oop", "design patterns", "system design",
        "machine learning", "deep learning", "nlp", "computer vision", "ai",
        "data science", "data analysis", "statistics", "blockchain", "solidity",
    ],
    "tools": [
        "git", "github", "gitlab", "bitbucket", "docker", "kubernetes",
        "jenkins", "travis ci", "circleci", "terraform", "ansible", "nginx",
        "apache", "postman", "figma", "jira", "confluence", "jupyter", "colab",
        "tableau", "power bi", "excel", "grafana", "prometheus", "datadog",
        "vercel", "netlify", "heroku", "aws", "azure", "gcp", "firebase",
    ],
    "languages": [
        "python", "java", "javascript", "typescript", "c++", "c#", "go", "rust",
        "ruby", "php", "swift", "kotlin", "dart", "scala", "r", "sql",
    ],
    "frameworks": [
        "react", "angular", "vue", "svelte", "next.js", "nextjs", "nuxt",
        "node.js", "nodejs", "express", "fastapi", "django", "flask", "spring",
        "spring boot", ".net", "asp.net", "laravel", "rails",
        "tensorflow", "pytorch", "keras", "scikit-learn", "pandas", "numpy",
        "react native", "flutter", "electron", "tailwind", "bootstrap",
        "material ui", "chakra ui", "mongodb", "postgresql", "mysql", "redis",
        "graphql", "rest", "grpc", "kafka", "rabbitmq", "opencv",
        "langchain", "huggingface", "transformers",
    ],
}


def _escape_regex(s: str) -> str:
    return re.escape(s)


def _capitalize(s: str) -> str:
    return " ".join(w.capitalize() for w in s.split())


def _extract_skills_fallback(text_lower: str) -> dict:
    found = {k: [] for k in SKILL_DATABASE}
    for category, skills in SKILL_DATABASE.items():
        for skill in skills:
            pattern = rf"\b{_escape_regex(skill)}\b"
            if re.search(pattern, text_lower, re.IGNORECASE):
                cap = _capitalize(skill)
                if cap not in found[category]:
                    found[category].append(cap)
    # Remove frameworks already in technical
    all_fw = [f.lower() for f in found["frameworks"]]
    found["technical"] = [s for s in found["technical"] if s.lower() not in all_fw]
    return found


def _extract_tech_from_text(text: str) -> list[str]:
    all_tech = SKILL_DATABASE["frameworks"] + SKILL_DATABASE["tools"]
    found = []
    for tech in all_tech:
        if re.search(rf"\b{_escape_regex(tech)}\b", text, re.IGNORECASE):
            cap = _capitalize(tech)
            if cap not in found:
                found.append(cap)
    return found


def _generate_summary_fallback(text: str) -> str:
    skills = _extract_skills_fallback(text.lower())
    all_skills = (skills["technical"] + skills["frameworks"])[:5]
    if not all_skills:
        return "Candidate with diverse technical background."
    return f"Candidate with experience in {', '.join(all_skills)}."


def parse_resume_fallback(text: str) -> dict:
    """Pure-regex resume parser (mirrors fallbackParser.parseResume)."""
    text_lower = text.lower()
    skills = _extract_skills_fallback(text_lower)

    # Minimal project extraction
    proj_patterns = re.findall(
        r"(?:project|built|developed|created|designed)[\s:]+([^\n]+)", text, re.IGNORECASE
    )
    projects = []
    for match in proj_patterns[:4]:
        title = re.sub(r"^(?:project|built|developed|created|designed)[\s:]+", "", match, flags=re.IGNORECASE).strip()[:80]
        if len(title) > 3:
            projects.append({
                "title": title,
                "description": "",
                "techStack": _extract_tech_from_text(match),
                "highlights": [],
            })

    # Minimal experience extraction
    experience = []
    role_pattern = re.compile(
        r"(?:intern|engineer|developer|analyst|designer|associate|assistant|lead|manager)",
        re.IGNORECASE,
    )
    for line in text.splitlines():
        stripped = line.strip()
        if role_pattern.search(stripped) and 5 < len(stripped) < 120:
            experience.append({
                "role": stripped[:80],
                "company": "",
                "duration": "",
                "highlights": [],
            })
            if len(experience) >= 5:
                break

    # Minimal education extraction
    degree_pattern = re.compile(
        r"(?:bachelor|b\.?(?:tech|s|sc|e|eng)|master|m\.?(?:tech|s|sc|e|eng)|ph\.?d|b\.?tech|b\.?e|bca|mca|mba|bba)",
        re.IGNORECASE,
    )
    education = []
    for line in text.splitlines():
        if degree_pattern.search(line):
            education.append({
                "degree": line.strip()[:100],
                "institution": "",
                "year": "",
                "gpa": "",
            })
            if len(education) >= 3:
                break

    return {
        "skills": skills,
        "projects": projects,
        "experience": experience,
        "education": education,
        "summary": _generate_summary_fallback(text),
    }


# ─────────────────────────────────────────────────────────────────────────────
# AI parser via Groq  (mirrors aiService.parseResumeWithAI / generateFitExplanations)
# ─────────────────────────────────────────────────────────────────────────────

GROQ_RESUME_MODEL = "llama-3.3-70b-versatile"
MAX_RESUME_CHARS = 12_000


def _validate_parsed_profile(data: dict) -> dict:
    """Mirrors aiService.validateParsedData()."""
    return {
        "skills": {
            "technical":  (data.get("skills") or {}).get("technical", []),
            "tools":      (data.get("skills") or {}).get("tools", []),
            "languages":  (data.get("skills") or {}).get("languages", []),
            "frameworks": (data.get("skills") or {}).get("frameworks", []),
        },
        "projects": [
            {
                "title":       p.get("title", "Untitled Project"),
                "description": p.get("description", ""),
                "techStack":   p.get("techStack", []),
                "highlights":  p.get("highlights", []),
            }
            for p in (data.get("projects") or [])
        ],
        "experience": [
            {
                "role":       e.get("role", "Unknown Role"),
                "company":    e.get("company", ""),
                "duration":   e.get("duration", ""),
                "highlights": e.get("highlights", []),
            }
            for e in (data.get("experience") or [])
        ],
        "education": [
            {
                "degree":      e.get("degree", ""),
                "institution": e.get("institution", ""),
                "year":        e.get("year", ""),
                "gpa":         e.get("gpa", ""),
            }
            for e in (data.get("education") or [])
        ],
        "summary": data.get("summary", ""),
    }


async def parse_resume_with_ai(resume_text: str) -> dict:
    """
    Mirrors aiService.parseResumeWithAI().
    Uses Groq (same key already in .env) instead of OpenAI.
    Falls back to regex parser if Groq call fails.
    """
    truncated = resume_text[:MAX_RESUME_CHARS]

    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert resume parser. Extract structured information from the "
                "resume text provided. Return a JSON object with EXACTLY this structure:\n\n"
                "{\n"
                '  "skills": {\n'
                '    "technical": ["skill1", "skill2"],\n'
                '    "tools": ["tool1", "tool2"],\n'
                '    "languages": ["lang1", "lang2"],\n'
                '    "frameworks": ["framework1", "framework2"]\n'
                "  },\n"
                '  "projects": [\n'
                '    {"title": "Project Name", "description": "Brief description",\n'
                '     "techStack": ["tech1", "tech2"], "highlights": ["key achievement"]}\n'
                "  ],\n"
                '  "experience": [\n'
                '    {"role": "Job Title", "company": "Company Name",\n'
                '     "duration": "Start - End", "highlights": ["key responsibility"]}\n'
                "  ],\n"
                '  "education": [\n'
                '    {"degree": "Degree Name", "institution": "University",\n'
                '     "year": "Graduation Year", "gpa": "GPA if mentioned"}\n'
                "  ],\n"
                '  "summary": "A 2-3 sentence professional summary of the candidate"\n'
                "}\n\n"
                "Rules:\n"
                "- Extract ALL skills mentioned, categorize them properly\n"
                "- For projects, identify the tech stack used\n"
                "- If information is missing, use empty arrays\n"
                "- Be thorough — don't miss any skills or experiences\n"
                "- Normalize skill names (e.g., 'JS' → 'JavaScript')\n"
                "- Return ONLY the JSON object. No markdown, no prose."
            ),
        },
        {
            "role": "user",
            "content": f"Parse this resume:\n\n{truncated}",
        },
    ]

    raw = await _call_groq(messages, model=GROQ_RESUME_MODEL, temperature=0.1, max_tokens=2048)
    if not raw:
        logger.warning("Groq returned nothing — using fallback parser.")
        return parse_resume_fallback(resume_text)

    parsed = extract_json(raw)
    if not isinstance(parsed, dict):
        logger.warning("AI parsing returned non-dict — using fallback parser.")
        return parse_resume_fallback(resume_text)

    return _validate_parsed_profile(parsed)


def _get_all_skills_str(profile: dict) -> str:
    """Mirrors aiService.getAllSkills()."""
    skills = profile.get("skills", {})
    if isinstance(skills, list):
        return ", ".join(skills)
    all_skills = (
        skills.get("technical", [])
        + skills.get("tools", [])
        + skills.get("languages", [])
        + skills.get("frameworks", [])
    )
    return ", ".join(all_skills)


def _simple_fit_explanation(profile: dict, opportunity: dict) -> str:
    """Mirrors aiService.generateSimpleExplanation()."""
    skills_str = _get_all_skills_str(profile).lower()
    relevant = [
        s for s in (opportunity.get("requiredSkills") or [])
        if s.lower() in skills_str
    ]
    if relevant:
        proj_note = (
            " Your project experience demonstrates practical application of these technologies."
            if profile.get("projects") else ""
        )
        return f"This role aligns with your skills in {', '.join(relevant[:3])}.{proj_note}"
    return (
        f"This {opportunity.get('category', '')} role matches your background "
        "and could be a great opportunity to grow your career."
    )


async def generate_fit_explanations(profile: dict, opportunities: list[dict]) -> list[dict]:
    """
    Mirrors aiService.generateFitExplanations().
    Generates personalized why_fit blurbs for each opportunity via Groq.
    Falls back to rule-based if Groq fails.
    """
    skills_str = _get_all_skills_str(profile)
    projects_str = ", ".join(p.get("title", "") for p in (profile.get("projects") or []))
    experience_str = ", ".join(
        f"{e.get('role','')} at {e.get('company','')}"
        for e in (profile.get("experience") or [])
    )

    opp_list = "\n".join(
        f"{i}. {o.get('title','')} at {o.get('company','')} ({o.get('category','')})"
        for i, o in enumerate(opportunities)
    )

    messages = [
        {
            "role": "system",
            "content": (
                "You are a career advisor. For each job opportunity, generate a personalized "
                "1-2 sentence explanation of why the candidate is a good fit, based on their profile.\n\n"
                "Return JSON with this structure:\n"
                '{"explanations": [{"index": 0, "why_fit": "This role matches..."}]}\n\n'
                "Be specific — reference actual skills, projects, or experiences. Be encouraging but honest."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Candidate Profile:\n"
                f"Skills: {skills_str}\n"
                f"Projects: {projects_str}\n"
                f"Experience: {experience_str}\n\n"
                f"Opportunities:\n{opp_list}\n\n"
                'Generate a "why_fit" explanation for each opportunity.'
            ),
        },
    ]

    raw = await _call_groq(messages, model=GROQ_RESUME_MODEL, temperature=0.7, max_tokens=1500)
    if raw:
        result = extract_json(raw)
        if isinstance(result, dict):
            explanation_map: dict[int, str] = {
                e["index"]: e["why_fit"]
                for e in (result.get("explanations") or [])
                if isinstance(e, dict)
            }
            return [
                {**opp, "why_fit": explanation_map.get(i, _simple_fit_explanation(profile, opp))}
                for i, opp in enumerate(opportunities)
            ]

    logger.warning("Groq fit explanations failed — using simple fallback.")
    return [{**opp, "why_fit": _simple_fit_explanation(profile, opp)} for opp in opportunities]


# ─────────────────────────────────────────────────────────────────────────────
# Role matching  (mirrors matchingService.js — exact same ROLE_CATEGORIES)
# ─────────────────────────────────────────────────────────────────────────────

ROLE_CATEGORIES: dict[str, dict] = {
    "Software Engineering": {
        "keywords": [
            "java", "c++", "c#", "golang", "go", "rust", "data structures", "algorithms", "dsa",
            "system design", "oop", "software engineering", "backend", "api", "microservices",
            "distributed systems", "leetcode", "competitive programming",
        ],
        "weight": 1.0,
    },
    "Frontend Development": {
        "keywords": [
            "react", "angular", "vue", "svelte", "next.js", "nextjs", "html", "css", "javascript",
            "typescript", "tailwind", "sass", "webpack", "vite", "frontend", "front-end",
            "ui", "ux", "responsive design", "web development",
        ],
        "weight": 1.0,
    },
    "Full Stack Development": {
        "keywords": [
            "full stack", "fullstack", "mern", "mean", "node.js", "nodejs", "express",
            "django", "flask", "spring boot", "rest api", "graphql", "mongodb", "postgresql",
            "mysql", "redis", "docker", "full-stack",
        ],
        "weight": 1.2,
    },
    "Machine Learning": {
        "keywords": [
            "machine learning", "ml", "deep learning", "neural network", "tensorflow",
            "pytorch", "keras", "scikit-learn", "sklearn", "nlp", "natural language processing",
            "computer vision", "cv", "transformers", "bert", "gpt", "llm", "ai",
            "artificial intelligence", "reinforcement learning", "model training",
        ],
        "weight": 1.1,
    },
    "Data Science": {
        "keywords": [
            "data science", "data analysis", "pandas", "numpy", "matplotlib", "seaborn",
            "jupyter", "statistics", "data visualization", "tableau", "power bi", "sql",
            "big data", "spark", "hadoop", "etl", "data pipeline", "analytics",
            "r programming", "data mining",
        ],
        "weight": 1.0,
    },
    "DevOps & Cloud": {
        "keywords": [
            "devops", "aws", "azure", "gcp", "google cloud", "kubernetes", "k8s",
            "docker", "ci/cd", "jenkins", "terraform", "ansible", "linux", "bash",
            "cloud", "infrastructure", "nginx", "monitoring", "grafana", "prometheus",
        ],
        "weight": 0.9,
    },
    "Mobile Development": {
        "keywords": [
            "android", "ios", "swift", "kotlin", "react native", "flutter", "dart",
            "mobile", "app development", "xcode", "android studio", "firebase",
            "mobile app", "cross-platform",
        ],
        "weight": 0.9,
    },
    "Cybersecurity": {
        "keywords": [
            "cybersecurity", "security", "penetration testing", "ethical hacking",
            "cryptography", "network security", "vulnerability", "soc", "siem",
            "firewall", "encryption", "owasp", "infosec",
        ],
        "weight": 0.8,
    },
    "Blockchain & Web3": {
        "keywords": [
            "blockchain", "solidity", "ethereum", "smart contract", "web3", "defi",
            "nft", "crypto", "decentralized", "ipfs", "hardhat", "truffle",
        ],
        "weight": 0.7,
    },
}


def _extract_all_skills_list(profile: dict) -> list[str]:
    skills = profile.get("skills", {})
    if isinstance(skills, list):
        return skills
    return (
        skills.get("technical", [])
        + skills.get("tools", [])
        + skills.get("languages", [])
        + skills.get("frameworks", [])
    )


def _build_search_text(profile: dict) -> str:
    parts = []
    parts.extend(_extract_all_skills_list(profile))
    for p in (profile.get("projects") or []):
        parts.append(p.get("title", ""))
        parts.append(p.get("description", ""))
        parts.extend(p.get("techStack", []))
    for e in (profile.get("experience") or []):
        parts.append(e.get("role", ""))
        parts.extend(e.get("highlights", []))
    for e in (profile.get("education") or []):
        parts.append(e.get("degree", ""))
    return " ".join(parts).lower()


def _experience_bonus(profile: dict, category: str) -> float:
    bonus = 0.0
    for exp in (profile.get("experience") or []):
        role = (exp.get("role") or "").lower()
        if any(w in role for w in ("intern", "engineer", "developer")):
            bonus += 2
        if category.split()[0].lower() in role:
            bonus += 3
    return min(bonus, 6)


def _project_bonus(profile: dict, keywords: list[str]) -> float:
    bonus = 0.0
    for proj in (profile.get("projects") or []):
        tech_stack = [s.lower() for s in (proj.get("techStack") or [])]
        count = sum(1 for kw in keywords if any(kw in t for t in tech_stack))
        bonus += count
    return min(bonus, 5)


def _confidence(matched: int, total: int) -> str:
    ratio = matched / total if total else 0
    if ratio >= 0.3:
        return "high"
    if ratio >= 0.15:
        return "medium"
    return "low"


def match_roles(profile: dict) -> list[dict]:
    """Mirrors matchingService.matchRoles() — exact same logic."""
    all_skills = _extract_all_skills_list(profile)
    all_text = _build_search_text(profile)
    matches = []

    for category, config in ROLE_CATEGORIES.items():
        keywords: list[str] = config["keywords"]
        weight: float = config["weight"]
        matched_skills = []
        raw_score = 0.0

        for kw in keywords:
            if kw.lower() in all_text:
                matched_skills.append(kw)
                if any(kw.lower() in s.lower() for s in all_skills):
                    raw_score += 3
                else:
                    raw_score += 1

        if matched_skills:
            exp_bonus = _experience_bonus(profile, category)
            proj_bonus = _project_bonus(profile, keywords)
            total_score = (raw_score + exp_bonus + proj_bonus) * weight
            matches.append({
                "category":     category,
                "score":        round(total_score * 10) / 10,
                "matchedSkills": list(dict.fromkeys(matched_skills)),
                "confidence":   _confidence(len(matched_skills), len(keywords)),
            })

    matches.sort(key=lambda x: x["score"], reverse=True)
    return matches[: max(2, min(5, len(matches)))]


# ─────────────────────────────────────────────────────────────────────────────
# Opportunity generation  (mirrors opportunityService.js — exact same templates)
# ─────────────────────────────────────────────────────────────────────────────

OPPORTUNITY_TEMPLATES: dict[str, list[dict]] = {
    "Software Engineering": [
        {
            "title": "Software Engineering Intern", "company": "Google",
            "link": "https://careers.google.com/jobs/results/?q=software%20engineering%20intern",
            "platform": "Company Career Page", "difficulty": "Hard",
            "time_to_apply": "15-20 mins",
            "requiredSkills": ["Data Structures", "Algorithms", "Java", "C++", "Python"],
        },
        {
            "title": "SDE Intern", "company": "Amazon",
            "link": "https://www.amazon.jobs/en/search?base_query=SDE+intern",
            "platform": "Company Career Page", "difficulty": "Hard",
            "time_to_apply": "20-30 mins",
            "requiredSkills": ["Data Structures", "Algorithms", "System Design", "OOP"],
        },
        {
            "title": "Software Engineer Intern", "company": "Microsoft",
            "link": "https://careers.microsoft.com/us/en/search-results?keywords=software%20engineer%20intern",
            "platform": "Company Career Page", "difficulty": "Hard",
            "time_to_apply": "15-20 mins",
            "requiredSkills": ["C#", "C++", "Java", "Data Structures", "Algorithms"],
        },
        {
            "title": "Software Engineering Intern", "company": "LinkedIn Search",
            "link": "https://www.linkedin.com/jobs/search/?keywords=software%20engineering%20intern&f_E=1",
            "platform": "LinkedIn", "difficulty": "Medium",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["Programming", "Problem Solving"],
        },
        {
            "title": "Backend Developer Intern", "company": "Internshala",
            "link": "https://internshala.com/internships/backend-development-internship",
            "platform": "Internshala", "difficulty": "Easy",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["Backend Development", "API", "Database"],
        },
    ],
    "Frontend Development": [
        {
            "title": "Frontend Developer Intern", "company": "LinkedIn Search",
            "link": "https://www.linkedin.com/jobs/search/?keywords=frontend%20developer%20intern&f_E=1",
            "platform": "LinkedIn", "difficulty": "Medium",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["React", "JavaScript", "CSS", "HTML"],
        },
        {
            "title": "UI/UX Developer Intern", "company": "Internshala",
            "link": "https://internshala.com/internships/web-development-internship",
            "platform": "Internshala", "difficulty": "Easy",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["HTML", "CSS", "JavaScript"],
        },
        {
            "title": "Frontend Engineering Intern", "company": "Wellfound (AngelList)",
            "link": "https://wellfound.com/role/intern/frontend-engineer",
            "platform": "Wellfound", "difficulty": "Medium",
            "time_to_apply": "10-15 mins",
            "requiredSkills": ["React", "TypeScript", "CSS"],
        },
        {
            "title": "React Developer Intern", "company": "LinkedIn Search",
            "link": "https://www.linkedin.com/jobs/search/?keywords=react%20developer%20intern&f_E=1",
            "platform": "LinkedIn", "difficulty": "Medium",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["React", "JavaScript", "Redux"],
        },
    ],
    "Full Stack Development": [
        {
            "title": "Full Stack Developer Intern", "company": "LinkedIn Search",
            "link": "https://www.linkedin.com/jobs/search/?keywords=full%20stack%20developer%20intern&f_E=1",
            "platform": "LinkedIn", "difficulty": "Medium",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["React", "Node.js", "MongoDB", "Express"],
        },
        {
            "title": "Full Stack Engineering Intern", "company": "Wellfound (AngelList)",
            "link": "https://wellfound.com/role/intern/full-stack-engineer",
            "platform": "Wellfound", "difficulty": "Medium",
            "time_to_apply": "10-15 mins",
            "requiredSkills": ["Full Stack", "REST API", "Database"],
        },
        {
            "title": "MERN Stack Developer", "company": "Internshala",
            "link": "https://internshala.com/internships/full-stack-development-internship",
            "platform": "Internshala", "difficulty": "Easy",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["MongoDB", "Express", "React", "Node.js"],
        },
        {
            "title": "Full Stack Developer Intern", "company": "Meta",
            "link": "https://www.metacareers.com/jobs?q=full%20stack%20intern",
            "platform": "Company Career Page", "difficulty": "Hard",
            "time_to_apply": "15-20 mins",
            "requiredSkills": ["React", "Python", "System Design"],
        },
    ],
    "Machine Learning": [
        {
            "title": "Machine Learning Intern", "company": "Google",
            "link": "https://careers.google.com/jobs/results/?q=machine%20learning%20intern",
            "platform": "Company Career Page", "difficulty": "Hard",
            "time_to_apply": "15-20 mins",
            "requiredSkills": ["Machine Learning", "Python", "TensorFlow", "Statistics"],
        },
        {
            "title": "AI/ML Intern", "company": "LinkedIn Search",
            "link": "https://www.linkedin.com/jobs/search/?keywords=machine%20learning%20intern&f_E=1",
            "platform": "LinkedIn", "difficulty": "Medium",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["Python", "ML", "Deep Learning"],
        },
        {
            "title": "ML Engineering Intern", "company": "Amazon",
            "link": "https://www.amazon.jobs/en/search?base_query=machine+learning+intern",
            "platform": "Company Career Page", "difficulty": "Hard",
            "time_to_apply": "20-30 mins",
            "requiredSkills": ["Machine Learning", "Python", "AWS", "Statistics"],
        },
        {
            "title": "AI Research Intern", "company": "Wellfound (AngelList)",
            "link": "https://wellfound.com/role/intern/machine-learning-engineer",
            "platform": "Wellfound", "difficulty": "Medium",
            "time_to_apply": "10-15 mins",
            "requiredSkills": ["Deep Learning", "PyTorch", "NLP"],
        },
        {
            "title": "ML/AI Intern", "company": "Internshala",
            "link": "https://internshala.com/internships/machine-learning-internship",
            "platform": "Internshala", "difficulty": "Easy",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["Python", "Machine Learning"],
        },
    ],
    "Data Science": [
        {
            "title": "Data Science Intern", "company": "LinkedIn Search",
            "link": "https://www.linkedin.com/jobs/search/?keywords=data%20science%20intern&f_E=1",
            "platform": "LinkedIn", "difficulty": "Medium",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["Python", "SQL", "Statistics", "Data Analysis"],
        },
        {
            "title": "Data Analyst Intern", "company": "Internshala",
            "link": "https://internshala.com/internships/data-science-internship",
            "platform": "Internshala", "difficulty": "Easy",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["Python", "SQL", "Excel"],
        },
        {
            "title": "Data Science Intern", "company": "Microsoft",
            "link": "https://careers.microsoft.com/us/en/search-results?keywords=data%20science%20intern",
            "platform": "Company Career Page", "difficulty": "Hard",
            "time_to_apply": "15-20 mins",
            "requiredSkills": ["Data Science", "Python", "Machine Learning", "Statistics"],
        },
        {
            "title": "Analytics Intern", "company": "Wellfound (AngelList)",
            "link": "https://wellfound.com/role/intern/data-scientist",
            "platform": "Wellfound", "difficulty": "Medium",
            "time_to_apply": "10-15 mins",
            "requiredSkills": ["Data Analysis", "SQL", "Python"],
        },
    ],
    "DevOps & Cloud": [
        {
            "title": "DevOps Intern", "company": "LinkedIn Search",
            "link": "https://www.linkedin.com/jobs/search/?keywords=devops%20intern&f_E=1",
            "platform": "LinkedIn", "difficulty": "Medium",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["Docker", "CI/CD", "Linux", "Cloud"],
        },
        {
            "title": "Cloud Engineering Intern", "company": "Amazon (AWS)",
            "link": "https://www.amazon.jobs/en/search?base_query=cloud+engineering+intern",
            "platform": "Company Career Page", "difficulty": "Hard",
            "time_to_apply": "20-30 mins",
            "requiredSkills": ["AWS", "Cloud", "DevOps", "Linux"],
        },
        {
            "title": "DevOps Engineer Intern", "company": "Internshala",
            "link": "https://internshala.com/internships/devops-internship",
            "platform": "Internshala", "difficulty": "Easy",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["Linux", "Docker", "CI/CD"],
        },
    ],
    "Mobile Development": [
        {
            "title": "Mobile Developer Intern", "company": "LinkedIn Search",
            "link": "https://www.linkedin.com/jobs/search/?keywords=mobile%20developer%20intern&f_E=1",
            "platform": "LinkedIn", "difficulty": "Medium",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["Android", "iOS", "React Native", "Flutter"],
        },
        {
            "title": "Android Developer Intern", "company": "Internshala",
            "link": "https://internshala.com/internships/android-app-development-internship",
            "platform": "Internshala", "difficulty": "Easy",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["Android", "Kotlin", "Java"],
        },
        {
            "title": "iOS Developer Intern", "company": "Apple",
            "link": "https://jobs.apple.com/en-us/search?search=ios%20intern",
            "platform": "Company Career Page", "difficulty": "Hard",
            "time_to_apply": "15-20 mins",
            "requiredSkills": ["Swift", "iOS", "Xcode"],
        },
    ],
    "Cybersecurity": [
        {
            "title": "Cybersecurity Intern", "company": "LinkedIn Search",
            "link": "https://www.linkedin.com/jobs/search/?keywords=cybersecurity%20intern&f_E=1",
            "platform": "LinkedIn", "difficulty": "Medium",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["Security", "Networking", "Linux"],
        },
        {
            "title": "Security Engineer Intern", "company": "Wellfound (AngelList)",
            "link": "https://wellfound.com/role/intern/security-engineer",
            "platform": "Wellfound", "difficulty": "Medium",
            "time_to_apply": "10-15 mins",
            "requiredSkills": ["Cybersecurity", "Penetration Testing", "OWASP"],
        },
    ],
    "Blockchain & Web3": [
        {
            "title": "Blockchain Developer Intern", "company": "LinkedIn Search",
            "link": "https://www.linkedin.com/jobs/search/?keywords=blockchain%20developer%20intern&f_E=1",
            "platform": "LinkedIn", "difficulty": "Medium",
            "time_to_apply": "5-10 mins",
            "requiredSkills": ["Solidity", "Ethereum", "Smart Contracts"],
        },
        {
            "title": "Web3 Developer Intern", "company": "Wellfound (AngelList)",
            "link": "https://wellfound.com/role/intern/blockchain-engineer",
            "platform": "Wellfound", "difficulty": "Medium",
            "time_to_apply": "10-15 mins",
            "requiredSkills": ["Web3", "Blockchain", "Solidity"],
        },
    ],
}


def generate_opportunities(matched_roles: list[dict], profile: dict) -> list[dict]:
    """Mirrors opportunityService.generateOpportunities() — identical logic."""
    opportunities = []
    seen: set[str] = set()
    difficulty_order = {"Easy": 0, "Medium": 1, "Hard": 2}

    for match in matched_roles:
        templates = OPPORTUNITY_TEMPLATES.get(match["category"], [])
        for template in templates:
            key = f"{template['company']}-{template['title']}"
            if key in seen:
                continue
            seen.add(key)
            opportunities.append({
                **template,
                "category":     match["category"],
                "matchScore":   match["score"],
                "matchedSkills": match["matchedSkills"],
                "why_fit":      "",  # filled by generate_fit_explanations
            })

    opportunities.sort(
        key=lambda x: (-x["matchScore"], difficulty_order.get(x["difficulty"], 1))
    )
    return opportunities[:12]


def generate_dynamic_search_urls(skills: list[str], category: str) -> list[dict]:
    """Mirrors opportunityService.generateDynamicSearchURLs()."""
    encoded = quote(" ".join(skills[:3]) + " intern")
    return [
        {"platform": "LinkedIn",   "url": f"https://www.linkedin.com/jobs/search/?keywords={encoded}&f_E=1"},
        {"platform": "Indeed",     "url": f"https://www.indeed.com/jobs?q={encoded}&jt=internship"},
        {"platform": "Glassdoor",  "url": f"https://www.glassdoor.com/Job/jobs.htm?sc.keyword={encoded}"},
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Gap Analysis & Project Suggestions (Resume Enhancements)
# ─────────────────────────────────────────────────────────────────────────────

async def analyze_resume_gaps(session_id: str) -> dict:
    session = get_session(session_id)
    if not session or not session.get("parsedProfile"):
        raise ValueError("Invalid session or profile not parsed yet.")

    profile = session["parsedProfile"]
    
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert career counselor. Based on the user's resume profile (skills, projects, experience), "
                "identify the main skill gaps for a typical high-paying Software/Tech role and provide 3-5 actionable "
                "recommendations (like missing technologies or specific types of courses/certifications they should pursue).\n\n"
                "Return JSON with EXACTLY this structure:\n"
                "{\n"
                '  "missing_skills": ["skill1", "skill2"],\n'
                '  "actionable_steps": [\n'
                '    {"action": "Action to take", "reason": "Why this matters", "type": "Course / Certification / Practice"}\n'
                "  ]\n"
                "}\n"
                "No prose or markdown fences, ONLY JSON."
            ),
        },
        {
            "role": "user",
            "content": f"Analyze this profile for gaps: {json.dumps(profile)}",
        },
    ]

    raw = await _call_groq(
        messages, 
        model="llama-3.1-8b-instant", 
        temperature=0.2, 
        max_tokens=1024,
        response_format={"type": "json_object"}
    )
    if not raw:
        raise ValueError("Groq AI failed to generate gap analysis.")
    
    parsed = extract_json(raw)
    if not isinstance(parsed, dict):
        raise ValueError("AI parsing returned invalid format.")
    
    return parsed


async def suggest_projects(session_id: str) -> dict:
    session = get_session(session_id)
    if not session or not session.get("parsedProfile"):
        raise ValueError("Invalid session or profile not parsed yet.")

    profile = session["parsedProfile"]
    
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert tech career coach. Based on the user's resume profile, suggest 3-5 high-impact, "
                "trending project ideas that will significantly boost their portfolio for modern tech roles (e.g. AI, "
                "Full Stack, Cloud).\n\n"
                "Return JSON with EXACTLY this structure:\n"
                "{\n"
                '  "project_suggestions": [\n'
                '    {"title": "Project Name", "description": "What it does", "tech_stack": ["tech1", "tech2"], "difficulty": "Medium"}\n'
                "  ]\n"
                "}\n"
                "No prose or markdown fences, ONLY JSON."
            ),
        },
        {
            "role": "user",
            "content": f"Provide project suggestions for this profile: {json.dumps(profile)}",
        },
    ]

    raw = await _call_groq(
        messages, 
        model="llama-3.1-8b-instant", 
        temperature=0.7, 
        max_tokens=1500,
        response_format={"type": "json_object"}
    )
    if not raw:
        raise ValueError("Groq AI failed to generate project suggestions.")
    
    parsed = extract_json(raw)
    if not isinstance(parsed, dict):
        raise ValueError("AI parsing returned invalid format.")
    
    return parsed
