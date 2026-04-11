import httpx
from bs4 import BeautifulSoup
from urllib.parse import quote_plus
import json
import os
import random
from groq import Groq
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

_groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

MIN_QUESTIONS = 5

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
]


def _headers(referer: str = "https://www.google.com/") -> dict:
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": referer,
        "Connection": "keep-alive",
        "Cache-Control": "no-cache",
    }


# ─── Source 1: DuckDuckGo HTML (most scraper-friendly search engine) ──────────
def _scrape_duckduckgo(company: str, role: str) -> tuple[list[str], str]:
    """
    DuckDuckGo's HTML-only endpoint returns plain rendered HTML with no JS.
    Snippets live in .result__snippet — very stable selector.
    """
    query = quote_plus(f"{company} {role} interview questions asked")
    url = f"https://html.duckduckgo.com/html/?q={query}"

    try:
        with httpx.Client(timeout=15, follow_redirects=True) as client:
            resp = client.post(
                url,
                headers=_headers("https://duckduckgo.com/"),
                data={"q": f"{company} {role} interview questions asked", "b": "", "kl": "us-en"},
            )
            if resp.status_code != 200 or len(resp.text) < 2000:
                return [], "duckduckgo"

            soup = BeautifulSoup(resp.text, "html.parser")
            texts = []

            # Titles (h2.result__title)
            for el in soup.select("h2.result__title a, .result__title a"):
                t = el.get_text(strip=True)
                if t:
                    texts.append(t)

            # Snippets (.result__snippet)
            for el in soup.select(".result__snippet"):
                t = el.get_text(" ", strip=True)
                if t and len(t) > 20:
                    texts.append(t)

            return texts, "duckduckgo"
    except Exception as e:
        print(f"[scraper] DuckDuckGo error: {e}")
        return [], "duckduckgo"


# ─── Source 2: Bing search results ────────────────────────────────────────────
def _scrape_bing(company: str, role: str) -> tuple[list[str], str]:
    """
    Bing returns server-rendered HTML. Snippets in .b_caption p are stable.
    """
    query = quote_plus(f"{company} {role} interview questions experience")
    url = f"https://www.bing.com/search?q={query}&count=15&mkt=en-US"

    try:
        with httpx.Client(timeout=15, follow_redirects=True) as client:
            resp = client.get(url, headers=_headers("https://www.bing.com/"))
            if resp.status_code != 200 or len(resp.text) < 2000:
                return [], "bing"

            soup = BeautifulSoup(resp.text, "html.parser")
            texts = []

            # Result titles
            for el in soup.select("h2 a"):
                t = el.get_text(strip=True)
                if t and len(t) > 10:
                    texts.append(t)

            # Result snippets
            for el in soup.select(".b_caption p, .b_algoSlug, .b_dList dt, .b_dList dd"):
                t = el.get_text(" ", strip=True)
                if t and len(t) > 20:
                    texts.append(t)

            return texts, "bing"
    except Exception as e:
        print(f"[scraper] Bing error: {e}")
        return [], "bing"


# ─── Source 3: Google search snippets ─────────────────────────────────────────
def _scrape_google(company: str, role: str) -> tuple[list[str], str]:
    """
    Google search — selectors are less stable but worth trying.
    Using a specific query targeting interview Q&A sites.
    """
    query = quote_plus(
        f'"{company}" "{role}" interview questions asked glassdoor reddit geeksforgeeks'
    )
    url = f"https://www.google.com/search?q={query}&num=15&hl=en&gl=us"

    try:
        with httpx.Client(timeout=15, follow_redirects=True) as client:
            resp = client.get(url, headers=_headers("https://www.google.com/"))
            if resp.status_code not in (200, 301, 302) or len(resp.text) < 2000:
                return [], "google"

            soup = BeautifulSoup(resp.text, "html.parser")
            texts = []

            # Remove nav, scripts
            for tag in soup(["script", "style", "nav", "header", "footer"]):
                tag.decompose()

            # Collect all substantial text blocks
            for el in soup.find_all(["h3", "span", "div", "p"]):
                t = el.get_text(" ", strip=True)
                if 20 < len(t) < 600 and t not in texts:
                    texts.append(t)

            return texts[:80], "google"
    except Exception as e:
        print(f"[scraper] Google error: {e}")
        return [], "google"


