import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Zap, Mic, Brain, FileSearch, ArrowRight, 
  Target, Award, ShieldCheck, Calendar
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getProfile } from '../lib/api';

const modules = [
  {
    to: '/priority', icon: Zap, color: '#06b6d4',
    label: 'Smart Priority Engine',
    sublabel: 'MODULE 1',
    desc: 'Connect Gmail -- system builds your daily study plan based on your real placement schedule.',
    cta: 'Generate Today\'s Plan',
  },
  {
    to: '/interview', icon: Mic, color: '#0ea5e9',
    label: 'Voice Mock Interview',
    sublabel: 'MODULE 2',
    desc: 'Poses scraped questions, listens to your spoken answers, gives structured feedback.',
    cta: 'Start Interview',
  },
  {
    to: '/prep', icon: Brain, color: '#10b981',
    label: 'Company Intel & Prep',
    sublabel: 'MODULE 3',
    desc: 'Paste email or company name for a full prep pack: questions, LeetCode, DOs/DON\'Ts, strategy.',
    cta: 'Analyze Company',
  },
  {
    to: '/apply', icon: FileSearch, color: '#f59e0b',
    label: 'Auto Apply Engine',
    sublabel: 'MODULE 4',
    desc: 'Upload resume for matched roles and curated application links with personalised "why it fits".',
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
      color: 'var(--accent-light)', 
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

      {/* Metrics Row */}
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.05 }}
        style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:40 }}>
        {stats.map(({ label, value, color, icon: Icon }, i) => (
          <div key={i} className="card" style={{ padding:'20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div className="stat-icon-box" style={{ background: `${color}15` }}>
                <Icon size={14} color={color} />
              </div>
              <span style={{ fontSize:11, fontWeight: 600, color:'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
            </div>
            <div style={{ fontSize:28, fontFamily:'Space Grotesk', fontWeight:800, color: 'var(--text)' }}>
              {loading ? '...' : value}
            </div>
          </div>
        ))}
      </motion.div>

      {/* Modules Section */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <p className="label" style={{ marginBottom:0 }}>Intelligence Modules</p>
        <div style={{ flex: 1, height: 1, background: 'var(--border)', opacity: 0.5 }} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:14, marginBottom: 40 }}>
        {modules.map(({ to, icon: Icon, color, label, sublabel, desc, cta }, i) => (
          <motion.div
            key={to}
            initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.08*i+0.1 }}
            className="card"
            style={{ padding:24, display:'flex', flexDirection:'column', gap:16 }}
          >
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
              <div style={{ width:44, height:44, borderRadius:12, background:`${color}14`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon size={20} color={color} />
              </div>
              <span className="chip" style={{ fontSize:10, color:'var(--text-3)', letterSpacing:'0.06em' }}>{sublabel}</span>
            </div>
            <div>
              <h3 style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>{label}</h3>
              <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6, opacity: 0.8 }}>{desc}</p>
            </div>
            <button
              onClick={() => navigate(to)}
              className="btn btn-ghost"
              style={{ justifyContent:'space-between', padding:'10px 14px', border:'1px solid var(--border)', marginTop:'auto', color, fontSize:13, fontWeight: 600 }}
            >
              {cta}
              <ArrowRight size={14} />
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
