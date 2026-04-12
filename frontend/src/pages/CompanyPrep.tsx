import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Mail, Send, Loader2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { analyzeCompany, gmailScan } from '../lib/api';
import { useAuth } from '../context/AuthContext';

function Section({ title, children, color = 'var(--violet-light)' }: { title: string; children: React.ReactNode; color?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card" style={{ overflow:'hidden', marginBottom:12 }}>
      <button onClick={() => setOpen(p => !p)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', background:'none', border:'none', cursor:'pointer', color:'var(--text)' }}>
        <h4 style={{ fontSize:14, fontWeight:700, color }}>{title}</h4>
        {open ? <ChevronUp size={15} color="var(--text-3)" /> : <ChevronDown size={15} color="var(--text-3)" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} style={{ overflow:'hidden' }}>
            <div style={{ padding:'0 20px 20px' }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PrepPack({ data }: { data: any }) {
  // result might be "Discovery results with injected data" or "directly analyzed result"
  const company = data.company || data.companies?.[0]?.company;
  const role    = data.role    || data.companies?.[0]?.role;
  const pack    = data.top_questions ? data : data.companies?.[0]?.data;
  
  if (!pack) return null;

  return (
    <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}>
      {company && (
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
          <div style={{ width:40, height:40, borderRadius:12, background:'rgba(16,185,129,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Brain size={18} color="var(--emerald)" />
          </div>
          <div>
            <h3 style={{ fontSize:17, fontWeight:700 }}>{company}</h3>
            {role && <p style={{ fontSize:13, color:'var(--text-3)' }}>{role}</p>}
          </div>
        </div>
      )}

      {/* Questions */}
      {pack.top_questions?.length > 0 && (
        <Section title={`${pack.top_questions.length} Interview Questions`} color="var(--cyan)">
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {pack.top_questions.map((q: any, i: number) => (
              <div key={i} style={{ padding:'12px 14px', background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'var(--text-3)', minWidth:22, marginTop:1 }}>Q{i+1}</span>
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:13, lineHeight:1.6 }}>{q.question || q}</p>
                    {q.category && <div style={{ display:'flex', gap:6, marginTop:6 }}>
                      <span className="chip" style={{ fontSize:10 }}>{q.category}</span>
                      {q.difficulty && <span className={`chip diff-${q.difficulty?.toLowerCase()}`} style={{ fontSize:10 }}>{q.difficulty}</span>}
                    </div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* LeetCode */}
      {pack.leetcode_problems?.length > 0 && (
        <Section title="LeetCode Problems" color="var(--amber)">
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {pack.leetcode_problems.map((p: any, i: number) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)' }}>
                <span className={`chip diff-${p.difficulty?.toLowerCase()}`} style={{ fontSize:10, flexShrink:0 }}>{p.difficulty}</span>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:13, fontWeight:600 }}>{p.title}</p>
                  {p.topic && <p style={{ fontSize:11, color:'var(--text-3)' }}>{p.topic}</p>}
                  {p.why && <p style={{ fontSize:11, color:'var(--text-2)', marginTop:2 }}>{p.why}</p>}
                </div>
                <ExternalLink size={13} color="var(--text-3)" style={{ cursor:'pointer' }} onClick={() => window.open(`https://leetcode.com/problems/${p.title?.toLowerCase().replace(/\s+/g,'-')}`, '_blank')} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* DOs & DON'Ts */}
      {(pack.dos?.length > 0 || pack.donts?.length > 0) && (
        <Section title="DOs & DON'Ts" color="var(--emerald)">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:'var(--emerald)', marginBottom:8, letterSpacing:'0.06em' }}>DOs</p>
              {(pack.dos||[]).map((d:string,i:number) => <div key={i} style={{ padding:'8px 12px', background:'rgba(16,185,129,0.08)', borderRadius:8, fontSize:12, color:'var(--text-2)', marginBottom:6 }}>+ {d}</div>)}
            </div>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:'var(--rose)', marginBottom:8, letterSpacing:'0.06em' }}>DON'Ts</p>
              {(pack.donts||[]).map((d:string,i:number) => <div key={i} style={{ padding:'8px 12px', background:'rgba(244,63,94,0.08)', borderRadius:8, fontSize:12, color:'var(--text-2)', marginBottom:6 }}>- {d}</div>)}
            </div>
          </div>
        </Section>
      )}

      {/* Strategy */}
      {pack.prep_strategy && (
        <Section title="Prep Strategy" color="var(--violet-light)">
          {pack.prep_strategy.strategy && <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.75, marginBottom:16 }}>{pack.prep_strategy.strategy}</p>}
          {pack.prep_strategy.priority_areas?.length > 0 && (
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:'var(--text-3)', marginBottom:8, letterSpacing:'0.05em' }}>PRIORITY AREAS</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {pack.prep_strategy.priority_areas.map((a:string,i:number) => <span key={i} className="chip chip-violet" style={{ fontSize:11 }}>{a}</span>)}
              </div>
            </div>
          )}
        </Section>
      )}
    </motion.div>
  );
}

function DiscoveryCard({ company, role, timeLeft, onAnalyze, loading }: { company: string, role: string, timeLeft: string, onAnalyze: () => void, loading: boolean }) {
  return (
    <div className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, border: '1px solid var(--border-light)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(6,182,212,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Mail size={16} color="var(--cyan)" />
        </div>
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 700 }}>{company}</h4>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{role} • <span style={{ color: 'var(--cyan)' }}>{timeLeft}</span></p>
        </div>
      </div>
      <button 
        onClick={onAnalyze} 
        disabled={loading}
        className="btn btn-primary" 
        style={{ padding: '8px 16px', fontSize: 12, borderRadius: 8, height: 'fit-content', gap:8 }}
      >
        {loading ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Generating...</> : 'Generate Prep Pack'}
      </button>
    </div>
  );
}

