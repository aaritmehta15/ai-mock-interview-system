# DAAZLING Production Cloud Deployment Runbook

This guide covers deploying the **DAAZLING AI Mock Interview System** to production across cloud infrastructure:
- **Backend REST API & Orchestration**: Render, Koyeb, Railway, or AWS/GCP (Docker).
- **Voice Agent Worker**: LiveKit Cloud + LiveKit Agent Runner (Python 3.11).
- **Frontend SPA**: Vercel, Netlify, or Cloudflare Pages.

---

## 1. System Architecture & Component Roles

```
 ┌─────────────────────────────────────────────────────────┐
 │                   Frontend (Vite / React)               │
 │               Hosted on Vercel / Cloudflare             │
 └─────────────┬─────────────────────────────┬─────────────┘
               │ HTTP REST                   │ WebRTC Audio
               ▼                             ▼
 ┌───────────────────────────┐ ┌───────────────────────────┐
 │  Backend API (FastAPI)    │ │   LiveKit Cloud WebRTC    │
 │  - Session Blueprinting   │ │   - Low Latency Audio     │
 │  - Turn Ledger Store      │ │   - Room Dispatching      │
 │  - Grounded Dossier Eval  │ │   - Opus 32kbps Bitrate   │
 └───────────────────────────┘ └─────────────┬─────────────┘
                                             │ Real-time Stream
                                             ▼
                               ┌───────────────────────────┐
                               │ LiveKit Agent Worker      │
                               │ - Gemini Realtime Voice   │
                               │ - Silero Voice Activity   │
                               │ - Turn Ledger Appender    │
                               └───────────────────────────┘
```

---

## 2. Environment Variables Matrix

### Backend API & Worker Variables

| Variable | Required | Description | Example / Notes |
| :--- | :---: | :--- | :--- |
| `GROQ_API_KEY` | **Yes** | Groq Cloud API key for Llama 3.3 / Qwen / DeepSeek-R1 inference | `gsk_...` |
| `GEMINI_API_KEY` | **Yes** | Google Gemini API key for multimodal voice streaming & blueprint synthesis | `AIzaSy...` |
| `LIVEKIT_URL` | **Yes** | LiveKit Cloud WebSocket URL | `wss://your-subdomain.livekit.cloud` |
| `LIVEKIT_API_KEY` | **Yes** | LiveKit Project API Key | `API...` |
| `LIVEKIT_API_SECRET` | **Yes** | LiveKit Project API Secret | `secret...` |
| `PORT` | Auto | Port assigned by cloud host (Render, Koyeb, etc.) | `8000` or `$PORT` |
| `APP_ENV` | Optional | Application runtime environment | `production` |
| `LOG_LEVEL` | Optional | Logging level | `INFO` |
| `FIREBASE_CREDENTIALS_JSON`| Optional | Raw JSON service account string for Firestore persistence | If omitted, in-memory store is used seamlessly |
| `FIREBASE_PROJECT_ID` | Optional | Google Cloud / Firebase project ID | `ai-mock-interview-system` |

### Frontend Variables (Vercel / Netlify)

| Variable | Required | Description | Example |
| :--- | :---: | :--- | :--- |
| `VITE_API_URL` | **Yes** | Public URL of the deployed backend API | `https://daazling-interview-api.onrender.com` |
| `VITE_LIVEKIT_URL`| Optional | Default LiveKit Cloud WebSocket URL | `wss://your-subdomain.livekit.cloud` |

---

## 3. Backend Deployment (Option A: Render Blueprint)

The repository includes a ready-to-use [`render.yaml`](./render.yaml) configuration.

### Steps:
1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** → **Blueprint**.
3. Connect your repository (`ai-mock-interview-system`).
4. Render will detect `render.yaml` and provision:
   - **`daazling-interview-api`** (FastAPI Web Service)
   - **`daazling-livekit-worker`** (LiveKit Python Agent Worker)
