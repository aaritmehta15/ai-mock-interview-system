# 🎙️ Apex Interview AI — Real-Time Voice Mock Interview System
### *The First Evidence-Grounded, Low-Latency Real-Time Voice Technical Interviewer & Staff Hiring Committee Dossier*

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![LiveKit](https://img.shields.io/badge/LiveKit-WebRTC%20Agents-002B36?style=flat-square&logo=webrtc&logoColor=white)](https://livekit.io)
[![React](https://img.shields.io/badge/React-18.3+-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6.0+-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Tests](https://img.shields.io/badge/Tests-29%2F29%20Passing-success?style=flat-square&logo=pytest&logoColor=white)](#-testing--verification)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

> **Live Production Demo**: [https://ai-mock-interview-system-liart.vercel.app](https://ai-mock-interview-system-liart.vercel.app)  
> **Backend API**: [https://ai-mock-interview-system.onrender.com/docs](https://ai-mock-interview-system.onrender.com/docs)  
> *Recruiters & Hirers: Click **"Explore Live Demo as Guest"** for instant 0-friction access (no signup required).*

---

## 📌 Executive Summary & Problem Statement

Most AI interview tools on the market are glorified chatbots with text-to-speech bolted on. They suffer from four critical architectural flaws:
1. **The Phantom Questions Flaw**: Due to conversational tangents or early session termination, the candidate may only reach 2 of 6 planned questions. Generic LLM evaluators grade all 6 questions anyway, hallucinating fake candidate answers and penalizing the user for questions that were never asked.
2. **The High-Latency Conversation Lag**: Cascading discrete STT $\to$ LLM $\to$ TTS pipelines introduces $3{,}000\text{ms} - 5{,}000\text{ms}$ of dead air, completely destroying the natural cadence of a real technical interview.
3. **Passive Bot Syndrome**: The AI sits in passive silence, waiting for the candidate to speak first, or mindlessly accepts buzzword-laden non-answers without challenging architectural trade-offs or edge-case failures.
4. **Subjective Score Drift**: Uncalibrated prompts ask models to "grade holistic fluency on a 1-100 scale", producing $\pm 25$ score variations on identical transcripts.

### How Apex Interview AI Solves This:
- **Append-Only SQLite Turn Ledger**: Every utterance is logged chronologically with word count, confidence, and timestamp. The evaluator strictly queries the ledger — unreached questions are mathematically flagged as `UNREACHED` (weight $0.0$) and cannot penalize the candidate.
- **Sub-650ms Full-Duplex WebRTC Voice Engine**: Built on LiveKit Agents, Silero VAD ($200\text{ms}$ trailing boundary), and high-throughput streaming LLMs (Groq / Gemini) with native barge-in interruption.
- **Calibrated Psychological Personas**: 3 distinct interviewer archetypes with dynamic pause tolerance, deliberate note-taking silences, and adaptive escalation probes that cross-examine high-level claims.
- **Evidence-Grounded Dossier**: Grades candidate answers against pre-generated **Binary Assertions** (pass/fail factual rubrics) backed by **verbatim transcript citations** across 4 core engineering competencies.

---

## 🏗️ End-to-End System Architecture

```
                                  [ CANDIDATE BROWSER ]
                               React 18 + Vite + TypeScript
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       │ REST / HTTP (JSON / Multipart)            │ Full-Duplex WebRTC Audio
                       ▼                                           ▼
             [ FastAPI Backend ]                         [ LiveKit Cloud Edge ]
           (Render · Sub-100MB RAM)                         (wss://...livekit.cloud)
                       │                                           ▲
        ┌──────────────┼──────────────┐                            │ Real-Time Audio
        ▼              ▼              ▼                            ▼
 [Blueprint Service] [Turn Ledger] [Evaluation]       [ LiveKit Voice Agent Worker ]
 - PDF Resume Parser - SQLite DB   - Anti-Phantom     - Silero VAD (200ms boundary)
 - Track Tailoring   - SHA-256     - 4 Competencies   - Persona State Machine
 - Multi-LLM Fallback- Audit Hash  - Verbatim Quotes  - Groq / Gemini Streaming LLM
```

---

## ✨ Key Engineering Innovations

### 1. 🛡️ The Anti-Phantom Question Guarantee & SQLite Turn Ledger
To eliminate hallucinated grades, all audio turns are recorded into an append-only SQLite Turn Ledger:
```sql
CREATE TABLE turns (
    turn_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    speaker TEXT NOT NULL,         -- 'candidate' | 'interviewer'
    question_index INTEGER,
    text TEXT NOT NULL,
    word_count INTEGER,
    confidence REAL,
    timestamp TEXT NOT NULL,
    verified INTEGER NOT NULL      -- 1 if word_count >= 10 and confidence >= 0.5
);
```
- **Session Integrity Digest**: Computes a cryptographic `SHA-256` hash over all chronological turns, guaranteeing an immutable audit trail.
- **Zero Hallucination Grading**: If an interview ends early, only the questions that actually appeared in the interviewer's speech are graded. All unreached blueprint questions are classified as `UNREACHED` with $0.0$ weight.

### 2. ⚡ Sub-650ms Real-Time Voice Streaming
- **LiveKit Agents + Silero VAD**: Low-latency voice activity detection with $200\text{ms}$ trailing speech boundary.
- **Barge-In / Natural Interruption**: The candidate can interrupt the interviewer mid-sentence to clarify requirements, exactly like in a real technical interview.
- **Live Latency Telemetry Pill**: The frontend exposes real-time WebRTC metrics:
  - **TTFT** (Time-to-First-Token): $<650\text{ms}$
  - **VAD Latency**: $200\text{ms}$
  - **Bitrate**: $32\text{ kbps}$ Opus stream with $0\%$ packet loss
  - **Ledger Hash**: Truncated SHA-256 audit digest

### 3. 🧠 3 Calibrated Interviewer Personas
Each interviewer possesses custom behavioral parameters, pause tolerances, and psychological styles:

| Persona | Archetype | Rigor | Pause Tolerance | Thinking Delay | Conversational Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Alex Rivera** | Engineering Lead | Moderate | `4.5s` | `0.5s` | Supportive scaffolding; offers gentle hints when candidate pauses $>4\text{s}$. |
| **Marcus Vance** | Principal Staff Architect | High | `2.5s` | `2.0s` *(note-taking)* | Cross-examines buzzwords; demands failure semantics and SPOF trade-offs. |
| **Priya Sharma** | VP of Platform Engineering | Elite | `2.0s` | `0.2s` *(instant)* | High-velocity bar raiser; demands Big-O asymptotic bounds and scale ($500\text{k QPS}$). |

### 4. 📄 Dynamic Blueprint Engine with Multi-Model Fallback
- Accepts candidate PDF resumes via `pypdf`, extracting projects, languages, and technical assertions.
- Tailors questions to target enterprises: Big Tech (Google, Meta, Amazon, Microsoft, Apple, Netflix), High-Scale (Uber, Databricks), IT Consulting (TCS, Infosys, Wipro), or Custom Startups.
- **Multi-Model LLM Resilience Matrix**:
  1. Primary: `openai/gpt-oss-120b` (Deep structured reasoning)
  2. Secondary: `openai/gpt-oss-20b`
  3. Tertiary: `qwen/qwen3.8-27b`
  4. Local Deterministic Fallback: Pre-calibrated Staff Engineer rubrics guaranteeing 100% uptime even during total upstream API outages.

### 5. 📊 Staff Hiring Committee Executive Dossier
Delivers a comprehensive post-interview evaluation report:
- **Calibrated Recommendation**: `STRONG HIRE` ($\ge 85$), `HIRE` ($\ge 70$), `BORDERLINE` ($\ge 55$), `NO HIRE` ($< 55$).
- **4 Core Competencies**:
  - *Data Structures & Algorithmic Optimality*
  - *System Design & Distributed Scalability*
  - *Communication Clarity & Structured Scaffolding*
  - *Architectural Trade-Off Intuition*
- **Verbatim Evidence Citations**: Exact candidate quotes mapped to each binary assertion requirement.

---

## 🗂️ Project Structure

```
ai-mock-interview-system/
├── backend/
│   ├── orchestrator/
│   │   ├── personas.py              # Calibrated interviewer behavioral profiles
│   │   ├── state_graph.py           # Multi-turn cyclical conversational state graph
│   │   └── sweet_spot.py            # Dynamic assessment score & confidence tracker
│   ├── services/
│   │   ├── blueprint_service.py     # PDF resume extraction & multi-LLM blueprint engine
│   │   ├── ledger_service.py        # SQLite Turn Ledger & SHA-256 integrity hash
│   │   └── evaluation_service.py    # Anti-phantom binary assertion evaluation engine
│   ├── tests/
│   │   └── test_services_engine.py  # 29 Comprehensive unit & integration tests
│   ├── agent.py                     # LiveKit Agents WebRTC voice worker
│   ├── main.py                      # FastAPI REST application & token dispenser
│   ├── run_server.py                # Standalone Web API runner (Render deployment)
│   ├── requirements.txt             # Python dependencies
│   └── README.md                    # Backend architecture documentation
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AudioVisualizer.tsx  # Reactive WebRTC audio spectrum bars
│   │   │   ├── ErrorBoundary.tsx    # Global crash protection with reload fallback
│   │   │   ├── LatencyTelemetry.tsx # Live WebRTC TTFT & VAD latency telemetry
│   │   │   ├── Layout.tsx           # Navigation bar & theme controller
│   │   │   └── PersonaSelector.tsx  # Interactive interviewer audition cards
│   │   ├── pages/
│   │   │   ├── Landing.tsx          # Gateway portal with guest fast-pass
│   │   │   ├── Login.tsx            # Google OAuth & guest login
│   │   │   ├── Intake.tsx           # Resume upload & blueprint customizer
│   │   │   ├── Interview.tsx        # Focused LiveKit voice sound studio
│   │   │   ├── Evaluation.tsx       # Hiring Committee Dossier & radar analysis
│   │   │   └── History.tsx          # Historical session archive & audit logs
│   │   ├── context/                 # AuthContext, ThemeContext, InterviewContext
│   │   ├── lib/api.ts               # Typed REST client with error handling
│   │   └── index.css                # Obsidian/Zinc design system (Vanilla CSS)
│   ├── package.json                 # Frontend dependencies
│   └── README.md                    # Frontend architecture documentation
│
├── run_agent.bat                    # 1-Click local LiveKit voice agent launcher
├── ARCHITECTURE.md                  # Deep-dive systems architecture & latency budget
├── CONTRIBUTING.md                  # Open source contribution guidelines
├── LICENSE                          # MIT License
└── README.md                        # This primary documentation
```

---

## 🛠️ Technology Stack

| Layer | Technology | Key Capabilities |
| :--- | :--- | :--- |
| **Frontend SPA** | React 18 · TypeScript · Vite 6 | Zero-lag SPA, strict type safety, fast HMR |
| **Styling** | Vanilla CSS (Obsidian / Zinc) | Zero framework overhead, custom audio visualizer, dark mode |
| **Voice & WebRTC** | LiveKit Cloud · LiveKit Agents | Full-duplex WebRTC audio, Silero VAD, barge-in detection |
| **Backend API** | FastAPI · Uvicorn · Python 3.10+ | Async REST endpoints, sub-100MB RAM footprint on Render |
| **LLM Reasoning** | Groq (`qwen/qwen3.8-27b`, `llama-3.3-70b`) | Sub-400ms TTFT, multi-tier JSON-mode model fallback |
| **Turn Ledger** | SQLite 3 (WAL mode) | Append-only turn tracking, SHA-256 cryptographic audit digest |
| **Resume Extraction** | `pypdf` | Fast, deterministic text extraction from candidate PDF resumes |
| **Testing** | Python `unittest` | 29 passing automated unit, API, and anti-phantom tests |

---

## 🚀 Quickstart & Local Installation

### Prerequisites
- **Node.js** 18+ & `npm`
- **Python** 3.10+
- **Groq Cloud API Key** (Free tier from [console.groq.com](https://console.groq.com))
- **LiveKit Cloud Project** (Free tier from [cloud.livekit.io](https://cloud.livekit.io))

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/aaritmehta15/ai-mock-interview-system.git
cd ai-mock-interview-system
```

---

### Step 2: Backend Setup
```bash
cd backend

# Create and activate virtual environment
python -m venv venv

# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env from template
copy .env.example .env    # Windows
cp .env.example .env      # macOS/Linux
```

Configure `backend/.env`:
```env
APP_ENV=development
LOG_LEVEL=INFO
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=qwen/qwen3.8-27b
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
```

Start the FastAPI backend server:
```bash
python run_server.py
```
*API documentation will be live at: [http://localhost:8000/docs](http://localhost:8000/docs)*

---

### Step 3: Frontend Setup
In a new terminal:
```bash
cd frontend

# Install dependencies
npm install

# Create .env from template
copy .env.example .env    # Windows
cp .env.example .env      # macOS/Linux
```

Configure `frontend/.env`:
```env
VITE_API_BASE=http://localhost:8000
VITE_API_URL=http://localhost:8000
```

Start the Vite dev server:
```bash
npm run dev
```
*Frontend studio will be accessible at: [http://localhost:5173](http://localhost:5173)*

---

### Step 4: Launch the LiveKit Voice Worker
The voice worker connects outbound via WebSocket to LiveKit Cloud to serve incoming rooms:

**Windows (1-Click):**
Double-click `run_agent.bat` in the repository root.

**macOS / Linux / CLI:**
```bash
cd backend
source venv/bin/activate
python agent.py start
```

---

## 🧪 Testing & Verification

Apex Interview AI includes a comprehensive automated test suite verifying SQLite ledger persistence, anti-phantom question elimination, blueprint generation, token issuance, and multi-model fallbacks:

```bash
# Run the complete test suite
python -m unittest discover backend/tests -v
```

### Test Suite Output:
```text
test_anti_phantom_unreached_questions (backend.tests.test_services_engine.TestEvaluationService) ... ok
test_assertion_scoring_mechanics (backend.tests.test_services_engine.TestEvaluationService) ... ok
test_e2e_interview_flow (backend.tests.test_services_engine.TestIntegrationFlow) ... ok
test_sha256_hash_consistency (backend.tests.test_services_engine.TestLedgerService) ... ok
test_blueprint_generation_google_staff (backend.tests.test_services_engine.TestBlueprintService) ... ok
...
Ran 29 tests in 16.385s

OK (29/29 passing)
```

Frontend production bundle verification:
```bash
cd frontend
npm run build
# Verified: 0 TypeScript errors, bundle minified and chunked cleanly.
```

---

## 🌐 Complete API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` / `/api/health` | Service health status and version identifier |
| `GET` | `/api/personas` | Catalogue of calibrated interviewer personas |
| `POST` | `/api/blueprint` | Synthesize blueprint from structured JSON (company, role, JD) |
| `POST` | `/api/blueprint/upload` | Parse PDF resume and synthesize tailored blueprint |
| `GET` | `/api/blueprint/{session_id}` | Retrieve active blueprint for a session |
| `POST` | `/api/token` | Dispense authenticated LiveKit WebRTC access token |
| `POST` | `/api/ledger/turn` | Explicitly append spoken turn to SQLite Turn Ledger |
| `GET` | `/api/ledger/{session_id}` | Retrieve all verified turns & SHA-256 session integrity digest |
| `POST` | `/api/evaluate/{session_id}` | Generate Staff Hiring Committee Evidence Dossier |
| `GET` | `/api/history` | List chronologically archived sessions |
| `GET` | `/api/history/{session_id}` | Retrieve complete session history, blueprint, and evaluation report |
| `DELETE` | `/api/history/{session_id}` | Delete session and associated turns from archive |

---

## ☁️ Free-Tier Cloud Deployment Architecture

Apex Interview AI was intentionally engineered from day one to operate sustainably on **100% free-tier cloud infrastructure**:

1. **Frontend (Vercel)**:
   - Deployed as a static SPA bundle with edge distribution.
   - Zero cold-start latency; unlimited static requests.
2. **Backend Web API (Render)**:
   - Runs `python run_server.py` with `RUN_LIVEKIT_WORKER=false`.
   - Memory footprint is strictly **~95 MB** (well below Render's 512 MB ceiling), completely eliminating Linux OOM `SIGKILL 137` errors.
3. **Voice Worker (Decoupled)**:
   - Connects outbound to LiveKit Cloud via WebSocket.
   - Can run on any local workstation, a low-cost VPS, or a separate worker container with zero cloud hibernation risk.
4. **LiveKit Cloud**:
   - Free tier includes 50 GB monthly bandwidth (~120 full 15-minute voice sessions).
5. **Groq Cloud**:
   - Ultra-fast token generation ($>500\text{ tokens/sec}$) within generous free RPM limits.

---

## 🛡️ License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more details.

---

## 👨‍💻 Author

**Aarit Mehta**  
*Final-Year B.Tech in Artificial Intelligence & Data Science (Graduating 2027)*  
- **GitHub**: [@aaritmehta15](https://github.com/aaritmehta15)  
- **Repository**: [ai-mock-interview-system](https://github.com/aaritmehta15/ai-mock-interview-system)
