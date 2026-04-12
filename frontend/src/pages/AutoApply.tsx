import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import { FileSearch, Upload, CheckCircle, ExternalLink, Filter, RotateCcw, AlertCircle, BookOpen, Layers } from 'lucide-react';
import { processResumeAll, getResumeGaps, getProjectSuggestions } from '../lib/api';

type Difficulty = 'Easy'|'Medium'|'Hard'|'All';
type FilterState = { difficulty: Difficulty; platform: string; category: string };

function OpportunityCard({ opp, index }: { opp: any; index: number }) {
  const diffClass = { Easy:'diff-easy', Medium:'diff-medium', Hard:'diff-hard' }[opp.difficulty as string] || '';
  return (
    <motion.a
      href={opp.link} target="_blank" rel="noopener noreferrer"
      initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.02*index }}
      className="card" style={{ padding:20, display:'flex', flexDirection:'column', gap:12, textDecoration:'none', color:'var(--text)', cursor:'pointer' }}
      whileHover={{ y:-2, boxShadow:'0 4px 24px rgba(124,58,237,0.15)' }}
    >
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
        <div style={{ flex:1 }}>
          <p style={{ fontSize:14, fontWeight:700, marginBottom:3 }}>{opp.title}</p>
          <p style={{ fontSize:12, color:'var(--text-3)' }}>{opp.company}</p>
        </div>
        <ExternalLink size={14} color="var(--text-3)" style={{ flexShrink:0, marginTop:2 }} />
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        {opp.platform && <span className="chip" style={{ fontSize:10 }}>{opp.platform}</span>}
        {opp.difficulty && <span className={`chip ${diffClass}`} style={{ fontSize:10 }}>{opp.difficulty}</span>}
        {opp.time_to_apply && <span className="chip chip-cyan" style={{ fontSize:10 }}>⏱ {opp.time_to_apply}</span>}
      </div>
      {opp.why_fit && <p style={{ fontSize:12, color:'var(--text-2)', lineHeight:1.6 }}>{opp.why_fit}</p>}
      {opp.matchedSkills?.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
          {opp.matchedSkills.slice(0,4).map((s:string,i:number) => <span key={i} className="chip chip-violet" style={{ fontSize:10 }}>{s}</span>)}
        </div>
      )}
    </motion.a>
  );
}