5. Fill in the secret environment variables (`GROQ_API_KEY`, `GEMINI_API_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) in the Render interface.
6. Click **Apply**.

### Single-Container Deployment (Render Free Tier / Koyeb):
If you want to run both the REST API and the Voice Agent inside a **single container** to stay within free-tier limits:
- Use `python run_server.py` as your start command.
- Set `RUN_LIVEKIT_WORKER=true`.
- The built-in supervisor will start both the Uvicorn web server and the LiveKit worker, monitoring health and capturing graceful shutdowns.

---

## 4. Backend Deployment (Option B: Docker / Container)

The repository includes a production-ready [`backend/Dockerfile`](./backend/Dockerfile) with audio and WebRTC dependencies (`ffmpeg`, `libasound2`, `libopus0`).

### Build and Run Locally:
```bash
cd backend
docker build -t daazling-backend .
docker run -p 8000:8000 \
  -e GROQ_API_KEY="your-groq-key" \
  -e GEMINI_API_KEY="your-gemini-key" \
  -e LIVEKIT_URL="wss://your-project.livekit.cloud" \
  -e LIVEKIT_API_KEY="your-api-key" \
  -e LIVEKIT_API_SECRET="your-api-secret" \
  daazling-backend
```

### Deploy to Koyeb / Railway:
1. Connect your GitHub repository.
2. Select **Dockerfile** as the build method (path: `backend/Dockerfile`).
3. Set environment variables.
4. Set health check path to `/health` on port `8000`.

---

## 5. Frontend Deployment (Vercel)

The repository contains [`vercel.json`](./vercel.json) configured for single-page app (SPA) client-side routing.

### Steps:
1. Log in to [Vercel](https://vercel.com/) and click **Add New Project**.
2. Import your GitHub repository.
3. If setting root directory:
   - Set **Root Directory** to `frontend` (or keep root with default `vercel.json`).
   - Framework Preset: **Vite**.
4. In **Environment Variables**, add:
   ```
   VITE_API_URL = https://your-deployed-backend.onrender.com
   ```
5. Click **Deploy**.

---

## 6. LiveKit Cloud Setup

1. Sign up for free at [LiveKit Cloud](https://cloud.livekit.io/).
2. Create a project named `daazling-interviewer`.
3. In **Project Settings** → **Keys**, copy:
   - `WebSocket URL` (`wss://...livekit.cloud`)
   - `API Key`
   - `API Secret`
4. Add these 3 values to your backend environment variables (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).

---

## 7. Preventing Free-Tier Sleep (Pre-Warming Keep-Alive)

Free cloud containers (Render, Koyeb) sleep after 15 minutes of inactivity. To eliminate cold-start latency during hiring manager reviews, use the built-in pre-warm script:

```bash
# Run continuous daemon pinging every 14 minutes (840s):
python backend/scripts/prewarm.py --url https://your-backend.onrender.com --interval 840

# Or trigger a single keep-alive ping (ideal for GitHub Actions cron):
python backend/scripts/prewarm.py --url https://your-backend.onrender.com --once
```

---

## 8. Post-Deployment Verification Checklist

Once deployed, run through this 60-second verification sequence:

- [ ] **Health Endpoint**: Visit `https://<your-backend>/health` → returns `{"status":"ok","module":"voice-interview","version":"2.1.0"}`.
- [ ] **Persona API**: Visit `https://<your-backend>/api/personas` → returns 3 calibrated personas (Alex, Marcus, Priya).
- [ ] **SPA Routing**: Navigate directly to `https://<your-frontend>/interview` and press Refresh (F5) → page loads cleanly without 404.
- [ ] **LiveKit Token Generation**: Click "Generate Architecture Blueprint" on the Studio Intake screen → returns 3 questions and generates room token.
- [ ] **Live Audio Stream**: Enter the Voice Studio and verify that the LiveKit telemetry pill displays active RTT and audio level indicators.