export default function CompanyPrep() {
  const { accessToken, signInWithGoogle } = useAuth();
  const [text,    setText]     = useState('');
  const [result,  setResult]   = useState<any>(null);
  const [loading, setLoading]  = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [mode,    setMode]     = useState<'analyze'|'gmail'>('analyze');
  const [error,   setError]    = useState('');

  const handleAnalyze = async (customText?: string) => {
    const targetText = customText || text.trim();
    if (!targetText) return;
    
    if (customText) setGenerating(customText);
    else setLoading(true);
    
    setError(''); 
    try { 
      const res = await analyzeCompany(targetText); 
      if (customText) {
        // Update the list with the generated data
        setResult((prev: any) => {
          if (!prev || prev.mode !== 'gmail') return res;
          return {
            ...prev,
            companies: prev.companies.map((c: any) => 
              (`${c.company} ${c.role}` === customText) ? { ...c, data: res } : c
            )
          };
        });
      } else {
        setResult(res); 
      }
    }
    catch (e: any) { setError(e.response?.data?.detail || e.message); }
    finally { 
      setLoading(false); 
      setGenerating(null);
    }
  };

  const handleGmailScan = async () => {
    if (!accessToken) { setError('No Gmail access token. Please sign out and sign in again.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      if (!accessToken) await signInWithGoogle();
      const res = await gmailScan();
      setResult(res);
    }
    catch (e: any) {
      const msg = e.response?.data?.detail || e.message;
      setError(msg);
      if (e.response?.status === 403 || e.response?.status === 401) {
        setError('Gmail access denied. Please click "Switch account" to fix permissions.');
      }
    }
    finally { setLoading(false); }
  };

  return (
    <div style={{ padding:32, maxWidth:900, margin:'0 auto' }}>
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} style={{ marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
          <div style={{ width:40, height:40, borderRadius:12, background:'rgba(16,185,129,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Brain size={20} color="var(--emerald)" />
          </div>
          <div>
            <p className="label">MODULE 3</p>
            <h2 style={{ fontSize:22 }}>Company Intel & Smart Prep</h2>
          </div>
        </div>
        <p style={{ fontSize:14, color:'var(--text-2)' }}>Discover interview invites from Gmail (Quick Sync) or input a company manually.</p>
      </motion.div>

      <div className="tabs" style={{ marginBottom:20 }}>
        <button className={`tab ${mode==='analyze'?'active':''}`} onClick={() => setMode('analyze')}>Manual Input</button>
        <button className={`tab ${mode==='gmail'?'active':''}`}   onClick={() => setMode('gmail')}>Gmail Scan</button>
      </div>

      {mode === 'analyze' && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="card" style={{ padding:24, marginBottom:24 }}>
          <p style={{ fontSize:13, color:'var(--text-2)', marginBottom:12 }}>Paste a recruitment email <strong>or</strong> just type: <em style={{ color:'var(--text-3)' }}>"Google SWE 2 weeks"</em></p>
          <textarea className="input" rows={6} placeholder="Paste email content..." value={text} onChange={e => setText(e.target.value)} style={{ marginBottom:12 }} />
          <button onClick={() => handleAnalyze()} disabled={loading || !text.trim()} className="btn btn-primary" style={{ gap:8 }}>
            {loading ? <><Loader2 size={15} style={{ animation:'spin 1s linear infinite' }} />Analyzing…</> : <><Send size={15} />Analyze</>}
          </button>
        </motion.div>
      )}

      {mode === 'gmail' && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="card" style={{ padding:24, marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:20 }}>
            <Mail size={20} color="var(--cyan)" style={{ flexShrink:0, marginTop:2 }} />
            <div>
              <h4 style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Quick Gmail Sync</h4>
              <p style={{ fontSize:13, color:'var(--text-2)' }}>Instantly extracts company names and roles from your latest recruitment emails (~5 seconds).</p>
            </div>
          </div>
          
          <button onClick={handleGmailScan} disabled={loading} className="btn btn-primary" style={{ gap:8 }}>
            {loading ? (
              <><Loader2 size={15} style={{ animation:'spin 1s linear infinite' }} />Checking Gmail…</>
            ) : !accessToken ? (
              <><Mail size={15} />Connect Gmail Account</>
            ) : (
              <><Mail size={15} />Scan Inbox</>
            )}
          </button>
        </motion.div>
      )}

      {error && <div style={{ padding:'12px 16px', background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.25)', borderRadius:10, fontSize:13, color:'var(--rose)', marginBottom:16 }}>{error}</div>}

      {result && (
        <AnimatePresence mode="wait">
          {result.mode === 'gmail' && (
             <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ marginBottom:32 }}>
                {result.companies?.length > 0 ? (
                  <>
                    <p style={{ fontSize:11, fontWeight:700, color:'var(--text-3)', marginBottom:12, letterSpacing:'0.05em' }}>
                      DISCOVERED INVITATIONS ({result.companies.length})
                    </p>
                    {result.companies.map((c: any, i: number) => (
                      <div key={i} style={{ marginBottom: 24 }}>
                        {c.data ? (
                          <PrepPack data={c.data} />
                        ) : (
                          <DiscoveryCard 
                            company={c.company} 
                            role={c.role} 
                            timeLeft={c.time_left} 
                            loading={generating === `${c.company} ${c.role}`}
                            onAnalyze={() => handleAnalyze(`${c.company} ${c.role}`)} 
                          />
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                   <div className="card" style={{ padding:32, textAlign:'center', color:'var(--text-3)' }}>
                      <Mail size={32} style={{ marginBottom:12, opacity:0.3 }} />
                      <p>{result.message || 'No interview emails found in the last 60 days.'}</p>
                   </div>
                )}
             </motion.div>
          )}

          {result.mode !== 'gmail' && <PrepPack data={result} />}
        </AnimatePresence>
      )}
    </div>
  );
}
