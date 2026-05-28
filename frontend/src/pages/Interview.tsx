import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, StopCircle, SkipForward, RotateCcw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { scrapeInterviewQuestions, interviewChat, interviewSummary } from '../lib/api';

// ─── State machine ────────────────────────────────────────────────────────────
type AppState =
  | 'idle' | 'scraping' | 'ready'
  | 'interviewing' | 'listening' | 'processing' | 'feedback'
  | 'summarising' | 'summary' | 'error' | 'mic-denied';

const STATE_LABELS: Record<AppState, string> = {
  idle:         'READY',
  scraping:     'FETCHING QUESTIONS',
  ready:        'READY TO START',
  interviewing: 'ALEX SPEAKING',
  listening:    'RECORDING',
  processing:   'ALEX THINKING',
  feedback:     'FEEDBACK',
  summarising:  'ANALYSING',
  summary:      'RESULTS',
  error:        'ERROR',
  'mic-denied': 'MIC DENIED',
};

const STATE_COLORS: Record<AppState, string> = {
  idle:         'var(--text-3)',
  scraping:     'var(--amber)',
  ready:        'var(--emerald)',
  interviewing: 'var(--cyan)',
  listening:    'var(--rose)',
  processing:   'var(--violet-light)',
  feedback:     'var(--amber)',
  summarising:  'var(--violet-light)',
  summary:      'var(--emerald)',
  error:        'var(--rose)',
  'mic-denied': 'var(--rose)',
};

// Improvement 7: score colour helper — used in both inline feedback and report
const scoreColor = (s: number) =>
  s >= 8 ? 'var(--emerald)' : s >= 5 ? 'var(--amber)' : 'var(--rose)';
const dimColor = (s: number) =>
  s >= 4 ? 'var(--emerald)' : s >= 3 ? 'var(--amber)' : 'var(--rose)';

// ─── Score bar (replaces circular ring in report) ─────────────────────────────
function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100);
  const color = scoreColor(score / (max / 10));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        flex: 1, height: 8, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden',
      }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ height: '100%', borderRadius: 99, background: color }}
        />
      </div>
      <span style={{ fontSize: 18, fontWeight: 800, color, minWidth: 48, textAlign: 'right' }}>
        {score}<span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>/{max}</span>
      </span>
    </div>
  );
}

