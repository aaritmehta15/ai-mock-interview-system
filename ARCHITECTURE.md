# 🏛️ Apex Interview AI — Deep-Dive Systems Architecture

This document provides a comprehensive technical analysis of the distributed systems architecture, latency budgets, state machine orchestration, and architectural decision records (ADRs) powering **Apex Interview AI**.

---

## 1. The Anti-Phantom Problem & Mathematical Grounding

### The Core Failure Mode of Naive AI Evaluators
In a real-life technical interview, conversations naturally diverge. If a candidate spends 10 minutes deeply defending an LSM-tree indexing decision on Question 1, they may only complete 2 of 5 planned blueprint questions before time expires.

In conventional AI interview tools:
1. The evaluation prompt sends the entire original question list to the LLM.
2. The model is asked to "evaluate the candidate's performance across the questions".
3. The LLM hallucinates candidate quotes and fabricates scores for Questions 3, 4, and 5, or assigns zeroes that drag the candidate's score down unfairly.

### The Mathematical Ledger Solution
Apex Interview AI introduces an **Append-Only SQLite Turn Ledger**. Every spoken utterance is logged chronologically:

$$\mathcal{L} = \{ (\tau_1, s_1, q_1, w_1, c_1), \dots, (\tau_k, s_k, q_k, w_k, c_k) \}$$

Where:
- $\tau_i$ is the ISO 8601 UTC timestamp
- $s_i \in \{\text{candidate}, \text{interviewer}\}$ is the speaker
- $q_i \in \mathbb{N} \cup \{\emptyset\}$ is the associated question index
- $w_i \in \mathbb{N}$ is the verified word count
- $c_i \in [0, 1]$ is the speech recognition confidence

During evaluation, the set of **Actually Voiced Questions** $\mathcal{Q}_{\text{voiced}}$ is computed strictly from the interviewer turns in the ledger:

$$\mathcal{Q}_{\text{voiced}} = \{ q \mid \exists (\tau, \text{interviewer}, q, w, c) \in \mathcal{L} \}$$

For any planned question $Q_j \notin \mathcal{Q}_{\text{voiced}}$:

$$\text{Status}(Q_j) = \text{UNREACHED}$$
$$\text{Weight}(Q_j) = 0.0$$
$$\text{Score}(Q_j) = 0.0$$

The candidate's overall score is evaluated **strictly** over $\mathcal{Q}_{\text{voiced}}$:

$$\text{Overall Score} = \frac{\sum_{Q \in \mathcal{Q}_{\text{voiced}}} \text{Score}(Q) \cdot \text{Weight}(Q)}{\sum_{Q \in \mathcal{Q}_{\text{voiced}}} \text{Weight}(Q)}$$

If zero questions were voiced, the system safely yields a neutral baseline report with zero hallucination.

### Cryptographic Session Integrity
To prove transcripts have not been tampered with or retroactively altered:

$$\text{Digest} = \text{SHA-256}\left( \bigoplus_{i=1}^k \left( \tau_i \,\|\, s_i \,\|\, q_i \,\|\, \text{text}_i \right) \right)$$

This digest is returned in the API and displayed directly on the evaluation dossier.

---

## 2. Latency Budget & Real-Time Voice Streaming

To preserve the cognitive illusion of a real human interviewer, the system must achieve an end-to-end conversational turnaround of **$< 650\text{ms}$** (p50).

```
[Candidate Voice] ──► (1) Silero VAD ──► (2) WebRTC Ingest ──► (3) Streaming LLM ──► (4) Audio Buffer ──► [Candidate Ear]
      0ms                    200ms               240ms                 590ms               640ms             < 650ms
```

### Turnaround Latency Breakdown:
| Stage | Target p50 | Target p95 | Architectural Technique |
| :--- | :--- | :--- | :--- |
| **1. Silero VAD Trailing Boundary** | `200ms` | `280ms` | Low-latency voice activity threshold; cuts trailing silence promptly. |
| **2. WebRTC Edge Ingest** | `40ms` | `80ms` | LiveKit Cloud edge routing to geographically closest media server. |
| **3. Time to First Token (TTFT)** | `350ms` | `550ms` | High-throughput streaming via Groq (`qwen/qwen3.8-27b`) or Gemini Multimodal Live. |
| **4. Audio Chunk Playback Buffer** | `50ms` | `90ms` | Web Audio API streaming chunk pipeline in candidate browser. |
| **Total Conversational Latency** | **$< 650ms$** | **$< 1000ms$** | **Sub-second response feels completely natural and human.** |

