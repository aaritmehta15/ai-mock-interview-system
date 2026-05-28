
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic, ArrowRight, Calendar, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const firstName = user?.displayName?.split(' ')[0] || 'there';
  const today = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' });

  return (
    <div style={{ padding:32, maxWidth:900, margin:'0 auto' }}>
      {/* Header */}
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} style={{ marginBottom:36 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <p className="label" style={{ opacity: 0.7, marginBottom: 4 }}>WELCOME BACK</p>
            <h1 style={{ fontSize:28, fontWeight: 800, letterSpacing: '-0.02em' }}>
              Good morning, {firstName}
            </h1>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={14} color="var(--text-3)" />
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>TODAY</span>
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginTop: 2 }}>{today}</p>
          </div>
        </div>
      </motion.div>

      {/* Status row */}
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.05 }}
        style={{ display:'flex', gap:12, marginBottom:40 }}>
        <div className="card" style={{ padding:'20px 24px', flex:1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div className="stat-icon-box" style={{ background: 'rgba(16,185,129,0.15)' }}>
              <ShieldCheck size={14} color="var(--emerald)" />
            </div>
            <span style={{ fontSize:11, fontWeight: 600, color:'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>System Status</span>
          </div>
          <div style={{ fontSize:28, fontFamily:'Space Grotesk', fontWeight:800, color: 'var(--text)' }}>Ready</div>
        </div>
      </motion.div>

      {/* Interview Module */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <p className="label" style={{ marginBottom:0 }}>Voice Mock Interview</p>
        <div style={{ flex: 1, height: 1, background: 'var(--border)', opacity: 0.5 }} />
      </div>

      <motion.div
        initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}
        className="card"
        style={{ padding:32, display:'flex', flexDirection:'column', gap:20, maxWidth:500 }}
      >
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div style={{ width:52, height:52, borderRadius:14, background:'rgba(14,165,233,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Mic size={24} color="#0ea5e9" />
          </div>
          <span className="chip" style={{ fontSize:10, color:'var(--text-3)', letterSpacing:'0.06em' }}>MODULE 2</span>
        </div>
        <div>
          <h2 style={{ fontSize:20, fontWeight:700, marginBottom:10 }}>Voice Mock Interview</h2>
          <p style={{ fontSize:14, color:'var(--text-2)', lineHeight:1.7, opacity: 0.85 }}>
            AI interviewer scrapes real company questions, listens to your spoken answers via microphone,
            gives structured feedback after each answer, and generates a detailed performance report at the end.
          </p>
        </div>
        <button
          onClick={() => navigate('/interview')}
          className="btn btn-primary"
          style={{ justifyContent:'space-between', padding:'14px 20px', fontSize:14, fontWeight:600 }}
        >
          Start Interview
          <ArrowRight size={16} />
        </button>
      </motion.div>
    </div>
  );
}
