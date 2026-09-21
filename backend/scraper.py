import httpx
from bs4 import BeautifulSoup
from urllib.parse import quote_plus
import json
import os
import random
from dotenv import load_dotenv
from groq import AsyncGroq
import asyncio
from fastapi import HTTPException

from dotenv import load_dotenv
load_dotenv()

# Use AsyncGroq for non-blocking calls
_groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

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


# ─── Source 1: DuckDuckGo HTML ──────────────────────────────────────────────
async def _scrape_duckduckgo(company: str, role: str) -> tuple[list[str], str]:
    query = quote_plus(f"{company} {role} interview questions asked")
    url = f"https://html.duckduckgo.com/html/?q={query}"

    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.post(
                url,
                headers=_headers("https://duckduckgo.com/"),
                data={"q": f"{company} {role} interview questions asked", "b": "", "kl": "us-en"},
            )
            if resp.status_code != 200 or len(resp.text) < 2000:
                return [], "duckduckgo"

            soup = BeautifulSoup(resp.text, "html.parser")
            texts = []
            for el in soup.select("h2.result__title a, .result__title a"):
                t = el.get_text(strip=True)
                if t: texts.append(t)
            for el in soup.select(".result__snippet"):
                t = el.get_text(" ", strip=True)
                if t and len(t) > 20: texts.append(t)
            return texts, "duckduckgo"
    except Exception as e:
        print(f"[scraper] DuckDuckGo error: {e}")
        return [], "duckduckgo"


# ─── Source 2: Bing search results ────────────────────────────────────────────
async def _scrape_bing(company: str, role: str) -> tuple[list[str], str]:
    query = quote_plus(f"{company} {role} interview questions experience")
    url = f"https://www.bing.com/search?q={query}&count=15&mkt=en-US"

    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=_headers("https://www.bing.com/"))
            if resp.status_code != 200 or len(resp.text) < 2000:
                return [], "bing"

            soup = BeautifulSoup(resp.text, "html.parser")
            texts = []
            for el in soup.select("h2 a"):
                t = el.get_text(strip=True)
                if t and len(t) > 10: texts.append(t)
            for el in soup.select(".b_caption p, .b_algoSlug, .b_dList dt, .b_dList dd"):
                t = el.get_text(" ", strip=True)
                if t and len(t) > 20: texts.append(t)
            return texts, "bing"
    except Exception as e:
        print(f"[scraper] Bing error: {e}")
        return [], "bing"


# ─── Source 3: Google search snippets ─────────────────────────────────────────
async def _scrape_google(company: str, role: str) -> tuple[list[str], str]:
    query = quote_plus(f'"{company}" "{role}" interview questions asked glassdoor reddit geeksforgeeks')
    url = f"https://www.google.com/search?q={query}&num=15&hl=en&gl=us"

    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=_headers("https://www.google.com/"))
            if resp.status_code not in (200, 301, 302) or len(resp.text) < 2000:
                return [], "google"

            soup = BeautifulSoup(resp.text, "html.parser")
            texts = []
            for tag in soup(["script", "style", "nav", "header", "footer"]):
                tag.decompose()
            for el in soup.find_all(["h3", "span", "div", "p"]):
                t = el.get_text(" ", strip=True)
                if 20 < len(t) < 600:
                    texts.append(t)
            return texts[:80], "google"
    except Exception as e:
        print(f"[scraper] Google error: {e}")
        return [], "google"


# ─── Groq refiner ─────────────────────────────────────────────────────────────
async def _refine_with_groq(
    raw_texts: list[str],
    company: str,
    role: str,
    source: str,
) -> list[str]:
    if not raw_texts:
        combined = "(no raw text available)"
    else:
        combined = "\n".join(raw_texts)[:4000]

    prompt = f"""You are a senior technical recruiter building an interview question bank for {company} — {role} position.

You have the following RAW TEXT scraped from search engines about "{company} {role} interview questions":
---
{combined}
---

Your task:
1. Extract any real interview questions buried in that raw text
2. Generate ADDITIONAL {company}-specific {role} interview questions to total 15-20 questions.
   - Cover Technical/DSA, System Design, and Behavioural.

Return ONLY a JSON object: {{"questions": ["Q1?", "Q2?", ...]}}
Minimum 10 questions. Every entry MUST end with a question mark."""

    from config import GROQ_MODEL, GROQ_CLASSIFY_MODEL
    models = list(dict.fromkeys([m for m in [GROQ_MODEL, GROQ_CLASSIFY_MODEL, "groq/compound-mini", "groq/compound", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"] if m]))
    for model in models:
        try:
            completion = await _groq_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that outputs valid JSON only."},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0.6,
                max_tokens=1500,
                response_format={"type": "json_object"},
            )
            raw = completion.choices[0].message.content
            parsed = json.loads(raw)
            questions = parsed.get("questions", [])
            cleaned = [q.strip() for q in questions if isinstance(q, str) and len(q) > 10]
            cleaned = [q if q.endswith("?") else q + "?" for q in cleaned]
            return cleaned
        except Exception as e:
            if "429" in str(e) or "rate_limit" in str(e).lower() or "quota" in str(e).lower():
                print(f"[scraper] Groq rate limit on {model}, trying next...")
                continue
            print(f"[scraper] Groq refinement error on {model}: {e}")
            break
            
    return []


# ─── Public entry point ────────────────────────────────────────────────────────
async def scrape_questions(company: str, role: str) -> dict:
    """
    Parallelized scraping + Async refinement to prevent 408 timeouts.
    """
    print(f"[scraper] Starting parallel scrape for {company} {role}...")
    
    # Run all scrapers in parallel
    results = await asyncio.gather(
        _scrape_duckduckgo(company, role),
        _scrape_bing(company, role),
        _scrape_google(company, role),
        return_exceptions=True
    )
    
    all_texts = []
    source_used = "ai-generated"
    
    for res in results:
        if isinstance(res, tuple) and res[0]:
            all_texts.extend(res[0])
            source_used = res[1]

    if len(all_texts) > 50:
        all_texts = all_texts[:50]

    print(f"[scraper] Sending {len(all_texts)} fragments to Groq...")
    questions = await _refine_with_groq(all_texts, company, role, source_used)

    if len(questions) < MIN_QUESTIONS:
        # Final fallback generation
        print("[scraper] Falling back to zero-shot generation...")
        questions = await _refine_with_groq([], company, role, "groq-fallback")

    if len(questions) < MIN_QUESTIONS:
        raise HTTPException(status_code=503, detail="Failed to generate interview questions. Please retry.")

    return {
        "questions": questions[:25],
        "source": source_used,
        "count": len(questions[:25]),
    }

