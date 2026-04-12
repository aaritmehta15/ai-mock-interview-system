import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, StopCircle, SkipForward, RotateCcw } from 'lucide-react';
import { scrapeInterviewQuestions, interviewChat, interviewSummary } from '../lib/api';


type AppState = 'idle'|'scraping'|'ready'|'interviewing'|'listening'|'processing'|'feedback'|'summarising'|'summary'|'error';

const STATE_LABELS: Record<AppState, string> = {
  idle:'READY', scraping:'LOADING', ready:'READY', interviewing:'SPEAKING',
  listening:'LISTENING', processing:'THINKING', feedback:'FEEDBACK',
  summarising:'ANALYSING', summary:'RESULTS', error:'ERROR',
};

const STATE_COLORS: Record<AppState, string> = {
  idle:'var(--text-3)', scraping:'var(--amber)', ready:'var(--emerald)',
  interviewing:'var(--cyan)', listening:'var(--rose)', processing:'var(--violet-light)',
  feedback:'var(--amber)', summarising:'var(--violet-light)', summary:'var(--emerald)', error:'var(--rose)',
};

export default function Interview() {
  const [company, setCompany]     = useState('');
  const [role,    setRole]        = useState('');
  const [state,   setState]       = useState<AppState>('idle');
  const [error,   setError]       = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQ,  setCurrentQ]  = useState('');
  const [feedback,  setFeedback]  = useState<any>(null);
  const [history,   setHistory]   = useState<any[]>([]);
  const [asked,     setAsked]     = useState<string[]>([]);
  const [liveText,  setLiveText]  = useState('');
  const [summary,   setSummary]   = useState<any>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const synthRef    = useRef(window.speechSynthesis);
  const recRef      = useRef<any>(null);
  const histRef     = useRef<any[]>([]);
  const questRef    = useRef<string[]>([]);
  const askedRef    = useRef<string[]>([]);
  const accRef      = useRef('');
  const sendRef     = useRef<((s:string) => void)|null>(null);
  const domRef      = useRef<HTMLSpanElement>(null);

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
    setState('processing'); setLiveText('');
    const h = histRef.current; const qs = questRef.current; const as = askedRef.current;
    try {
      const data = await interviewChat({ history:h, user_message:msg, company, role, questions:qs, asked_questions:as });
      const { reply, feedback:fb, next_question } = data;
      const newHist = [...h, {role:'user',content:msg}, {role:'assistant',content:reply}];
      setHistory(newHist);
      if (next_question && !as.includes(next_question)) setAsked(p => [...p, next_question]);
      const pf = parseFeedback(fb);
      if (pf) { setFeedback({reply,...pf}); setState('feedback'); setCurrentQ(next_question||''); }
      else {
        setState('interviewing');
        speak(reply, () => { if (next_question) { setCurrentQ(next_question); speak(next_question); } });
      }
    } catch (e: any) { setError(e.message); setState('error'); }
  };
  sendRef.current = sendMessage;

  const initRec = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition requires Chrome or Edge'); return null; }
    const rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) accRef.current += e.results[i][0].transcript + ' ';
        else interim = e.results[i][0].transcript;
      }
      const d = accRef.current + interim;
      if (domRef.current) domRef.current.textContent = d;
      setLiveText(d);
    };
    rec.onend = () => { const s = accRef.current.trim(); if (s) sendRef.current?.(s); else setState('interviewing'); };
    rec.onerror = (e: any) => { if (e.error !== 'no-speech') setState('interviewing'); };
    return rec;
  };

  const handleScrape = async () => {
    if (!company.trim() || !role.trim()) return;
    setState('scraping'); setError('');
    try {
      const data = await scrapeInterviewQuestions(company.trim(), role.trim());
      setQuestions(data.questions); setState('ready');
    } catch (e: any) { setError(e.response?.data?.detail || e.message); setState('error'); }
  };

  const startInterview = () => {
    setHistory([]); setAsked([]); setFeedback(null); setSummary(null);
    sendMessage('Hello, I am ready to begin the interview.');
  };

  const startListening = () => {
    accRef.current = ''; setLiveText('');
    if (domRef.current) domRef.current.textContent = 'Speak now…';
    const rec = initRec(); if (!rec) return;
    recRef.current = rec; setState('listening'); rec.start();
  };

  const stopListening = () => recRef.current?.stop();

  const handleSummary = async () => {
    synthRef.current.cancel(); recRef.current?.stop(); setState('summarising');
    try {
      const data = await interviewSummary({ history:histRef.current, company, role, questions_asked:askedRef.current });
      setSummary(data); setState('summary');
    } catch (e: any) { setError(e.message); setState('error'); }
  };

  const handleContinue = () => {
    setFeedback(null); setLiveText('');
    if (!currentQ) { handleSummary(); return; }
    setState('interviewing'); speak(currentQ);
  };

  const reset = () => {
    synthRef.current.cancel(); recRef.current?.stop();
    setHistory([]); setQuestions([]); setAsked([]); setFeedback(null); setSummary(null);
    setCurrentQ(''); setLiveText(''); setError(''); setState('idle');
  };

  const scoreColor = (s: number) => s >= 8 ? 'var(--emerald)' : s >= 5 ? 'var(--amber)' : 'var(--rose)';

  return (
    <div style={{ padding:32, maxWidth:860, margin:'0 auto' }}>
      {/* Header */}
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:12, background:'rgba(168,85,247,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Mic size={20} color="var(--violet-light)" />
          </div>
          <div>
            <p className="label">MODULE 2</p>
            <h2 style={{ fontSize:22 }}>Voice Mock Interview</h2>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {['interviewing','listening','processing'].includes(state) && (
            <button onClick={handleSummary} className="btn btn-danger" style={{ fontSize:12, gap:6, padding:'8px 14px' }}>
              <StopCircle size={13} /> End
            </button>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:99, border:'1px solid var(--border)', background:'var(--surface-2)' }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:STATE_COLORS[state], boxShadow:`0 0 8px ${STATE_COLORS[state]}` }} />
            <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.06em', color:STATE_COLORS[state] }}>{STATE_LABELS[state]}</span>
          </div>
        </div>
      </motion.div>

      {/* IDLE */}
      {state === 'idle' && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="card" style={{ padding:32, textAlign:'center' }}>
          <h3 style={{ fontSize:28, marginBottom:10 }}>Practice like it's <em style={{ color:'var(--violet-light)' }}>real.</em></h3>
          <p style={{ fontSize:14, color:'var(--text-2)', marginBottom:28, maxWidth:480, margin:'0 auto 28px' }}>
            Enter the company and role. Alex asks real scraped questions, listens to your full answer, and gives structured feedback — then a detailed final report.
          </p>
          <div style={{ display:'flex', gap:10, maxWidth:440, margin:'0 auto', flexDirection:'column' }}>
            <input className="input" placeholder="Company (e.g. Google, Amazon)" value={company} onChange={e => setCompany(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleScrape()} />
            <input className="input" placeholder="Role (e.g. SDE, Product Manager)" value={role} onChange={e => setRole(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleScrape()} />
            <button onClick={handleScrape} disabled={!company.trim()||!role.trim()} className="btn btn-primary">Fetch Real Questions →</button>
          </div>
        </motion.div>
      )}

      {/* SCRAPING */}
      {state === 'scraping' && (
        <div className="card" style={{ padding:48, textAlign:'center' }}>
          <div className="spinner" style={{ width:40, height:40, margin:'0 auto 20px' }} />
          <p style={{ fontSize:16, fontWeight:600 }}>Finding real interview questions…</p>
          <p style={{ fontSize:13, color:'var(--text-3)', marginTop:6 }}>Searching DuckDuckGo → Bing → Google · then refining with AI</p>
        </div>
      )}

      {/* ERROR */}
      {state === 'error' && (
        <div className="card" style={{ padding:32, textAlign:'center' }}>
          <p style={{ fontSize:32, marginBottom:12 }}>⚡</p>
          <p style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>Something went wrong</p>
          <p style={{ fontSize:13, color:'var(--rose)', marginBottom:20 }}>{error}</p>
          <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
            <button onClick={handleScrape} className="btn btn-primary" style={{ fontSize:13 }}>Retry</button>
            <button onClick={reset} className="btn btn-secondary" style={{ fontSize:13 }}><RotateCcw size={13} /> Change Setup</button>
          </div>
        </div>
      )}

      {/* READY */}
      {state === 'ready' && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="card" style={{ padding:32, textAlign:'center' }}>
          <p style={{ fontSize:36, fontWeight:800, marginBottom:8 }}>{questions.length}</p>
          <p style={{ fontSize:14, color:'var(--text-2)', marginBottom:24 }}>questions loaded for <strong style={{ color:'var(--text)' }}>{company}</strong> · <strong style={{ color:'var(--violet-light)' }}>{role}</strong></p>
          <p style={{ fontSize:13, color:'var(--text-3)', marginBottom:28, maxWidth:440, margin:'0 auto 28px' }}>Alex is ready. Speak your full answer and click the mic again when done. You'll get feedback after each answer.</p>
          <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
            <button onClick={startInterview} className="btn btn-primary">Start Interview</button>
            <button onClick={reset} className="btn btn-secondary" style={{ fontSize:13, gap:6 }}><RotateCcw size={13} />Change Setup</button>
          </div>
        </motion.div>
      )}

      {/* INTERVIEW STAGES */}
      {(['interviewing','listening','processing','feedback'] as AppState[]).includes(state) && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Alex card */}
          {state !== 'feedback' && (
            <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} className="card" style={{ padding:28, border:`1px solid ${isSpeaking ? 'rgba(124,58,237,0.5)' : 'var(--border)'}`, boxShadow: isSpeaking ? '0 0 32px var(--violet-glow)' : 'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#7c3aed,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:15, color:'#fff' }}>A</div>
                <div>
                  <p style={{ fontSize:13, fontWeight:600 }}>Alex</p>
                  <p style={{ fontSize:11, color:'var(--text-3)' }}>Senior Interviewer · {company}</p>
                </div>
                {isSpeaking && (
                  <div className="waveform" style={{ marginLeft:'auto' }}>
                    {Array.from({length:7}).map((_,i) => <div key={i} className="wave-bar" />)}
                  </div>
                )}
              </div>
              <p style={{ fontSize:15, lineHeight:1.7, color:'var(--text)' }}>{currentQ || 'Preparing your first question…'}</p>
              {asked.length > 0 && <p style={{ fontSize:11, color:'var(--text-3)', marginTop:12 }}>{asked.length} of {questions.length} questions asked</p>}
            </motion.div>
          )}

          {/* Controls */}
          {state === 'interviewing' && (
            <div className="card" style={{ padding:24, display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
              <motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.97 }}
                onClick={startListening} disabled={isSpeaking}
                style={{ width:72, height:72, borderRadius:'50%', background:'linear-gradient(135deg,#7c3aed,#a855f7)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 32px var(--violet-glow)' }}>
                <Mic size={28} color="#fff" />
              </motion.button>
              <p style={{ fontSize:13, color:'var(--text-2)' }}>{isSpeaking ? 'Alex is speaking…' : 'Click to answer'}</p>
              <button onClick={() => { setState('interviewing'); setCurrentQ(prev => { handleSummary(); return prev; }); }} className="btn btn-ghost" style={{ fontSize:12, gap:6 }}><SkipForward size={13} /> Skip to summary</button>
            </div>
          )}

          {state === 'listening' && (
            <div className="card" style={{ padding:24, display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
              <motion.button whileHover={{ scale:1.03 }} onClick={stopListening}
                style={{ width:72, height:72, borderRadius:'50%', background:'linear-gradient(135deg,var(--rose),#f97316)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 32px rgba(244,63,94,0.4)', animation:'pulse-glow 1.5s ease infinite' }}>
                <MicOff size={28} color="#fff" />
              </motion.button>
              <p style={{ fontSize:13, color:'var(--rose)', fontWeight:600 }}>Recording… click to stop</p>
              <div style={{ width:'100%', padding:16, background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)', minHeight:60 }}>
                <span ref={domRef} style={{ fontSize:13, color:'var(--text)', lineHeight:1.6 }} />
                {!liveText && <span style={{ fontSize:13, color:'var(--text-3)' }}>Your words appear here…</span>}
              </div>
            </div>
          )}

          {state === 'processing' && (
            <div className="card" style={{ padding:24, textAlign:'center' }}>
              <div style={{ display:'inline-flex', gap:6, alignItems:'center' }}>
                {[0,1,2].map(i => <div key={i} style={{ width:8, height:8, borderRadius:'50%', background:'var(--violet-light)', animation:`wave ${0.6+i*0.15}s ease infinite alternate` }} />)}
                <span style={{ fontSize:13, color:'var(--text-2)', marginLeft:8 }}>Alex is thinking…</span>
              </div>
            </div>
          )}

          {/* Feedback */}
          {state === 'feedback' && feedback && (
            <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} className="card" style={{ padding:28, border:'1px solid rgba(124,58,237,0.3)' }}>
              <h3 style={{ fontSize:15, fontWeight:700, marginBottom:16, color:'var(--violet-light)' }}>Alex's Feedback</h3>
              {feedback.reply && <p style={{ fontSize:14, color:'var(--text-2)', fontStyle:'italic', marginBottom:16 }}>"{feedback.reply}"</p>}
              <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
                {feedback.good    && <div style={{ padding:'10px 14px', background:'rgba(16,185,129,0.1)',  borderRadius:8, border:'1px solid rgba(16,185,129,0.2)',  fontSize:13 }}><strong style={{ color:'var(--emerald)' }}>✓ Good:</strong> {feedback.good}</div>}
                {feedback.missing && <div style={{ padding:'10px 14px', background:'rgba(245,158,11,0.1)', borderRadius:8, border:'1px solid rgba(245,158,11,0.2)', fontSize:13 }}><strong style={{ color:'var(--amber)' }}>⚠ Missing:</strong> {feedback.missing}</div>}
                {feedback.improve && <div style={{ padding:'10px 14px', background:'rgba(124,58,237,0.1)', borderRadius:8, border:'1px solid rgba(124,58,237,0.2)', fontSize:13 }}><strong style={{ color:'var(--violet-light)' }}>↑ Improve:</strong> {feedback.improve}</div>}
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={handleContinue} className="btn btn-primary" style={{ fontSize:13 }}>{currentQ ? 'Next Question →' : 'Finish & Get Summary'}</button>
                <button onClick={handleSummary} className="btn btn-secondary" style={{ fontSize:13 }}>Stop & Summarise</button>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* SUMMARISING */}
      {state === 'summarising' && (
        <div className="card" style={{ padding:48, textAlign:'center' }}>
          <div className="spinner" style={{ width:40, height:40, margin:'0 auto 20px', borderTopColor:'var(--amber)' }} />
          <p style={{ fontSize:16, fontWeight:600 }}>Generating your interview report…</p>
          <p style={{ fontSize:13, color:'var(--text-3)', marginTop:6 }}>Analysing {asked.length} questions answered</p>
        </div>
      )}

      {/* SUMMARY */}
      {state === 'summary' && summary && (
        <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}>
          <div className="card" style={{ padding:28, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:20 }}>
              <div className="score-ring" style={{ borderColor:scoreColor((summary.overall_score||0)/10) }}>
                <span style={{ fontSize:24, fontWeight:800, color:scoreColor((summary.overall_score||0)/10) }}>{summary.overall_score||0}</span>
                <span style={{ fontSize:10, color:'var(--text-3)' }}>/100</span>
              </div>
              <div>
                <p style={{ fontSize:18, fontWeight:700, color:scoreColor((summary.overall_score||0)/10) }}>{summary.final_recommendation}</p>
                <p style={{ fontSize:13, color:'var(--text-2)', marginTop:4 }}>{summary.overall_verdict}</p>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <p style={{ fontSize:12, fontWeight:700, color:'var(--emerald)', marginBottom:8 }}>✓ Strengths</p>
                {(summary.strengths||[]).map((s:string,i:number) => <div key={i} style={{ padding:'6px 10px', background:'rgba(16,185,129,0.08)', borderRadius:6, fontSize:12, color:'var(--text-2)', marginBottom:4 }}>{s}</div>)}
              </div>
              <div>
                <p style={{ fontSize:12, fontWeight:700, color:'var(--rose)', marginBottom:8 }}>✗ Weaknesses</p>
                {(summary.weaknesses||[]).map((w:string,i:number) => <div key={i} style={{ padding:'6px 10px', background:'rgba(244,63,94,0.08)', borderRadius:6, fontSize:12, color:'var(--text-2)', marginBottom:4 }}>{w}</div>)}
              </div>
            </div>
          </div>
          <button onClick={reset} className="btn btn-primary" style={{ gap:8 }}><RotateCcw size={14} /> Start New Interview</button>
        </motion.div>
      )}
    </div>
  );
}
