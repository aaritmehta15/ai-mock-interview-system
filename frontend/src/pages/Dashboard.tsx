import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Mic, Brain, FileSearch, ArrowRight, Sparkles, TrendingUp, Calendar } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const modules = [
  {
    to: '/priority', icon: Zap, color: '#06b6d4', bg: 'rgba(6,182,212,0.1)', border: 'rgba(6,182,212,0.2)',
    label: 'Smart Priority Engine',
    sublabel: 'MODULE 1',
    desc: 'Connect Gmail → AI builds your daily study plan based on your real placement schedule.',
    cta: 'Generate Today\'s Plan',
  },
  {
    to: '/interview', icon: Mic, color: '#a855f7', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.2)',
    label: 'Voice Mock Interview',
    sublabel: 'MODULE 2',
    desc: 'AI poses scraped questions, listens to your spoken answers, gives structured feedback.',
    cta: 'Start Interview',
  },
  {
    to: '/prep', icon: Brain, color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)',
    label: 'Company Intel & Prep',
    sublabel: 'MODULE 3',
    desc: 'Paste email or company name → full prep pack: questions, LeetCode, DOs/DON\'Ts, strategy.',
    cta: 'Analyze Company',
  },
  {
    to: '/apply', icon: FileSearch, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)',
    label: 'Auto Apply Engine',
    sublabel: 'MODULE 4',
    desc: 'Upload resume → AI matches to roles → curated application links with personalised "why it fits".',
    cta: 'Upload Resume',
  },
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.displayName?.split(' ')[0] || 'there';
  const today = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' });

  return (
    <div style={{ padding:32, maxWidth:1200, margin:'0 auto' }}>
      {/* Welcome */}
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} style={{ marginBottom:36 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'linear-gradient(135deg,#7c3aed,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 24px rgba(124,58,237,0.4)' }}>
            <Sparkles size={20} color="#fff" />
          </div>
          <div>
            <p className="label">DAAZLING · AI PLACEMENT OS</p>
            <h1 style={{ fontSize:26, marginTop:2 }}>Good morning, {firstName} 👋</h1>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
          <Calendar size={13} color="var(--text-3)" />
          <span style={{ fontSize:13, color:'var(--text-3)' }}>{today}</span>
          <span style={{ width:4, height:4, borderRadius:'50%', background:'var(--text-3)' }} />
          <TrendingUp size={13} color="var(--emerald)" />
          <span style={{ fontSize:13, color:'var(--emerald)' }}>All systems active</span>
        </div>
      </motion.div>

      {/* Quick stats row */}
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.05 }}
        style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:36 }}>
        {[
          { label:'Modules Active', value:'4', color:'var(--violet)', icon: Sparkles },
          { label:'Routes Available', value:'19', color:'var(--cyan)', icon: Zap },
          { label:'AI Models', value:'Groq', color:'var(--emerald)', icon: Brain },
          { label:'Status', value:'Live', color:'var(--emerald)', icon: TrendingUp },
        ].map(({ label, value, color, icon: Icon }, i) => (
          <motion.div key={i} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.05*i+0.1 }} className="card" style={{ padding:'18px 20px' }}>
            <Icon size={16} color={color} style={{ marginBottom:8 }} />
            <div style={{ fontSize:24, fontFamily:'Space Grotesk', fontWeight:800, color }}>{value}</div>
            <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>{label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Module cards */}
      <p className="label" style={{ marginBottom:16 }}>Your Modules</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16 }}>
        {modules.map(({ to, icon: Icon, color, bg, border, label, sublabel, desc, cta }, i) => (
          <motion.div
            key={to}
            initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.08*i+0.2 }}
            className="card card-glow"
            style={{ padding:24, display:'flex', flexDirection:'column', gap:16 }}
          >
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
              <div style={{ width:48, height:48, borderRadius:14, background:bg, border:`1px solid ${border}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon size={22} color={color} />
              </div>
              <span className="chip" style={{ fontSize:10, color:'var(--text-3)', letterSpacing:'0.06em' }}>{sublabel}</span>
            </div>
            <div>
              <h3 style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>{label}</h3>
              <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.65 }}>{desc}</p>
            </div>
            <motion.button
              whileHover={{ x:4 }} onClick={() => navigate(to)}
              className="btn btn-ghost"
              style={{ justifyContent:'space-between', padding:'10px 14px', border:'1px solid var(--border)', marginTop:'auto', color, fontSize:13 }}
            >
              {cta}
              <ArrowRight size={14} />
            </motion.button>
          </motion.div>
        ))}
      </div>

      {/* Footer info */}
      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.6 }}
        style={{ marginTop:48, padding:24, borderRadius:'var(--radius)', background:'var(--surface)', border:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ width:40, height:40, borderRadius:10, background:'rgba(124,58,237,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Sparkles size={18} color="var(--violet-light)" />
        </div>
        <div>
          <p style={{ fontSize:14, fontWeight:600, marginBottom:2 }}>Backend running on <code style={{ color:'var(--cyan)', background:'var(--surface-2)', padding:'1px 6px', borderRadius:4 }}>localhost:8000</code></p>
          <p style={{ fontSize:12, color:'var(--text-3)' }}>All API calls proxy through Vite dev server. Start the backend with <code style={{ color:'var(--violet-light)' }}>uvicorn main:app --reload</code></p>
        </div>
      </motion.div>
    </div>
  );
}
