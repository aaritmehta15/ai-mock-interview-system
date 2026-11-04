"""
services/tts_service.py

High-Performance Microsoft Edge Read-Aloud Neural TTS Service:
- Translates interview text into natural, lifelike spoken audio (24kHz MP3).
- Applies `normalize_text_for_voice` to convert technical complexity (O(N) -> "O of N"),
  acronyms (SQL -> "S-Q-L"), and remove markdown so audio sounds natural.
- In-memory RAM LRU Cache for 0ms latency on repeated lines.
- Voice mappings:
  - Priya Sharma -> en-IN-NeerjaNeural (Indian English)
  - Alex Rivera  -> en-US-GuyNeural (Silicon Valley US English)
  - Marcus Vance -> en-GB-RyanNeural (London UK English)
"""
from __future__ import annotations

import asyncio
from collections import OrderedDict
import hashlib
import io
import logging
import re
from typing import Any, Dict, Optional

import edge_tts

logger = logging.getLogger("interview.tts_service")

# ── Voice Mapping Matrix ───────────────────────────────────────────────────────
PERSONA_VOICES: Dict[str, str] = {
    "priya": "en-IN-NeerjaNeural",
    "priya_sharma": "en-IN-NeerjaNeural",
    "alex": "en-US-GuyNeural",
    "alex_rivera": "en-US-GuyNeural",
    "marcus": "en-GB-RyanNeural",
    "marcus_vance": "en-GB-RyanNeural",
}
DEFAULT_VOICE = "en-US-GuyNeural"

# ── In-Memory RAM LRU Cache ────────────────────────────────────────────────────
_CACHE_MAX_ENTRIES = 500
_tts_cache: OrderedDict[str, bytes] = OrderedDict()
_cache_lock = asyncio.Lock()


def resolve_voice_for_persona(persona_id: Optional[str]) -> str:
    """Resolves the calibrated Edge Neural voice identifier for a given persona."""
    if not persona_id:
        return DEFAULT_VOICE
    normalized = persona_id.strip().lower()
    return PERSONA_VOICES.get(normalized, DEFAULT_VOICE)


def normalize_text_for_voice(text: str) -> str:
    """
    Transforms written technical text into phonetically natural spoken prose.
    - Strips markdown asterisks, backticks, hashes, bullets, and URLs.
    - Normalizes Big-O complexities (O(1) -> 'O of 1', O(N log N) -> 'O of N log N').
    - Expands units (200ms -> '200 milliseconds', 5GB -> '5 gigabytes').
    - Spells out technical acronyms (SQL -> 'S-Q-L', API -> 'A-P-I', gRPC -> 'G-R-P-C').
    """
    if not text:
        return ""

    out = text

    # 1. Strip Markdown links [text](url) -> text
    out = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', out)

    # 2. Strip raw URLs
    out = re.sub(r'https?://\S+', '', out)

    # 3. Strip code fences and inline backticks
    out = re.sub(r'```[\s\S]*?```', ' [code snippet omitted] ', out)
    out = re.sub(r'`([^`]+)`', r'\1', out)

    # 4. Strip markdown emphasis (*bold*, **bold**, _italic_, __italic__)
    out = re.sub(r'\*\*([^*]+)\*\*', r'\1', out)
    out = re.sub(r'\*([^*]+)\*', r'\1', out)
    out = re.sub(r'__([^_]+)__', r'\1', out)
    out = re.sub(r'_([^_]+)_', r'\1', out)

    # 5. Strip markdown headers (#, ##, ###)
    out = re.sub(r'^\s*#{1,6}\s*', '', out, flags=re.MULTILINE)

    # 6. Strip bullet points (- item, * item, + item)
    out = re.sub(r'^\s*[-*+]\s+', '', out, flags=re.MULTILINE)

    # 7. Asymptotic Notation (Big-O)
    out = re.sub(r'\bO\(1\)', 'O of 1', out, flags=re.IGNORECASE)
    out = re.sub(r'\bO\(N\s+log\s+N\)', 'O of N log N', out, flags=re.IGNORECASE)
    out = re.sub(r'\bO\(log\s*N\)', 'O of log N', out, flags=re.IGNORECASE)
    out = re.sub(r'\bO\(N\^?2\)', 'O of N squared', out, flags=re.IGNORECASE)
    out = re.sub(r'\bO\(N\^?3\)', 'O of N cubed', out, flags=re.IGNORECASE)
    out = re.sub(r'\bO\(2\^N\)', 'O of 2 to the N', out, flags=re.IGNORECASE)
    out = re.sub(r'\bO\(N\)', 'O of N', out, flags=re.IGNORECASE)
    out = re.sub(r'\bO\(V\s*\+\s*E\)', 'O of V plus E', out, flags=re.IGNORECASE)

    # 8. Units of measure and telemetry
    out = re.sub(r'\b(\d+)\s*ms\b', r'\1 milliseconds', out, flags=re.IGNORECASE)
    out = re.sub(r'\b(\d+)\s*(?:µs|us)\b', r'\1 microseconds', out, flags=re.IGNORECASE)
    out = re.sub(r'\b(\d+)\s*GB\b', r'\1 gigabytes', out, flags=re.IGNORECASE)
    out = re.sub(r'\b(\d+)\s*TB\b', r'\1 terabytes', out, flags=re.IGNORECASE)
    out = re.sub(r'\b(\d+)\s*MB\b', r'\1 megabytes', out, flags=re.IGNORECASE)
    out = re.sub(r'\b(\d+)\s*KB\b', r'\1 kilobytes', out, flags=re.IGNORECASE)

    # 9. Technical Acronyms (hyphenated for clear acoustic pronunciation)
    acronym_map = [
        (r'\bPostgreSQL\b', 'Postgre-S-Q-L'),
        (r'\bMySQL\b', 'My-S-Q-L'),
        (r'\bNoSQL\b', 'No-S-Q-L'),
        (r'\bSQL\b', 'S-Q-L'),
        (r'\bAPIs\b', 'A-P-Is'),
        (r'\bAPI\b', 'A-P-I'),
        (r'\bHTTP\b', 'H-T-T-P'),
        (r'\bHTTPS\b', 'H-T-T-P-S'),
        (r'\bgRPC\b', 'G-R-P-C'),
        (r'\bAWS\b', 'A-W-S'),
        (r'\bGCP\b', 'G-C-P'),
        (r'\bCPUs\b', 'C-P-Us'),
        (r'\bCPU\b', 'C-P-U'),
        (r'\bQPS\b', 'Q-P-S'),
        (r'\bTPS\b', 'T-P-S'),
        (r'\bSLA\b', 'S-L-A'),
        (r'\bSLO\b', 'S-L-O'),
        (r'\bSLI\b', 'S-L-I'),
        (r'\bUUID\b', 'U-U-I-D'),
        (r'\bJWT\b', 'J-W-T'),
        (r'\bCI/CD\b', 'C-I C-D'),
        (r'\bP99\b', 'P-99'),
        (r'\bP95\b', 'P-95'),
    ]
    for pattern, replacement in acronym_map:
        out = re.sub(pattern, replacement, out)

    # 10. Math & Logic Symbols
    out = out.replace("!=", " not equal to ")
    out = out.replace(">=", " greater than or equal to ")
    out = out.replace("<=", " less than or equal to ")
    out = out.replace(" & ", " and ")
    out = out.replace(" / ", " or ")

    # 11. Collapse whitespace and strip
    out = re.sub(r'\s+', ' ', out).strip()

    return out


