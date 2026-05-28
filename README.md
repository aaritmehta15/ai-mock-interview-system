# 🎙️ AI Voice Mock Interview System

> **Speak your answers. Get real feedback. Ace the interview.**

An AI-powered voice mock interview system that scrapes real interview questions from the web for any company and role, conducts a live voice interview, gives structured per-answer feedback, and generates a detailed performance report at the end.

---

## ✨ Features

- 🔍 **Real Question Scraping** — Fetches actual interview questions asked at your target company/role from DuckDuckGo, Bing, and Google, then refines them with Groq AI
- 🎙️ **Voice Interview** — Speak your answers using your microphone; live transcription shows your words in real time
- 🤖 **Alex the Interviewer** — AI persona that stays in character, gives honest feedback, refuses to give away answers, and redirects off-topic responses
- 📊 **Structured Feedback** — After each answer: what was **good**, what was **missing**, and one **improvement tip**
- 📋 **Detailed Report** — Overall score (0–100), strengths, weaknesses, per-question analysis, and hire/no-hire recommendation
- 🔐 **Google Sign-In** — Firebase Authentication
- 🌙 **Dark / Light Mode** — Persisted across sessions

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Vanilla CSS (no Tailwind) |
| Auth | Firebase Authentication (Google Sign-In) |
| Backend | Python · FastAPI · Uvicorn |
| AI | Groq (llama-3.3-70b-versatile + llama-3.1-8b-instant) |
| Scraping | httpx + BeautifulSoup4 |
| Persistence | Firebase Firestore (in-memory fallback if not configured) |
| Voice | Web Speech API (browser-native, no third-party) |

---

## 📁 Project Structure

```
ai-mock-interview-system/
├── backend/
│   ├── main.py              ← FastAPI app (3 endpoints)
│   ├── interviewer.py       ← Alex AI interviewer logic (Groq)
│   ├── scraper.py           ← Multi-source question scraper
│   ├── config.py            ← Environment config
│   ├── requirements.txt
│   ├── .env.example         ← Copy to .env and fill in your keys
│   └── services/
│       ├── firebase_service.py   ← Interview score persistence
│       └── groq_service.py
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.tsx    ← Sign-in page
│   │   │   ├── Dashboard.tsx  ← Home after login
│   │   │   └── Interview.tsx  ← The full interview experience
│   │   ├── context/
│   │   │   ├── AuthContext.tsx
│   │   │   └── ThemeContext.tsx
│   │   └── lib/
│   │       ├── api.ts         ← Backend API client
│   │       └── firebase.ts    ← Firebase config
│   ├── .env.example           ← Copy to .env and fill in your keys
│   └── package.json
│
└── .gitignore
```

---

## 🚀 Setup & Run

### Prerequisites
- Python 3.10+
- Node.js 18+
- [Groq API key](https://console.groq.com/keys) (free tier works great)
- Firebase project with Google Sign-In enabled

---

### 1. Clone the repo

```bash
git clone https://github.com/aaritmehta15/ai-mock-interview-system.git
cd ai-mock-interview-system
```

---

### 2. Backend setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
copy .env.example .env       # Windows
# cp .env.example .env       # macOS/Linux

# Edit .env and add your GROQ_API_KEY
```

Your `backend/.env` should look like:
```env
GROQ_API_KEY=gsk_your_actual_groq_key_here
FIREBASE_PROJECT_ID=your-firebase-project-id
```

```bash
# Start the backend
uvicorn main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

---

### 3. Frontend setup

```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
copy .env.example .env       # Windows
# cp .env.example .env       # macOS/Linux

# Edit .env and add your Firebase config
```

Your `frontend/.env` should look like:
```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:...
VITE_API_BASE=http://localhost:8000
```

```bash
# Start the frontend
npm run dev
```

App runs at: http://localhost:5173

---

## 🔑 Getting Your API Keys

### Groq (AI engine)
1. Go to https://console.groq.com/keys
2. Create a free API key
3. Paste into `backend/.env` as `GROQ_API_KEY`

### Firebase (Auth + optional persistence)
1. Go to https://console.firebase.google.com
2. Create a project → Add Web App → Copy the config object → paste into `frontend/.env`
3. Enable **Google Sign-In**: Authentication → Sign-in method → Google → Enable
4. *(Optional, for score persistence)* Enable **Cloud Firestore** → Create database

---

## 🎮 How to Use

1. **Sign in** with Google
2. **Enter company + role** (e.g., "Google" + "SDE")
3. Click **"Fetch Real Questions"** — wait ~10 seconds for scraping
4. Click **"Start Interview"** — Alex greets you and asks the first question aloud
5. Click the 🎙️ **mic button** to record your answer
6. Click the 🎙️ button again to **stop recording**
7. Alex processes your answer and gives **structured feedback**
8. Click **"Next Question"** to continue — or **"Stop & Summarise"** anytime
9. At the end, get your full **performance report**

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/interview/scrape-questions` | Scrape + generate question bank |
| POST | `/interview/chat` | Single interview turn (answer → feedback + next question) |
| POST | `/interview/summary` | Generate full post-interview report |

Full interactive docs: http://localhost:8000/docs

---

## ⚠️ Important Notes

- **Voice recognition** requires Chrome or Edge (Web Speech API)
- The scraper uses public search engines — rate limiting may occasionally occur; it retries automatically
- Firebase Firestore is **optional** — scores are stored in-memory if not configured (fully functional without it)
- Never commit `.env` files or `firebase_credentials.json` — both are in `.gitignore`

---

## 🤝 Contributing

Pull requests welcome! For major changes, open an issue first.

---

## 📄 License

MIT
