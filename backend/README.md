# ⚙️ Apex Interview AI — Backend & AI Systems Architecture
### *High-Performance FastAPI REST Service & LiveKit Agents Voice Engine*

The backend of **Apex Interview AI** is an asynchronous Python service architected for high-concurrency voice streaming, deterministic evaluation grounding, and low-memory free-tier cloud deployment.

---

## 🏗️ Architecture Overview

The backend is composed of two decoupled runtime processes:
1. **FastAPI Web Service (`main.py` / `run_server.py`)**:
   - Handles intake, PDF resume parsing, blueprint synthesis, WebRTC JWT token generation, session ledger auditing, and post-interview evaluation dossiers.
   - Operates at **~95 MB RAM** (well within Render's 512 MB ceiling), completely immune to OOM crashes (`SIGKILL 137`).
2. **LiveKit Voice Agent Worker (`agent.py`)**:
   - Connects outbound via WebSockets to LiveKit Cloud.
   - Manages real-time WebRTC audio streams, Silero Voice Activity Detection (VAD), proactive interviewer greetings, and live turn logging into the SQLite ledger.

---

## 📁 Source Code Organization

```
backend/
├── orchestrator/
│   ├── personas.py              # Behavioral & psychological profiles (Alex, Marcus, Priya)
│   ├── state_graph.py           # Multi-turn cyclical state machine (LangGraph pattern)
│   └── sweet_spot.py            # Dynamic assessment score & confidence movement tracker
│
├── services/
│   ├── blueprint_service.py     # PDF parsing, enterprise track synthesis & multi-LLM fallback
│   ├── ledger_service.py        # Append-only SQLite Turn Ledger & SHA-256 session integrity
│   └── evaluation_service.py    # Anti-phantom binary assertion evaluation & dossier generation
│
├── models/
│   └── schemas.py               # Pydantic v2 domain models, enums, and API contracts
│
├── tests/
│   └── test_services_engine.py  # 29 Comprehensive unit, ledger, API, and anti-phantom tests
│
├── agent.py                     # LiveKit Agents WebRTC worker with Silero VAD
├── main.py                      # FastAPI application, route handlers, and middleware
├── run_server.py                # Isolated web service runner for cloud deployments
├── config.py                    # Environment variable loader and type-safe settings
└── requirements.txt             # Pinned Python package dependencies
```

---

## 🛡️ Core Systems & Services

### 1. SQLite Turn Ledger (`services/ledger_service.py`)
To prevent hallucinated evaluation reports, all conversation turns are logged to an append-only SQLite database (`ledger.db`):
- **Verification Rule**: Turns are marked as `verified = 1` if `word_count >= 10` and `confidence >= 0.5`.
- **Cryptographic Audit Digest**:
  ```python
  def compute_session_hash(session_id: str) -> str:
      """Generates an immutable SHA-256 hash across all chronological turns."""
  ```
- **Active Blueprint Association**: Persists candidate target company, role, seniority, and selected persona across backend restarts.

### 2. Dynamic Blueprint Engine (`services/blueprint_service.py`)
Generates structured, calibrated interview blueprints containing questions, competencies, and **Binary Assertions** (verifiable pass/fail requirements):
- **PDF Resume Extraction**: Utilizes `pypdf` for fast, local text extraction from uploaded candidate resumes.
- **Enterprise Track Customization**: Tailors the depth and style of questions based on candidate target company:
  - *Big Tech (FAANG)*: Deep distributed consensus, high scale ($100\text{k}+ \text{QPS}$), fault tolerance.
  - *Specialized Tech (Databricks, Uber)*: Low-level concurrency, LSM trees, parquet storage, real-time streaming.
  - *IT Consulting (TCS, Infosys, Wipro)*: Core Java/Python OOP, SQL normalization, REST design, enterprise security.
  - *Startups*: Full-stack agility, schema migrations, fast iteration trade-offs.
- **Multi-Model LLM Resilience Matrix**:
  1. `openai/gpt-oss-120b` (Primary high-reasoning model)
  2. `openai/gpt-oss-20b` (Secondary fallback)
  3. `qwen/qwen3.8-27b` (High-speed tertiary model)
  4. Local Deterministic Fallback (Guarantees zero-failure operation even during upstream API outages)

### 3. Anti-Phantom Evaluation Service (`services/evaluation_service.py`)
The evaluation service queries the **SQLite Turn Ledger first**:
1. It retrieves all verified turns spoken by both the candidate and interviewer.
2. If a blueprint question was never asked aloud by the interviewer, it is flagged as:
   `status = "UNREACHED", score = 0.0, weight = 0.0`
   and mathematically excluded from penalizing the candidate.
3. For every asked question, the candidate's verified turns are evaluated against each **Binary Assertion**.
4. Extracts **verbatim quotes** from the transcript as cryptographic evidence for the final scorecard.
5. Computes calibrated scores across 4 competencies:
   - Data Structures & Algorithms (DSA)
   - System Design & Scalability
   - Communication Clarity & Scaffolding
   - Architectural Trade-off Intuition
6. Emits a definitive Hiring Committee recommendation: `STRONG HIRE`, `HIRE`, `BORDERLINE`, or `NO HIRE`.

### 4. Calibrated Personas (`orchestrator/personas.py`)
Defines the distinct psychometric profiles:
- **Alex Rivera** (`alex`): Engineering Lead · Moderate Rigor · 4.5s Pause Tolerance · 0.5s Thinking Delay · Scaffolding Hints.
- **Marcus Vance** (`marcus`): Principal Staff Architect · High Rigor · 2.5s Pause Tolerance · 2.0s Thinking Delay (Note-Taking) · Edge-Case Grilling.
- **Priya Sharma** (`priya`): VP of Platform Engineering · Elite Rigor · 2.0s Pause Tolerance · 0.2s Thinking Delay · High Velocity & Big-O Bounds.

---

## 🌐 API Specifications & Endpoints

### System & Health
- `GET /` — Root status JSON
- `GET /health` & `GET /api/health` — Health check endpoint (HTTP 200)

### Personas
- `GET /api/personas` — Returns all registered interviewer personas with voice models, pause tolerances, and accent tokens.

### Blueprint & Intake
- `POST /api/blueprint` — Synthesizes a calibrated blueprint from structured JSON.
- `POST /api/blueprint/upload` — Accepts `multipart/form-data` with candidate PDF resume.
- `GET /api/blueprint/{session_id}` — Retrieves active blueprint for a given session.

### WebRTC Token Dispenser
- `POST /api/token` — Generates a signed LiveKit WebRTC access token (JWT) with video/audio grants and participant metadata.

### Ledger & Audit
- `POST /api/ledger/turn` — Appends a single turn event to the SQLite database.
- `GET /api/ledger/{session_id}` — Returns all chronological turns, asked question indices, and the SHA-256 session integrity hash.

### Evaluation
- `POST /api/evaluate/{session_id}` — Triggers anti-phantom evaluation and generates the Staff Hiring Committee Evidence Dossier.

### History & Archive
- `GET /api/history` — Lists historical sessions with overall scores and recommendations.
- `GET /api/history/{session_id}` — Retrieves detailed session dossier with blueprint and turns.
- `DELETE /api/history/{session_id}` — Deletes session and associated ledger turns.

---

## 🧪 Automated Test Suite

Apex Interview AI maintains a rigorous test suite (`backend/tests/test_services_engine.py`):

```bash
# Activate your virtual environment
source venv/bin/activate    # or venv\Scripts\activate on Windows

# Execute all tests
python -m unittest discover backend/tests -v
```

### Coverage Highlights:
- **Ledger Verification**: Tests turn insertion, verified turn filtering, session upsert, and SHA-256 hash consistency.
- **Blueprint Synthesis**: Tests resume PDF text extraction, structured JSON generation, company-specific tracks, and multi-model fallback resilience.
- **Anti-Phantom Evaluation**: Tests that unreached questions receive weight $0.0$ and do not penalize the overall score.
- **End-to-End API Flow**: Tests blueprint generation $\to$ token issuance $\to$ turn recording $\to$ ledger auditing $\to$ evaluation synthesis.

---

## 🚀 Running Locally

```bash
# 1. Start FastAPI backend
python run_server.py

# 2. In a separate terminal, launch the LiveKit voice agent worker
python agent.py start
```