# ─── Groq refiner: turns raw snippets into clean, proper questions ─────────────
def _refine_with_groq(
    raw_texts: list[str],
    company: str,
    role: str,
    source: str,
) -> list[str]:
    """
    Pass raw scraped text blobs to Groq.
    It extracts real questions AND generates additional company-specific ones
    to reach a good count. Returns a clean, deduplicated list.
    """
    if not raw_texts:
        combined = "(no raw text available)"
    else:
        # Cap at ~3000 chars so we stay within token limits
        combined = "\n".join(raw_texts)[:3000]

    prompt = f"""You are a senior technical recruiter building an interview question bank for {company} — {role} position.

You have the following RAW TEXT scraped from search engines about "{company} {role} interview questions":
---
{combined}
---

Your task:
1. Extract any real interview questions buried in that raw text
2. Rewrite vague ones into clear, well-framed questions (e.g. "they asked about trees" → "Explain how a binary search tree works and when you'd use it.")
3. Generate ADDITIONAL {company}-specific {role} interview questions to fill the list — covering:
   - Technical/DSA questions relevant to {role}
   - System design or architecture questions
   - Behavioural questions (STAR format topics)
   - {company}-specific culture/domain questions (based on what you know about {company})
4. De-duplicate — never include the same question twice

Return ONLY a JSON object in this format:
{{
  "questions": [
    "Question 1?",
    "Question 2?",
    ...
  ]
}}

Minimum 10 questions, maximum 25. Every entry MUST end with a question mark.
Do not include any explanation, markdown, or extra text — only the JSON."""

    try:
        completion = _groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that outputs valid JSON only."},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.6,
            max_tokens=1200,
            response_format={"type": "json_object"},
        )
        raw = completion.choices[0].message.content
        parsed = json.loads(raw)
        questions = parsed.get("questions", [])
        # Ensure all end with ?
        cleaned = [q.strip() for q in questions if isinstance(q, str) and len(q) > 10]
        cleaned = [q if q.endswith("?") else q + "?" for q in cleaned]
        return cleaned
    except Exception as e:
        print(f"[scraper] Groq refinement error: {e}")
        return []


# ─── Public entry point ────────────────────────────────────────────────────────
def scrape_questions(company: str, role: str) -> dict:
    """
    1. Try DuckDuckGo → Bing → Google (collect raw snippets from whichever works)
    2. Pass ALL collected raw text to Groq to extract + frame + supplement questions
    3. Return clean list. Never fails as long as Groq key works.
    """
    all_texts: list[str] = []
    source_used = "ai-curated"

    # Try all search sources — collect all snippets
    for scrape_fn, label in [
        (_scrape_duckduckgo, "duckduckgo"),
        (_scrape_bing, "bing"),
        (_scrape_google, "google"),
    ]:
        texts, _ = scrape_fn(company, role)
        if texts:
            print(f"[scraper] {label}: collected {len(texts)} text fragments")
            all_texts.extend(texts)
            source_used = label
            if len(all_texts) >= 30:
                break  # enough material for Groq to work with

    # Pass everything (or nothing) to Groq for extraction + framing
    print(f"[scraper] Sending {len(all_texts)} fragments to Groq for refinement...")
    questions = _refine_with_groq(all_texts, company, role, source_used)

    if len(questions) < MIN_QUESTIONS:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Could not generate interview questions for '{company}' ({role}). "
                "This may be a Groq API issue. Please check your GROQ_API_KEY and try again."
            ),
        )

    return {
        "questions": questions[:25],
        "source": source_used,
        "count": len(questions[:25]),
    }