async def synthesize_speech(
    text: str,
    persona_id: Optional[str] = "alex",
) -> bytes:
    """
    Synthesizes speech via Microsoft Edge Neural TTS.
    Returns 24kHz / 48kbps MP3 binary bytes.
    Features:
      - Normalizes technical text before audio synthesis.
      - 0ms RAM LRU Cache on repeated phrases.
      - Async streaming chunk concatenation.
    """
    clean_text = normalize_text_for_voice(text)
    if not clean_text:
        return b""

    voice = resolve_voice_for_persona(persona_id)
    cache_key = hashlib.sha256(f"{voice}:{clean_text}".encode("utf-8")).hexdigest()

    # 1. Check RAM LRU Cache
    async with _cache_lock:
        if cache_key in _tts_cache:
            # Move to MRU position
            _tts_cache.move_to_end(cache_key)
            logger.debug("[tts] RAM Cache HIT for voice %s (key=%s)", voice, cache_key[:8])
            return _tts_cache[cache_key]

    # 2. Synthesize via Edge TTS
    logger.info("[tts] Synthesizing speech via %s: '%s'...", voice, clean_text[:60])
    buffer = io.BytesIO()
    try:
        communicator = edge_tts.Communicate(text=clean_text, voice=voice)
        async for chunk in communicator.stream():
            if chunk.get("type") == "audio":
                buffer.write(chunk.get("data", b""))
        audio_bytes = buffer.getvalue()
    except Exception as e:
        logger.error("[tts] Edge TTS synthesis failed for voice %s: %s", voice, e)
        raise e

    if not audio_bytes:
        logger.warning("[tts] Synthesized audio was empty for text: %s", clean_text)
        return b""

    # 3. Store in RAM LRU Cache
    async with _cache_lock:
        if len(_tts_cache) >= _CACHE_MAX_ENTRIES:
            _tts_cache.popitem(last=False)  # Evict oldest entry (LRU)
        _tts_cache[cache_key] = audio_bytes

    logger.info("[tts] Synthesized %d bytes (24kHz MP3) for voice %s", len(audio_bytes), voice)
    return audio_bytes


def get_cache_stats() -> Dict[str, Any]:
    """Returns current LRU cache metrics."""
    return {
        "cached_entries": len(_tts_cache),
        "max_entries": _CACHE_MAX_ENTRIES,
    }