// ─── Dimension score row (expandable in feedback card) ────────────────────────
function DimRow({ label, data }: { label: string; data?: { score: number; evidence?: string; note?: string } }) {
  if (!data) return null;
  const { score, evidence, note } = data;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: dimColor(score) }}>{score}/5</span>
      </div>
      {note && <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>{note}</p>}
      {evidence && (
        <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', lineHeight: 1.5 }}>
          "{evidence}"
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Interview() {
  const [company,    setCompany]    = useState('');
  const [role,       setRole]       = useState('');
  const [state,      setState]      = useState<AppState>('idle');
  const [error,      setError]      = useState('');
  const [questions,  setQuestions]  = useState<string[]>([]);
  const [currentQ,   setCurrentQ]   = useState('');
  const [feedback,   setFeedback]   = useState<any>(null);
  const [showDims,   setShowDims]   = useState(false);   // expandable dimension scores
  const [history,    setHistory]    = useState<any[]>([]);
  const [asked,      setAsked]      = useState<string[]>([]);
  const [summary,    setSummary]    = useState<any>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [liveText,   setLiveText]   = useState('');   // live transcript shown during recording
  const [finalText,  setFinalText]  = useState('');   // finalized text shown in processing state

  const synthRef  = useRef(window.speechSynthesis);
  const recRef          = useRef<any>(null);
  const histRef         = useRef<any[]>([]);
  const questRef        = useRef<string[]>([]);
  const askedRef        = useRef<string[]>([]);
  const accRef          = useRef('');
  const sendRef         = useRef<((s: string) => void) | null>(null);
  const liveSpanRef     = useRef<HTMLSpanElement>(null);   // kept for DOM writes (secondary)
  const isRecordingRef  = useRef(false);                  // true = user is actively recording

  useEffect(() => { histRef.current  = history;   }, [history]);
  useEffect(() => { questRef.current = questions; }, [questions]);
  useEffect(() => { askedRef.current = asked;     }, [asked]);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!text) { onEnd?.(); return; }
    synthRef.current.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.95; utt.lang = 'en-US';
    utt.onstart = () => setIsSpeaking(true);
    utt.onend   = () => { setIsSpeaking(false); onEnd?.(); };
    utt.onerror = () => { setIsSpeaking(false); onEnd?.(); };
    synthRef.current.speak(utt);
  }, []);

  const parseFeedback = (raw: any) => {
    if (!raw || raw === '') return null;
    if (typeof raw === 'object' && (raw.good || raw.missing || raw.improve)) return raw;
    try { const o = JSON.parse(raw); if (o.good || o.missing) return o; } catch {}
    return null;
  };

  const sendMessage = async (msg: string) => {
    setState('processing');
    setLiveText('');
    setFinalText('');
    if (liveSpanRef.current) liveSpanRef.current.textContent = '';

    const h  = histRef.current;
    const qs = questRef.current;
    const as = askedRef.current;
    try {
      const data = await interviewChat({
        history: h, user_message: msg, company, role, questions: qs, asked_questions: as,
      });
      const { reply, feedback: fb, next_question } = data;
      const newHist = [...h, { role: 'user', content: msg }, { role: 'assistant', content: reply }];
      setHistory(newHist);

      if (next_question && !as.includes(next_question)) {
        setAsked(p => [...p, next_question]);
      }

      const pf = parseFeedback(fb);
      if (pf) {
        setFeedback({ reply, ...pf });
        setShowDims(false);
        setState('feedback');
        setCurrentQ(next_question || '');
        speak(reply);
      } else {
        // Opening turn — Alex greets and asks first question
        const questionToAsk = next_question || '';
        setCurrentQ(questionToAsk);
        setState('interviewing');
        speak(questionToAsk
          ? `${reply} Here is your first question: ${questionToAsk}`
          : reply
        );
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
      setState('error');
    }
  };
  sendRef.current = sendMessage;

  // Build a SpeechRecognition instance with auto-restart and live transcript
  const initRec = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Voice recognition requires Chrome or Edge — other browsers not supported.');
      return null;
    }
    const rec = new SR();
    rec.continuous     = true;
    rec.interimResults = true;
    rec.lang           = 'en-US';
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          accRef.current += e.results[i][0].transcript + ' ';
        } else {
          interim = e.results[i][0].transcript;
        }
      }
      const combined = accRef.current + interim;
      // Primary: React state (reliable, always visible)
      setLiveText(combined);
      // Secondary: DOM write (zero-lag visual update)
      if (liveSpanRef.current) liveSpanRef.current.textContent = combined;
    };

    rec.onend = () => {
      // If user hasn't clicked Stop, auto-restart (browser fires onend on every silence pause)
      if (isRecordingRef.current) {
        try {
          rec.start();
          return; // still recording — don't send yet
        } catch {
          // start() failed (already started or other error) — fall through
        }
      }
      // User clicked Stop OR restart failed — finalise and send
      isRecordingRef.current = false;
      const s = accRef.current.trim();
      setFinalText(s);
      setLiveText('');
      if (s) sendRef.current?.(s);
      else setState('interviewing');
    };

    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'permission-denied') {
        isRecordingRef.current = false;
        setState('mic-denied');
      } else if (e.error === 'no-speech') {
        // No-speech fires on silence pauses — do NOT stop, auto-restart handles it
      } else if (e.error === 'aborted') {
        // Aborted fires when we call rec.stop() deliberately — handled in onend
      } else {
        isRecordingRef.current = false;
        setState('interviewing');
      }
    };

    return rec;
  };

  const handleScrape = async () => {
    if (!company.trim() || !role.trim()) return;
    setState('scraping');
    setError('');
    try {
      const data = await scrapeInterviewQuestions(company.trim(), role.trim());
      setQuestions(data.questions);
      setState('ready');
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || 'Failed to fetch questions');
      setState('error');
    }
  };

  const startInterview = () => {
    setHistory([]); setAsked([]); setFeedback(null); setSummary(null);
    setCurrentQ(''); setFinalText('');
    sendMessage('Hello, I am ready to begin the interview.');
  };

  const startListening = () => {
    // Reset state
    accRef.current = '';
    setLiveText('');
    setFinalText('');
    isRecordingRef.current = true;

    // Set listening state FIRST so the transcript span renders
    setState('listening');

    // Small delay: let React render the listening UI (span, mic button) before starting
    setTimeout(() => {
      if (!isRecordingRef.current) return; // was cancelled before timeout
      const rec = initRec();
      if (!rec) {
        isRecordingRef.current = false;
        setState('interviewing');
        return;
      }
      recRef.current = rec;
      try {
        rec.start();
      } catch (err) {
        console.error('[voice] rec.start() failed:', err);
        isRecordingRef.current = false;
        setState('interviewing');
      }
    }, 150);
  };

  const stopListening = () => {
    isRecordingRef.current = false;  // signal that this is an intentional stop
    recRef.current?.stop();
  };

  const handleSummary = async () => {
    synthRef.current.cancel();
    isRecordingRef.current = false;
    recRef.current?.stop();
    setState('summarising');
    try {
      const data = await interviewSummary({
        history: histRef.current, company, role, questions_asked: askedRef.current,
      });
      setSummary(data);
      setState('summary');
    } catch (e: any) {
      setError(e.message || 'Summary generation failed');
      setState('error');
    }
  };

  const handleContinue = () => {
    setFeedback(null);
    setLiveText('');
    setFinalText('');
    setShowDims(false);
    if (liveSpanRef.current) liveSpanRef.current.textContent = '';
    if (!currentQ) { handleSummary(); return; }
    setState('interviewing');
    speak(currentQ, () => startListening());
  };

  const reset = () => {
    synthRef.current.cancel();
    recRef.current?.stop();
    isRecordingRef.current = false;
    setHistory([]); setQuestions([]); setAsked([]);
    setFeedback(null); setSummary(null);
    setCurrentQ(''); setLiveText(''); setFinalText('');
    setError(''); setState('idle'); setShowDims(false);
    if (liveSpanRef.current) liveSpanRef.current.textContent = '';
  };

  // Improvement 4: progress pill — shown during active interview stages
  const progressPill = (
    questions.length > 0 &&
    ['interviewing', 'listening', 'processing', 'feedback'].includes(state)
  ) ? (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 99,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      fontSize: 11, fontWeight: 700, color: 'var(--text-2)',
    }}>
      Q&nbsp;{asked.length}&nbsp;/&nbsp;{questions.length}
    </div>
  ) : null;

  const activeStates: AppState[] = ['interviewing', 'listening', 'processing', 'feedback'];
  const inInterview = activeStates.includes(state);

  return (
    <div style={{ padding: 32, maxWidth: 860, margin: '0 auto' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(14,165,233,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Mic size={20} color="var(--violet-light)" />
          </div>
          <div>
            <p className="label">AI MOCK INTERVIEW</p>
            <h2 style={{ fontSize: 22 }}>Voice Mock Interview</h2>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Progress pill — Improvement 4 */}
          {progressPill}

          {/* End interview button */}
          {inInterview && state !== 'feedback' && (
            <button onClick={handleSummary} className="btn btn-danger" style={{ fontSize: 12, gap: 6, padding: '8px 14px' }}>
              <StopCircle size={13} /> End
            </button>
          )}

          {/* State indicator badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 99,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
          }}>
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={state === 'listening' ? { repeat: Infinity, duration: 1.2 } : { duration: 0 }}
              style={{
                width: 7, height: 7, borderRadius: '50%',
                background: STATE_COLORS[state],
                boxShadow: `0 0 8px ${STATE_COLORS[state]}`,
              }}
            />
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              color: STATE_COLORS[state],
            }}>
              {STATE_LABELS[state]}
            </span>
          </div>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">

        {/* ── IDLE ──────────────────────────────────────────────────────────── */}
        {state === 'idle' && (
          <motion.div key="idle"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="card" style={{ padding: 32, textAlign: 'center' }}
          >
            <h3 style={{ fontSize: 28, marginBottom: 10 }}>
              Practice like it's <em style={{ color: 'var(--violet-light)' }}>real.</em>
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 28, maxWidth: 480, margin: '0 auto 28px' }}>
              Enter the company and role. Alex — a senior technical interviewer — asks real scraped questions, listens to your spoken answer, and gives structured feedback after each one. End anytime for a full report.
            </p>
            <div style={{ display: 'flex', gap: 10, maxWidth: 440, margin: '0 auto', flexDirection: 'column' }}>
              <input
                className="input"
                placeholder="Company (e.g. Google, Amazon, Flipkart)"
                value={company}
                onChange={e => setCompany(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleScrape()}
              />
              <input
                className="input"
                placeholder="Role (e.g. SDE, Product Manager, Data Scientist)"
                value={role}
                onChange={e => setRole(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleScrape()}
              />
              <button onClick={handleScrape} disabled={!company.trim() || !role.trim()} className="btn btn-primary">
                Fetch Real Questions →
              </button>
            </div>
          </motion.div>
        )}

        {/* ── SCRAPING ────────────────────────────────────────────────────── */}
        {state === 'scraping' && (
          <motion.div key="scraping"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="card" style={{ padding: 48, textAlign: 'center' }}
          >
            <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 20px' }} />
            <p style={{ fontSize: 16, fontWeight: 600 }}>Finding real interview questions…</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>
              Searching DuckDuckGo → Bing → Google · then AI-refining results
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
              This usually takes 10–20 seconds
            </p>
          </motion.div>
        )}

        {/* ── MIC DENIED — Improvement 6 ──────────────────────────────────── */}
        {state === 'mic-denied' && (
          <motion.div key="mic-denied"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="card" style={{ padding: 32, textAlign: 'center' }}
          >
            <AlertTriangle size={40} color="var(--rose)" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Microphone Access Denied</p>
            <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 6, maxWidth: 400, margin: '0 auto 8px' }}>
              Alex needs microphone access to hear your answers.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24, maxWidth: 440, margin: '0 auto 24px' }}>
              Click the 🔒 lock icon in your browser's address bar → Site settings → Microphone → Allow. Then click Retry.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={startListening} className="btn btn-primary" style={{ fontSize: 13 }}>
                <Mic size={14} /> Retry Microphone
              </button>
              <button onClick={() => setState('interviewing')} className="btn btn-secondary" style={{ fontSize: 13 }}>
                Skip (type instead)
              </button>
            </div>
          </motion.div>
        )}

        {/* ── ERROR ────────────────────────────────────────────────────────── */}
        {state === 'error' && (
          <motion.div key="error"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="card" style={{ padding: 32, textAlign: 'center' }}
          >
            <p style={{ fontSize: 32, marginBottom: 12 }}>⚡</p>
            <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Something went wrong</p>
            <p style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 20 }}>{error}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={handleScrape} className="btn btn-primary" style={{ fontSize: 13 }}>Retry</button>
              <button onClick={reset} className="btn btn-secondary" style={{ fontSize: 13, gap: 6 }}>
                <RotateCcw size={13} /> Change Setup
              </button>
            </div>
          </motion.div>
        )}

        {/* ── READY ────────────────────────────────────────────────────────── */}
        {state === 'ready' && (
          <motion.div key="ready"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="card" style={{ padding: 32, textAlign: 'center' }}
          >
            <p style={{ fontSize: 40, fontWeight: 800, marginBottom: 6 }}>{questions.length}</p>
            <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 6 }}>
              questions loaded for{' '}
              <strong style={{ color: 'var(--text)' }}>{company}</strong>
              {' '}·{' '}
              <strong style={{ color: 'var(--violet-light)' }}>{role}</strong>
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 28, maxWidth: 460, margin: '0 auto 28px' }}>
              Alex is ready. Speak your full answer, then click the mic button again when done. You'll get structured feedback after every answer, and a detailed report at the end.
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 24 }}>
              Voice recognition requires Chrome or Edge
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={startInterview} className="btn btn-primary">Start Interview</button>
              <button onClick={reset} className="btn btn-secondary" style={{ fontSize: 13, gap: 6 }}>
                <RotateCcw size={13} /> Change Setup
              </button>
            </div>
          </motion.div>
        )}

        {/* ── INTERVIEW STAGES ─────────────────────────────────────────────── */}
        {inInterview && (
          <motion.div key="interview"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            {/* Alex card — hidden during feedback (feedback card takes over) */}
            {state !== 'feedback' && (
              <motion.div
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="card"
                style={{
                  padding: 28,
                  border: `1px solid ${isSpeaking ? 'rgba(14,165,233,0.5)' : 'var(--border)'}`,
                  boxShadow: isSpeaking ? '0 0 20px rgba(14,165,233,0.15)' : 'none',
                  transition: 'border-color 0.3s, box-shadow 0.3s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 15, color: '#fff', flexShrink: 0,
                  }}>A</div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>Alex</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Senior Interviewer · {company}</p>
                  </div>
                  {isSpeaking && (
                    <div className="waveform" style={{ marginLeft: 'auto' }}>
                      {Array.from({ length: 7 }).map((_, i) => <div key={i} className="wave-bar" />)}
                    </div>
                  )}
                </div>

                {/* Improvement 1: clearer state message above the question */}
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {state === 'interviewing'
                    ? isSpeaking ? 'Alex is speaking — please wait' : 'Current question'
                    : state === 'listening'   ? 'Alex is listening to your answer'
                    : state === 'processing'  ? 'Alex is evaluating your answer'
                    : 'Current question'}
                </p>

                {/* Improvement 3: question always visible during listening */}
                <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text)' }}>
                  {currentQ || 'Preparing your first question…'}
                </p>
              </motion.div>
            )}

            {/* Interviewing — mic button */}
            {state === 'interviewing' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="card"
                style={{ padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}
              >
                <motion.button
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                  onClick={startListening}
                  disabled={isSpeaking}
                  style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: isSpeaking ? 'var(--surface-3)' : 'var(--accent)',
                    border: 'none', cursor: isSpeaking ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.2s',
                  }}
                >
                  <Mic size={28} color="#fff" />
                </motion.button>
                {/* Improvement 1: crystal-clear instruction text */}
                <p style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center' }}>
                  {isSpeaking
                    ? 'Wait for Alex to finish speaking, then click to answer'
                    : 'Click the mic, speak your answer, then click again to stop'
                  }
                </p>
                <button onClick={handleSummary} className="btn btn-ghost" style={{ fontSize: 12, gap: 6 }}>
                  <SkipForward size={13} /> End & get report
                </button>
              </motion.div>
            )}

            {/* Listening — live transcript, Improvement 2 (no React rerender on interim) */}
            {state === 'listening' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="card"
                style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
              >
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  onClick={stopListening}
                  style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: 'var(--rose)', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <MicOff size={28} color="#fff" />
                </motion.button>
                {/* Improvement 1: explicit state label */}
                <p style={{ fontSize: 13, color: 'var(--rose)', fontWeight: 600 }}>
                  Recording — click to stop when done speaking
                </p>

                {/* Improvement 3: current question visible during listening */}
                {currentQ && (
                  <div style={{
                    width: '100%', padding: '10px 14px',
                    background: 'rgba(14,165,233,0.05)',
                    borderRadius: 8, border: '1px solid rgba(14,165,233,0.15)',
                  }}>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Question</p>
                    <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{currentQ}</p>
                  </div>
                )}

                {/* Live transcript — React state primary, DOM ref secondary */}
                <div style={{
                  width: '100%', padding: 16,
                  background: 'var(--surface-2)', borderRadius: 10,
                  border: '1px solid var(--border)', minHeight: 80,
                }}>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Your answer — live transcript
                  </p>
                  <span
                    ref={liveSpanRef}
                    style={{ fontSize: 13, color: liveText ? 'var(--text)' : 'var(--text-3)', lineHeight: 1.7 }}
                  >
                    {liveText || 'Speak now… your words will appear here'}
                  </span>
                </div>
              </motion.div>
            )}

            {/* Processing */}
            {state === 'processing' && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="card" style={{ padding: 28, textAlign: 'center' }}
              >
                <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      animate={{ y: [0, -6, 0] }}
                      transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }}
                      style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--violet-light)' }}
                    />
                  ))}
                </div>
                <p style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500 }}>
                  Alex is evaluating your answer…
                </p>
                {finalText && (
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10, maxWidth: 420, margin: '10px auto 0' }}>
                    Received: "{finalText.substring(0, 120)}{finalText.length > 120 ? '…' : ''}"
                  </p>
                )}
              </motion.div>
            )}

            {/* Feedback — Improvements 5 (dimension scores) */}
            {state === 'feedback' && feedback && (
              <motion.div
                key="feedback-card"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="card"
                style={{ padding: 28, border: '1px solid rgba(14,165,233,0.25)' }}
              >
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: 'var(--violet-light)' }}>
                  Alex's Feedback
                </h3>

                {feedback.reply && (
                  <p style={{
                    fontSize: 14, color: 'var(--text-2)', fontStyle: 'italic',
                    marginBottom: 16, lineHeight: 1.6,
                    paddingBottom: 14, borderBottom: '1px solid var(--border)',
                  }}>
                    "{feedback.reply}"
                  </p>
                )}

                {/* Core 3 feedback fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {feedback.good && (
                    <div style={{
                      padding: '10px 14px',
                      background: 'rgba(16,185,129,0.08)', borderRadius: 8,
                      border: '1px solid rgba(16,185,129,0.18)', fontSize: 13, lineHeight: 1.6,
                    }}>
                      <strong style={{ color: 'var(--emerald)' }}>Good: </strong>
                      {feedback.good}
                    </div>
                  )}
                  {feedback.missing && (
                    <div style={{
                      padding: '10px 14px',
                      background: 'rgba(245,158,11,0.08)', borderRadius: 8,
                      border: '1px solid rgba(245,158,11,0.18)', fontSize: 13, lineHeight: 1.6,
                    }}>
                      <strong style={{ color: 'var(--amber)' }}>Missing: </strong>
                      {feedback.missing}
                    </div>
                  )}
                  {feedback.improve && (
                    <div style={{
                      padding: '10px 14px',
                      background: 'rgba(14,165,233,0.08)', borderRadius: 8,
                      border: '1px solid rgba(14,165,233,0.18)', fontSize: 13, lineHeight: 1.6,
                    }}>
                      <strong style={{ color: 'var(--violet-light)' }}>Improve: </strong>
                      {feedback.improve}
                    </div>
                  )}
                </div>

                {/* Improvement 5: expandable dimension scores */}
                {(feedback.technical_accuracy || feedback.depth || feedback.communication || feedback.completeness) && (
                  <div style={{ marginBottom: 16 }}>
                    <button
                      onClick={() => setShowDims(v => !v)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 12, color: 'var(--text-3)', fontWeight: 600,
                        padding: '4px 0',
                      }}
                    >
                      {showDims ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {showDims ? 'Hide' : 'Show'} dimension scores
                    </button>
                    <AnimatePresence>
                      {showDims && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                          style={{ overflow: 'hidden', marginTop: 8 }}
                        >
                          <DimRow label="Technical Accuracy" data={feedback.technical_accuracy} />
                          <DimRow label="Depth" data={feedback.depth} />
                          <DimRow label="Communication" data={feedback.communication} />
                          <DimRow label="Completeness" data={feedback.completeness} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={handleContinue} className="btn btn-primary" style={{ fontSize: 13 }}>
                    {currentQ ? 'Next Question →' : 'Finish & Get Report'}
                  </button>
                  <button onClick={handleSummary} className="btn btn-secondary" style={{ fontSize: 13 }}>
                    Stop & Get Report
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── SUMMARISING ──────────────────────────────────────────────────── */}
        {state === 'summarising' && (
          <motion.div key="summarising"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="card" style={{ padding: 48, textAlign: 'center' }}
          >
            <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 20px', borderTopColor: 'var(--amber)' }} />
            <p style={{ fontSize: 16, fontWeight: 600 }}>Generating your interview report…</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>
              Analysing {asked.length} question{asked.length !== 1 ? 's' : ''} answered
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
              Two-pass evaluation — usually takes 15–30 seconds
            </p>
          </motion.div>
        )}

        {/* ── SUMMARY — Improvements 7 ─────────────────────────────────────── */}
        {state === 'summary' && summary && (
          <motion.div key="summary"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          >
            {/* Score + recommendation */}
            <div className="card" style={{ padding: 28, marginBottom: 16 }}>
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Overall Score
                </p>
                <ScoreBar score={summary.overall_score || 0} />
              </div>

              {/* Recommendation badge — Improvement 7: clear colour coding */}
              {summary.final_recommendation && (() => {
                const rec = summary.final_recommendation;
                const isHire = /^hire/i.test(rec);
                const isNo   = /^no hire/i.test(rec);
                const bgColor = isHire ? 'rgba(16,185,129,0.12)' : isNo ? 'rgba(244,63,94,0.12)' : 'rgba(245,158,11,0.12)';
                const txtColor = isHire ? 'var(--emerald)' : isNo ? 'var(--rose)' : 'var(--amber)';
                const borderColor = isHire ? 'rgba(16,185,129,0.25)' : isNo ? 'rgba(244,63,94,0.25)' : 'rgba(245,158,11,0.25)';
                return (
                  <div style={{
                    padding: '12px 16px', borderRadius: 10,
                    background: bgColor, border: `1px solid ${borderColor}`,
                    marginBottom: 16,
                  }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: txtColor, marginBottom: 4 }}>
                      {rec.split('—')[0].trim()}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                      {rec.includes('—') ? rec.split('—').slice(1).join('—').trim() : ''}
                    </p>
                  </div>
                );
              })()}

              <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 20 }}>
                {summary.overall_verdict}
              </p>

              {/* Strengths + Weaknesses */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--emerald)', marginBottom: 8 }}>Strengths</p>
                  {(summary.strengths || []).map((s: string, i: number) => (
                    <div key={i} style={{
                      padding: '7px 10px', background: 'rgba(16,185,129,0.07)',
                      borderRadius: 6, fontSize: 12, color: 'var(--text-2)', marginBottom: 5, lineHeight: 1.5,
                    }}>{s}</div>
                  ))}
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--rose)', marginBottom: 8 }}>Weaknesses</p>
                  {(summary.weaknesses || []).map((w: string, i: number) => (
                    <div key={i} style={{
                      padding: '7px 10px', background: 'rgba(244,63,94,0.07)',
                      borderRadius: 6, fontSize: 12, color: 'var(--text-2)', marginBottom: 5, lineHeight: 1.5,
                    }}>{w}</div>
                  ))}
                </div>
              </div>
            </div>

            {/* Q&A Breakdown */}
            {summary.question_reviews?.length > 0 && (
              <div className="card" style={{ padding: 28, marginBottom: 16 }}>
                <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Question-by-Question Breakdown</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {summary.question_reviews.map((qr: any, idx: number) => (
                    <div key={idx} style={{
                      padding: 16, background: 'var(--surface-2)',
                      borderRadius: 10, border: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', flex: 1, lineHeight: 1.5 }}>
                          Q{idx + 1}: {qr.question}
                        </p>
                        <span style={{
                          fontSize: 12, padding: '4px 10px', borderRadius: 99, flexShrink: 0,
                          background: qr.score >= 70 ? 'rgba(16,185,129,0.1)' : qr.score >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(244,63,94,0.1)',
                          color: qr.score >= 70 ? 'var(--emerald)' : qr.score >= 50 ? 'var(--amber)' : 'var(--rose)',
                          fontWeight: 700,
                        }}>
                          {qr.score}/100
                        </span>
                      </div>

                      {/* Competency tag if available */}
                      {qr.competency_tested && (
                        <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
                          Tests: <strong style={{ color: 'var(--text-2)' }}>{qr.competency_tested}</strong>
                        </p>
                      )}

                      <p style={{ fontSize: 13, marginBottom: 6, lineHeight: 1.5 }}>
                        <strong style={{ color: 'var(--emerald)' }}>Good: </strong>{qr.what_was_good}
                      </p>
                      <p style={{ fontSize: 13, marginBottom: 6, lineHeight: 1.5 }}>
                        <strong style={{ color: 'var(--rose)' }}>Missing: </strong>{qr.what_was_missing}
                      </p>

                      {/* Evidence quote if available */}
                      {qr.key_evidence && (
                        <p style={{
                          fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic',
                          padding: '6px 10px', background: 'var(--surface-3)',
                          borderRadius: 6, marginBottom: 6, lineHeight: 1.5,
                        }}>
                          You said: "{qr.key_evidence}"
                        </p>
                      )}

                      <p style={{
                        fontSize: 13, padding: '8px 12px',
                        background: 'rgba(14,165,233,0.08)',
                        borderLeft: '3px solid var(--violet-light)',
                        borderRadius: '0 6px 6px 0', lineHeight: 1.5,
                      }}>
                        <strong style={{ color: 'var(--violet-light)' }}>Key insight: </strong>
                        {qr.model_answer_hint}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Improvement areas */}
            {summary.improvement_areas?.length > 0 && (
              <div className="card" style={{ padding: 28, marginBottom: 16 }}>
                <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Improvement Roadmap</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {summary.improvement_areas.map((ia: any, i: number) => (
                    <div key={i} style={{
                      padding: '12px 16px', background: 'var(--surface-2)',
                      borderRadius: 8, border: '1px solid var(--border)',
                    }}>
                      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{ia.area}</p>
                      <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{ia.advice}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={reset} className="btn btn-primary" style={{ gap: 8 }}>
              <RotateCcw size={14} /> Start New Interview
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