export default function AutoApply() {
  const [result,   setResult]   = useState<any>(null);
  const [loading,  setLoading]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [error,    setError]    = useState('');
  const [file,     setFile]     = useState<File|null>(null);
  const [filters,  setFilters]  = useState<FilterState>({ difficulty:'All', platform:'All', category:'All' });
  const [gaps, setGaps] = useState<any>(null);
  const [projects, setProjects] = useState<any>(null);
  const [loadingExtras, setLoadingExtras] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf':['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['.docx'], 'text/plain':['.txt'] },
    maxSize: 10*1024*1024, multiple: false,
  });

  const fetchEnhancements = async (sessionId: string) => {
    setLoadingExtras(true);
    try {
      const [gData, pData] = await Promise.all([
        getResumeGaps(sessionId).catch(() => null),
        getProjectSuggestions(sessionId).catch(() => null)
      ]);
      if (gData) setGaps(gData);
      if (pData) setProjects(pData);
    } catch (e) { console.error(e); }
    finally { setLoadingExtras(false); }
  };

  const handleProcess = async () => {
    if (!file) return;
    setLoading(true); setError(''); setResult(null); setProgress(0); 
    setGaps(null); setProjects(null);
    try {
      const data = await processResumeAll(file, p => setProgress(p));
      setResult(data);
      fetchEnhancements(data.sessionId);
    } catch (e: any) { setError(e.response?.data?.detail || e.message); }
    finally { setLoading(false); }
  };

  const reset = () => { setResult(null); setFile(null); setError(''); setProgress(0); setGaps(null); setProjects(null); };

  // Filter logic
  const filtered = (result?.opportunities || []).filter((o: any) => {
    if (filters.difficulty !== 'All' && o.difficulty !== filters.difficulty) return false;
    if (filters.platform   !== 'All' && o.platform   !== filters.platform)   return false;
    if (filters.category   !== 'All' && o.category   !== filters.category)   return false;
    return true;
  });

  const platforms  = ['All', ...Array.from(new Set((result?.opportunities||[]).map((o:any) => o.platform).filter(Boolean)))];
  const categories = ['All', ...Array.from(new Set((result?.opportunities||[]).map((o:any) => o.category).filter(Boolean)))];

  return (
    <div style={{ padding:32, maxWidth:1100, margin:'0 auto' }}>
      {/* Header */}
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:12, background:'rgba(245,158,11,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <FileSearch size={20} color="var(--amber)" />
          </div>
          <div>
            <p className="label">MODULE 4</p>
            <h2 style={{ fontSize:22 }}>Auto Apply Engine</h2>
          </div>
        </div>
        {result && <button onClick={reset} className="btn btn-secondary" style={{ fontSize:13, gap:6 }}><RotateCcw size={13} /> New Resume</button>}
      </motion.div>

      {!result && (
        <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}>
          {/* Dropzone */}
          <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`} style={{ marginBottom:20, position:'relative' }}>
            <input {...getInputProps()} />
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
              <div style={{ width:56, height:56, borderRadius:16, background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Upload size={24} color="var(--amber)" />
              </div>
              {file ? (
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <CheckCircle size={16} color="var(--emerald)" />
                  <span style={{ fontSize:14, fontWeight:600 }}>{file.name}</span>
                  <span style={{ fontSize:12, color:'var(--text-3)' }}>({(file.size/1024).toFixed(0)} KB)</span>
                </div>
              ) : (
                <>
                  <p style={{ fontSize:15, fontWeight:600 }}>{isDragActive ? 'Drop it!' : 'Drop your resume here'}</p>
                  <p style={{ fontSize:13, color:'var(--text-3)' }}>PDF, DOCX, or TXT · max 10 MB</p>
                </>
              )}
            </div>
          </div>

          {file && (
            <div style={{ marginBottom:16 }}>
              {loading && progress > 0 && progress < 100 && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:12, color:'var(--text-3)' }}>Uploading…</span>
                    <span style={{ fontSize:12, color:'var(--violet-light)', fontWeight:700 }}>{progress}%</span>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width:`${progress}%` }} /></div>
                </div>
              )}
              <button onClick={handleProcess} disabled={loading} className="btn btn-primary" style={{ gap:8 }}>
                {loading
                  ? <><div className="spinner" style={{ width:16, height:16, borderWidth:2 }} />Analyzing with AI…</>
                  : <><FileSearch size={15} />Analyze & Match</>}
              </button>
            </div>
          )}

          {error && <div style={{ padding:'12px 16px', background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.25)', borderRadius:10, fontSize:13, color:'var(--rose)', marginBottom:16 }}>{error}</div>}

          {/* Features */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginTop:32 }}>
            {[
              { icon:'🧠', label:'AI Parsing',     color:'var(--violet-light)', desc:'Groq extracts all skills' },
              { icon:'🎯', label:'Role Matching',   color:'var(--cyan)',         desc:'9 role categories' },
              { icon:'💡', label:'Why It Fits',     color:'var(--emerald)',      desc:'Personalised AI blurbs' },
              { icon:'🔗', label:'Direct Links',    color:'var(--amber)',        desc:'LinkedIn, Internshala…' },
            ].map(({ icon, label, color, desc }, i) => (
              <div key={i} className="card" style={{ padding:'18px 16px', textAlign:'center' }}>
                <p style={{ fontSize:24, marginBottom:8 }}>{icon}</p>
                <p style={{ fontSize:13, fontWeight:700, color, marginBottom:4 }}>{label}</p>
                <p style={{ fontSize:11, color:'var(--text-3)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {result && (
        <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}>
          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12, marginBottom:24 }}>
            {[
              { label:'Opportunities', value:result.totalOpportunities||result.opportunities?.length||0, color:'var(--violet-light)' },
              { label:'Role Categories', value:result.matchedRoles?.length||0, color:'var(--cyan)' },
              { label:'Skills Found',   value: Object.values(result.profile?.skills||{}).flat().length, color:'var(--emerald)' },
              { label:'File', value: result.fileName || 'resume', color:'var(--amber)', small:true },
            ].map(({ label, value, color, small }, i) => (
              <div key={i} className="card" style={{ padding:'16px 18px' }}>
                <p style={{ fontSize: small?13:26, fontWeight:800, color }}>{value}</p>
                <p style={{ fontSize:11, color:'var(--text-3)', marginTop:2 }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Skills */}
          {result.profile?.skills && (
            <div className="card" style={{ padding:20, marginBottom:20 }}>
              <h4 style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>Extracted Skills</h4>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {Object.entries(result.profile.skills as Record<string,string[]>).map(([cat, skills]) => skills?.length > 0 && (
                  <div key={cat}>
                    <p style={{ fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:6 }}>{cat}</p>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {skills.map((s,i) => <span key={i} className="chip" style={{ fontSize:11 }}>{s}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched roles */}
          {result.matchedRoles?.length > 0 && (
            <div className="card" style={{ padding:20, marginBottom:20 }}>
              <h4 style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>Role Matching</h4>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
                {result.matchedRoles.map((r:any,i:number) => (
                  <div key={i} style={{ padding:'12px 14px', background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)' }}>
                    <p style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>{r.category}</p>
                    <div className="progress-bar" style={{ marginBottom:4 }}><div className="progress-fill" style={{ width:`${Math.min(100,(r.score/40)*100)}%` }} /></div>
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontSize:10, color:'var(--text-3)' }}>{r.confidence}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:'var(--violet-light)' }}>{r.score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Enhancements (Gaps & Projects) */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:20, marginBottom:20 }}>
            {/* Gaps */}
            <div className="card" style={{ padding:20 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <h4 style={{ fontSize:14, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><AlertCircle size={15} color="var(--rose)"/> Resume Gaps</h4>
                {loadingExtras && !gaps && <div className="spinner" style={{ width:14, height:14 }} />}
              </div>
              {gaps ? (
                <div>
                  {gaps.missing_skills?.length > 0 && (
                    <div style={{ marginBottom:14 }}>
                      <p style={{ fontSize:10, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', marginBottom:6 }}>Missing Skills</p>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {gaps.missing_skills.map((s:string, i:number) => <span key={i} className="chip" style={{ fontSize:11, background:'rgba(244,63,94,0.1)', color:'var(--rose)' }}>{s}</span>)}
                      </div>
                    </div>
                  )}
                  {gaps.actionable_steps?.length > 0 && (
                    <div>
                      <p style={{ fontSize:10, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', marginBottom:6 }}>Recommended Actions</p>
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {gaps.actionable_steps.map((a:any, i:number) => (
                          <div key={i} style={{ padding:'10px', background:'var(--surface-2)', borderRadius:8, border:'1px solid var(--border)' }}>
                            <p style={{ fontSize:12, fontWeight:700, marginBottom:4, display:'flex', alignItems:'center', gap:6 }}><BookOpen size={12} color="var(--cyan)"/> {a.action}</p>
                            <p style={{ fontSize:11, color:'var(--text-3)' }}>{a.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : !loadingExtras ? <p style={{ fontSize:12, color:'var(--text-3)' }}>Not available</p> : <p style={{ fontSize:12, color:'var(--text-3)' }}>Analyzing gaps...</p>}
            </div>

            {/* Projects */}
            <div className="card" style={{ padding:20 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <h4 style={{ fontSize:14, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Layers size={15} color="var(--emerald)"/> Project Suggestions</h4>
                {loadingExtras && !projects && <div className="spinner" style={{ width:14, height:14 }} />}
              </div>
              {projects ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {projects.project_suggestions?.map((p:any, i:number) => (
                    <div key={i} style={{ padding:'12px', background:'var(--surface-2)', borderRadius:8, border:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                        <p style={{ fontSize:13, fontWeight:700 }}>{p.title}</p>
                        <span className="chip" style={{ fontSize:9 }}>{p.difficulty}</span>
                      </div>
                      <p style={{ fontSize:11, color:'var(--text-2)', marginBottom:8 }}>{p.description}</p>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                        {p.tech_stack?.slice(0,4).map((tech:string, j:number) => <span key={j} className="chip chip-cyan" style={{ fontSize:9 }}>{tech}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : !loadingExtras ? <p style={{ fontSize:12, color:'var(--text-3)' }}>Not available</p> : <p style={{ fontSize:12, color:'var(--text-3)' }}>Generating projects...</p>}
            </div>
          </div>

          {/* Filters + Opportunities */}
          <div style={{ display:'flex', gap:20, alignItems:'flex-start' }}>
            {/* Sidebar filters */}
            <div style={{ width:200, flexShrink:0 }}>
              <div className="card" style={{ padding:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14 }}>
                  <Filter size={13} color="var(--text-3)" />
                  <span style={{ fontSize:12, fontWeight:700 }}>Filters</span>
                </div>
                {[
                  { label:'Difficulty', key:'difficulty', options:['All','Easy','Medium','Hard'] },
                  { label:'Platform',   key:'platform',   options:platforms as string[] },
                  { label:'Category',   key:'category',   options:categories as string[] },
                ].map(({ label, key, options }) => (
                  <div key={key} style={{ marginBottom:14 }}>
                    <p style={{ fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 }}>{label}</p>
                    <select
                      value={(filters as any)[key]}
                      onChange={e => setFilters(f => ({ ...f, [key]:e.target.value }))}
                      className="input" style={{ fontSize:12, padding:'7px 10px' }}
                    >
                      {options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {result.dynamicLinks?.length > 0 && (
                <div className="card" style={{ padding:16, marginTop:12 }}>
                  <p style={{ fontSize:12, fontWeight:700, marginBottom:10 }}>Quick Search</p>
                  {result.dynamicLinks.map((l:any,i:number) => (
                    <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 0', fontSize:12, color:'var(--text-2)', textDecoration:'none', borderBottom:'1px solid var(--border)' }}>
                      <ExternalLink size={11} /> {l.platform}
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Cards grid */}
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <h4 style={{ fontSize:14, fontWeight:700 }}>Opportunities <span style={{ color:'var(--text-3)', fontWeight:400 }}>({filtered.length})</span></h4>
              </div>
              {filtered.length === 0
                ? <div className="card" style={{ padding:48, textAlign:'center' }}><p style={{ color:'var(--text-3)' }}>No matches for filters</p></div>
                : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:12 }}>
                    {filtered.map((o:any,i:number) => <OpportunityCard key={i} opp={o} index={i} />)}
                  </div>
              }
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
