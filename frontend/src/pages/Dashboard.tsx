import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Zap, Mic, Brain, FileSearch, ArrowRight, 
  Sparkles, TrendingUp, Calendar, Target, Award, ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getProfile } from '../lib/api';

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
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const firstName = user?.displayName?.split(' ')[0] || 'there';
  const today = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' });

  useEffect(() => {
    if (!user) return;
    getProfile(user.uid)
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const stats = [
    { 
      label: 'Target Companies', 
      value: profile?.targetCompanies?.length || 0, 
      color: 'var(--emerald)', 
      icon: Target 
    },
    { 
      label: 'Technical Skills', 
      value: profile?.skills?.length || 0, 
      color: 'var(--violet-light)', 
      icon: Award 
    },
    { 
      label: 'Preparation Bias', 
      value: profile?.priorityBias === 'high_package' ? 'High Pack' : 
             profile?.priorityBias === 'learning' ? 'Skills' : 
             profile?.priorityBias === 'stability' ? 'Stable' : 'Standard', 
      color: 'var(--cyan)', 
      icon: Zap 
    },
    { 
      label: 'System Status', 
      value: 'Ready', 
      color: 'var(--emerald)', 
      icon: ShieldCheck 
    },
  ];

  return (
    <div style={{ padding:32, maxWidth:1200, margin:'0 auto' }}>
      {/* Header */}
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} style={{ marginBottom:36 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
          <div style={{ 
            width:44, height:44, borderRadius:12, 
            background:'linear-gradient(135deg,#7c3aed,#06b6d4)', 
            display:'flex', alignItems:'center', justifyContent:'center', 
            boxShadow:'0 0 24px rgba(124,58,237,0.4)' 
          }}>
            <Sparkles size={20} color="#fff" />
          </div>
          <div>
            <p className="label" style={{ opacity: 0.7 }}>WELCOME BACK · {today.toUpperCase()}</p>
            <h1 style={{ fontSize:28, fontWeight: 800, marginTop:2, letterSpacing: '-0.02em' }}>
              Good morning, {firstName} 👋
            </h1>
          </div>
        </div>
      </motion.div>

      {/* Metrics Row */}
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.05 }}
        style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:40 }}>
        {stats.map(({ label, value, color, icon: Icon }, i) => (
          <motion.div key={i} whileHover={{ y:-2 }} className="card" style={{ padding:'20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={14} color={color} />
              </div>
              <span style={{ fontSize:11, fontWeight: 600, color:'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
            </div>
            <div style={{ fontSize:28, fontFamily:'Space Grotesk', fontWeight:800, color: 'var(--text)' }}>
              {loading ? '...' : value}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Modules Section */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <p className="label" style={{ marginBottom:0 }}>Intelligence Modules</p>
        <div style={{ flex: 1, height: 1, background: 'var(--border)', opacity: 0.5 }} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16, marginBottom: 40 }}>
        {modules.map(({ to, icon: Icon, color, bg, border, label, sublabel, desc, cta }, i) => (
          <motion.div
            key={to}
            whileHover={{ y: -4, borderColor: color }}
            initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.08*i+0.1 }}
            className="card card-glow"
            style={{ 
              padding:24, display:'flex', flexDirection:'column', gap:16, 
              background: 'linear-gradient(180deg, var(--surface) 0%, rgba(124,58,237,0.02) 100%)' 
            }}
          >
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
              <div style={{ width:48, height:48, borderRadius:14, background:bg, border:`1px solid ${border}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon size={22} color={color} />
              </div>
              <span className="chip" style={{ fontSize:10, color:'var(--text-3)', letterSpacing:'0.06em' }}>{sublabel}</span>
            </div>
            <div>
              <h3 style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>{label}</h3>
              <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6, opacity: 0.8 }}>{desc}</p>
            </div>
            <motion.button
              whileHover={{ x:4 }} onClick={() => navigate(to)}
              className="btn btn-ghost"
              style={{ justifyContent:'space-between', padding:'10px 14px', border:'1px solid var(--border)', marginTop:'auto', color, fontSize:13, fontWeight: 600 }}
            >
              {cta}
              <ArrowRight size={14} />
            </motion.button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
