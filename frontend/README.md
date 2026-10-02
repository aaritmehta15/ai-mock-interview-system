# 🖥️ Apex Interview AI — Frontend Studio Architecture
### *Modern React 18 + TypeScript + Vite WebRTC Sound Studio*

The frontend of **Apex Interview AI** is an enterprise-grade Single Page Application (SPA) designed with a strict **anti-AI-slop** design philosophy inspired by Linear, Stripe, and Raycast. It delivers sub-second WebRTC audio feedback, real-time reactive sound studio visualizers, and a distraction-free interview environment.

---

## 🏗️ Architecture & Core Principles

1. **Progressive Disclosure UX**:
   Rather than overwhelming the candidate with PDF uploaders, system prompt controls, WebRTC settings, and live scoring widgets simultaneously, the platform guides the user through distinct, cognitively focused stages:
   - **Gateway & Tour** (`/`, `/login`) $\to$ **Intake & Blueprint Generator** (`/intake`) $\to$ **Focused Voice Studio** (`/interview`) $\to$ **Hiring Committee Dossier** (`/evaluation/{id}`) $\to$ **Session History Archive** (`/history`).
2. **Vanilla CSS Design System**:
   Zero reliance on TailwindCSS or heavy UI component libraries. All styling is implemented using custom CSS variables (design tokens) in `src/index.css`:
   - Dark Obsidian Base: `#08090d`
   - Dark Slate Elevation: `#11131b`
   - Zinc Border Illumination: `rgba(255, 255, 255, 0.08)`
   - Accents: Emerald (`#10b981`), Amber (`#f59e0b`), Violet (`#8b5cf6`), Cyan (`#06b6d4`)
   - Typography: Google Fonts `Inter` (UI elements), `Space Grotesk` (Headers), and `JetBrains Mono` (Telemetry & Code)
3. **Defense-in-Depth Fault Tolerance**:
   Wrapped in a global React 18 `ErrorBoundary` component that intercepts render-time errors and provides graceful recovery cards with one-click session reloading.

---

## 📁 Source Code Organization

```
frontend/src/
├── components/
│   ├── AudioVisualizer.tsx     # Reactive Web Audio API spectrum bars reacting to voice
│   ├── ErrorBoundary.tsx       # React 18 error boundary with recovery action cards
│   ├── LatencyTelemetry.tsx    # Live WebRTC TTFT, VAD latency, and SHA-256 hash pill
│   ├── Layout.tsx              # Application shell, navigation header, and theme toggle
│   └── PersonaSelector.tsx     # Calibrated interviewer archetype audition showroom
│
├── pages/
│   ├── Landing.tsx             # Interactive platform tour & 1-click guest entry
│   ├── Login.tsx               # Google OAuth portal with guest bypass
│   ├── Intake.tsx              # Drag-and-drop PDF resume intake & blueprint customizer
│   ├── Interview.tsx           # Focused LiveKit WebRTC sound studio
│   ├── Evaluation.tsx          # Staff Hiring Committee Dossier & radar chart breakdown
│   └── History.tsx             # Historical sessions ledger archive with PDF/JSON export
│
├── context/
│   ├── AuthContext.tsx         # User authentication state & Firebase Google Sign-In
│   ├── ThemeContext.tsx        # Dark / Light theme persistence controller
│   └── InterviewContext.tsx    # Active session ID, blueprint cache, and report state
│
├── lib/
│   ├── api.ts                  # Fully typed REST API client for backend communication
│   └── firebase.ts             # Firebase client SDK initialization (optional auth)
│
├── App.tsx                     # React Router 6 route declarations wrapped in ErrorBoundary
├── main.tsx                    # Vite React application entrypoint
└── index.css                   # Obsidian/Zinc design tokens, reset, and utility classes
```

---

## 🎙️ Live WebRTC Voice Studio (`Interview.tsx`)

The interview room is built with `@livekit/components-react` providing:
- **Full-Duplex Audio**: Low-latency bidirectional audio streaming over WebSockets and WebRTC data channels.
- **Audio Spectrum Visualizer**: Renders real-time reactive audio frequency bars for both the candidate's microphone input and the incoming interviewer audio stream.
- **Real-Time Latency Telemetry**: Floating telemetry pill tracking:
  - **TTFT** (Time to First Token) $<650\text{ms}$
  - **VAD Silence Boundary**: $200\text{ms}$
  - **Opus Stream Bitrate**: $32\text{ kbps}$ with $0\%$ packet loss
  - **Ledger Hash**: Truncated SHA-256 session integrity digest
- **Prompt Helper Chips**: Quick-tap conversational cues ("Could you elaborate?", "Give me a second", "Let's move on").

---

## 📊 Hiring Committee Dossier (`Evaluation.tsx`)

Once a session is concluded, the frontend fetches the evaluation report from `/api/evaluate/{session_id}`:
- **Executive Recommendation Badge**: Distinct color-coded pills for `STRONG HIRE`, `HIRE`, `BORDERLINE`, and `NO HIRE`.
- **Competency Radar & Breakdown**: Visual breakdown across DSA, System Design, Communication Clarity, and Architectural Trade-off Intuition.
- **Assertion-by-Assertion Verification**: Displays each blueprint question, its verified binary assertions (Passed / Failed), and **exact verbatim candidate quotes** extracted by the evaluation service.
- **Anti-Phantom Safety**: Automatically identifies any unreached questions and marks them as `UNREACHED` (weight $0.0$) with an informative callout banner.

---

## ⚙️ Configuration & Environment Variables

Copy `.env.example` to `.env` in the `frontend` root:
```bash
copy .env.example .env    # Windows
cp .env.example .env      # macOS/Linux
```

### Supported Variables:
| Variable | Description | Default |
| :--- | :--- | :--- |
| `VITE_API_BASE` | Base URL of the FastAPI backend | `http://localhost:8000` |
| `VITE_API_URL` | Fallback API URL alias | `http://localhost:8000` |
| `VITE_FIREBASE_API_KEY` | *(Optional)* Firebase API key for Google OAuth | `""` |
| `VITE_FIREBASE_AUTH_DOMAIN` | *(Optional)* Firebase auth domain | `""` |
| `VITE_FIREBASE_PROJECT_ID` | *(Optional)* Firebase project identifier | `""` |

*Note: If Firebase credentials are omitted, the application automatically enables Guest Mode with full feature availability.*

---

## 🛠️ Available Scripts

In the `frontend` directory:

```bash
# Start local Vite development server with HMR
npm run dev

# Compile TypeScript and create production bundle
npm run build

# Preview the production build locally
npm run preview

# Run ESLint across TypeScript components
npm run lint
```

---

## 🚢 Production Deployment

The frontend deploys as a static Single Page Application (SPA) on **Vercel**:
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Single Page App Routing**: Configured via `vercel.json` rewrites ensuring deep links (e.g. `/evaluation/:session_id`) resolve to `index.html`.
