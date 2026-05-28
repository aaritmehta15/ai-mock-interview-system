import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic, ArrowRight, Globe2, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Landing() {
  const { user, loading, signInWithGoogle } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, user, navigate]);

  if (!loading && user) return null;

  const handleSignIn = async () => {
    setSigning(true); setError('');
    try { await signInWithGoogle(); navigate('/dashboard'); }
    catch (e: any) { setError(e.message || 'Sign-in failed'); setSigning(false); }
  };

  return (
    <div className="hero-bg" style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      {/* Header */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 40px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Mic size={18} color="#fff" />
          </div>
          <span style={{ fontFamily:'Space Grotesk', fontWeight:700, fontSize:17, letterSpacing:'-0.02em' }}>DAAZLING</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={toggleTheme} className="theme-toggle">
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={handleSignIn} disabled={signing} className="btn btn-primary" style={{ gap:8 }}>
            <Globe2 size={15} />
            {signing ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </div>
      </header>

      {/* Hero */}
      <section style={{ maxWidth:760, margin:'0 auto', padding:'100px 24px 80px', textAlign:'center' }}>
        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5 }}>
          <div className="chip chip-violet" style={{ marginBottom:24, fontSize:12, padding:'6px 16px' }}>
            AI-Powered Mock Interview
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1, duration:0.6 }}
          style={{ fontSize:'clamp(36px,6vw,68px)', fontFamily:'Space Grotesk', fontWeight:800, letterSpacing:'-0.04em', lineHeight:1.05, marginBottom:24 }}
        >
          Voice Mock Interview<br />
          <span className="gradient-text">that feels real.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.2 }}
          style={{ fontSize:17, color:'var(--text-2)', maxWidth:520, margin:'0 auto 48px', lineHeight:1.75 }}
        >
          Enter any company and role. Alex — your AI interviewer — scrapes real questions,
          listens to your spoken answers, gives structured feedback, and delivers a detailed performance report.
        </motion.p>

        <motion.div initial={{ opacity:0, scale:0.96 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.3 }} style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginBottom:16 }}>
          <button onClick={handleSignIn} disabled={signing} className="btn btn-primary" style={{ fontSize:16, padding:'14px 32px', gap:10 }}>
            <Globe2 size={18} />
            {signing ? 'Signing in...' : 'Get started with Google'}
            <ArrowRight size={16} />
          </button>
        </motion.div>

        {error && (
          <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ color:'var(--rose)', fontSize:13, marginTop:12 }}>
            {error}
          </motion.p>
        )}

        <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.5 }} style={{ fontSize:12, color:'var(--text-3)', marginTop:12 }}>
          Sign in with Google to start your mock interview
        </motion.p>
      </section>

      {/* Feature Cards */}
      <section style={{ maxWidth:900, margin:'0 auto', padding:'0 24px 100px' }}>
        <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.4 }} className="label" style={{ textAlign:'center', marginBottom:32 }}>How it works</motion.p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:14 }}>
          {[
            { step: '1', title: 'Enter Company & Role', desc: 'Type the company and position you\'re interviewing for.' },
            { step: '2', title: 'Scrape Real Questions', desc: 'AI fetches real questions asked at that company for that role.' },
            { step: '3', title: 'Speak Your Answers', desc: 'Alex asks questions aloud. Click the mic and speak your answer.' },
            { step: '4', title: 'Get Detailed Report', desc: 'Receive structured feedback + a scored performance report.' },
          ].map(({ step, title, desc }, i) => (
            <motion.div
              key={i}
              initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1*i+0.5 }}
              className="card"
              style={{ padding:24, cursor:'pointer' }}
              onClick={handleSignIn}
            >
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(14,165,233,0.12)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16, fontWeight:800, fontSize:16, color:'#0ea5e9' }}>{step}</div>
              <h3 style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>{title}</h3>
              <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>{desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop:'1px solid var(--border)', padding:'24px 40px', textAlign:'center' }}>
        <p style={{ fontSize:12, color:'var(--text-3)' }}>DAAZLING 2025 — Voice Mock Interview · Built for placement excellence.</p>
      </footer>
    </div>
  );
}