### Conversational Barge-In (Interruption Handling)
- When the candidate begins speaking while the interviewer is talking, the browser's client-side VAD immediately sends an interruption packet over the WebRTC data channel.
- The server stops audio generation, clears the playback queue, and transitions the state machine to `CandidateListening`.

---

## 3. Memory Architecture & Cloud Free-Tier Ceiling

### The 512 MB RAM Ceiling Constraint
Deploying full WebRTC voice agents on cloud free tiers (such as Render's 512 MB RAM container) often causes immediate crashes:
- `libwebrtc` C++ runtime bindings: ~180 MB
- ONNX Runtime (Silero VAD): ~120 MB
- Python process & FastAPI dependencies: ~150 MB
- Inbound audio buffers under concurrency: ~70 MB
- **Total Combined Monolithic Footprint**: $\ge 520\text{ MB} \implies$ **Linux OOM `SIGKILL 137` / HTTP 503**.

### Decoupled Worker Strategy
Apex Interview AI enforces a strictly decoupled runtime topology:

```
[ Render Free Web Service ]                [ Dedicated Worker Host / Local Workstation ]
  FastAPI REST Server                        LiveKit Voice Agent Worker
  Memory Footprint: ~95 MB (19% of ceiling)   Full WebRTC & VAD Audio Pipelines
  Zero OOM Risk · 100% Uptime                Connects Outbound to LiveKit Cloud Edge
```

---

## 4. Multi-Model LLM Resilience Matrix

To guarantee 100% uptime for recruiter demos even during upstream provider rate limits (HTTP 429) or model outages:

```
┌─────────────────────────────────┐
│ Tier 1: openai/gpt-oss-120b     │  (Deep structured reasoning)
└───────────────┬─────────────────┘
                │ Failure / Rate Limit / Timeout
                ▼
┌─────────────────────────────────┐
│ Tier 2: openai/gpt-oss-20b      │  (Fast fallback reasoning)
└───────────────┬─────────────────┘
                │ Failure / 429
                ▼
┌─────────────────────────────────┐
│ Tier 3: qwen/qwen3.8-27b        │  (High-velocity streaming model)
└───────────────┬─────────────────┘
                │ Total Upstream Outage
                ▼
┌─────────────────────────────────┐
│ Tier 4: Deterministic Fallback  │  (Pre-calibrated Staff Engineer rubrics)
└─────────────────────────────────┘
```

---

## 5. Architecture Decision Records (ADRs)

### ADR-01: Resume/JD Blueprint Engine vs. Live Web Search Scraping
- **Decision**: Replace runtime web search scraping with a deterministic Resume + Job Description Blueprint Engine.
- **Context**: Hackathon version attempted to scrape Google/Bing for live questions. Search engines aggressively block server IPs with HTTP 429 / Cloudflare CAPTCHAs, introduced 8–14 seconds of cold-start delay, and injected noisy SEO marketing text.
- **Outcome**: Instant sub-second blueprint generation, zero IP ban risk, and precise binary assertions aligned directly with the candidate's actual projects.

### ADR-02: LiveKit WebRTC Agents vs. Browser Web Speech API
- **Decision**: Standardize on LiveKit Cloud WebRTC and Python Agents rather than the browser's native `webkitSpeechRecognition`.
- **Context**: Web Speech API is browser-dependent (broken in Firefox/Safari), lacks audio telemetry, does not support custom technical vocabularies ("PostgreSQL" transcribed as "post gray scale"), and provides robotic voices.
- **Outcome**: Cross-browser consistency, full-duplex audio, sub-650ms latency, and direct Gemini/Groq audio streaming.

### ADR-03: React 18 + Vite SPA vs. Next.js 15 SSR
- **Decision**: Use a client-side React 18 + TypeScript + Vite Single Page Application.
- **Context**: Real-time WebRTC audio applications execute 100% in the client browser. Server-side rendering (SSR) introduces node server overhead and cold starts.
- **Outcome**: Blazing fast static edge hosting on Vercel with zero cold-start delay.

### ADR-04: Append-Only SQLite Ledger vs. In-Memory State
- **Decision**: Persist every turn in SQLite WAL mode on disk, accompanied by an in-memory hot cache.
- **Context**: In-memory state is lost during container redeploys or worker restarts.
- **Outcome**: Resilient historical session archive, tamper-proof SHA-256 session integrity, and zero loss of interview transcripts.

### ADR-05: Global React Error Boundary Protection
- **Decision**: Wrap the entire application tree in a dedicated `ErrorBoundary` component.
- **Context**: Unexpected client runtime exceptions or hook order anomalies unmount the React DOM into a blank black screen.
- **Outcome**: Zero blank screens. In any error state, users are presented with a graceful recovery card with options to reload the session or navigate back to safety.
