# 🤝 Contributing to Apex Interview AI

Thank you for your interest in contributing to **Apex Interview AI**! We welcome contributions from engineers, researchers, and designers passionate about real-time voice AI, distributed systems, and interview preparation.

---

## 📋 Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment. All contributors and maintainers are expected to treat everyone with respect and professional courtesy.

---

## 🛠️ Development Workflow

### 1. Fork & Clone
```bash
git clone https://github.com/<your-username>/ai-mock-interview-system.git
cd ai-mock-interview-system
```

### 2. Branch Naming Conventions
Create a descriptive branch for your work:
- `feat/voice-vad-optimization` — New features or architectural additions
- `fix/ledger-timestamp-format` — Bug fixes
- `perf/blueprint-cache-sqlite` — Performance optimizations
- `docs/update-architecture-adr` — Documentation improvements
- `test/e2e-audio-turn-cases` — Adding or expanding tests

```bash
git checkout -b feat/your-feature-name
```

---

## 🧪 Testing Requirements

Before opening a pull request, you **must** verify that all automated tests pass and the production bundle compiles with zero errors:

### Backend Tests:
```bash
cd backend
source venv/bin/activate    # or venv\Scripts\activate on Windows
python -m unittest discover tests -v
```
*All 29 tests must pass (`OK`).*

### Frontend Build & Lint:
```bash
cd frontend
npm run lint
npm run build
```
*Must build cleanly with zero TypeScript errors.*

---

## 📝 Commit Message Guidelines

We adhere to the [Conventional Commits](https://www.conventionalcommits.org/) specification:
- `feat(blueprint): add support for custom startup interview tracks`
- `fix(interview): fix React hook order in Interview and add global ErrorBoundary`
- `perf(vad): reduce trailing silence boundary from 300ms to 200ms`
- `docs(readme): expand API reference and quickstart commands`
- `test(ledger): add SHA-256 session integrity digest verification test`

---

## 🛡️ Security & Secret Management

- **NEVER** commit `.env` files, API keys (Groq, LiveKit, Gemini, Firebase), private tokens, or credentials to Git.
- All secrets must be kept strictly in `.env` files which are included in `.gitignore`.
- If you discover a security vulnerability, please report it privately via GitHub Security Advisories rather than opening a public issue.

---

## 📬 Submitting a Pull Request

1. Push your branch to your GitHub fork:
   ```bash
   git push origin feat/your-feature-name
   ```
2. Open a Pull Request against the `main` branch.
3. Provide a clear summary of the changes, the problem solved, and verification evidence (test outputs or screenshots).
4. A maintainer will review your PR and provide feedback.

---

## ⚖️ Mandatory Attribution & Derivative Works Policy

If you fork, adapt, benchmark, build upon, or reference this codebase or its underlying architectural concepts (including the *Append-Only SQLite Turn Ledger*, the *Anti-Phantom Evaluation Protocol*, the *Dynamic Blueprint Engine*, or the *Sub-650ms WebRTC Voice Pipeline*):

1. **Mandatory Credit**: You **MUST** provide clear, prominent credit to **Aarit Mehta** as the original creator.
2. **Visible Repository Link**: You **MUST** link back directly to this original repository in your `README.md`, documentation, or publication:  
   `https://github.com/aaritmehta15/ai-mock-interview-system`
3. **Academic & Commercial Integrity**: You may **NOT** republish this project or its architecture as entirely your own work for academic submissions, competitions, or commercial products without explicit attribution.

