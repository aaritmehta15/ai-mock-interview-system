import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Save, CheckCircle, AlertTriangle, Plus, X, Building2,
  GraduationCap, Target, TrendingUp, BookOpen, Star, RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getProfile, updateProfile } from '../lib/api';
import { useDebounce } from '../hooks/useDebounce';

const BIAS_OPTIONS = [
  { value: 'high_package', label: 'High Package', desc: 'Prioritise highest-paying offers' },
  { value: 'learning', label: 'Learning & Growth', desc: 'Prioritise innovative companies' },
  { value: 'stability', label: 'Stability', desc: 'Prioritise stable, established firms' },
];

const BRANCHES = ['CSE', 'IT', 'ECE', 'EEE', 'ME', 'CE', 'AIDS', 'AIML', 'DS', 'Other'];
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

export default function Profile() {
  const { user } = useAuth();

  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState('');

  // Form state
  const [name, setName]             = useState('');
  const [branch, setBranch]         = useState('CSE');
  const [year, setYear]             = useState('3rd Year');
  const [cgpa, setCgpa]             = useState('');
  const [priorityBias, setPriorityBias] = useState('high_package');
  const [targetCompanies, setTargetCompanies] = useState<string[]>([]);
  const [companyInput, setCompanyInput] = useState('');
  const [skills, setSkills]         = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');

  // Load existing profile
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    getProfile(user.uid)
      .then((data: any) => {
        setName(data.name          || user.displayName || '');
        setBranch(data.branch      || 'CSE');
        setYear(data.year          || '3rd Year');
        setCgpa(data.cgpa          ? String(data.cgpa) : '');
        setPriorityBias(data.priorityBias || 'high_package');
        setTargetCompanies(data.targetCompanies || []);
        setSkills(data.skills      || []);
      })
      .catch(() => {
        // 404 → new profile; pre-fill from Firebase display name
        setName(user.displayName || '');
      })
      .finally(() => setLoading(false));
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      await updateProfile(user.uid, {
        name, branch, year,
        cgpa: cgpa ? parseFloat(cgpa) : null,
        priorityBias,
        targetCompanies,
        skills,
        email: user.email,
        photoURL: user.photoURL,
        updatedAt: new Date().toISOString(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };


  const addCompany = () => {
    const v = companyInput.trim();
    if (v && !targetCompanies.includes(v)) setTargetCompanies(p => [...p, v]);
    setCompanyInput('');
  };

  const addSkill = () => {
    const v = skillInput.trim();
    if (v && !skills.includes(v)) setSkills(p => [...p, v]);
    setSkillInput('');
  };

  const [imgError, setImgError] = useState(false);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  );

  if (!user) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <p style={{ color: 'var(--text-2)' }}>Sign in first to manage your profile.</p>
    </div>
  );

  return (
    <div style={{ padding: 32, maxWidth: 820, margin: '0 auto' }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          {user.photoURL && !imgError
            ? <img src={user.photoURL} alt="" onError={() => setImgError(true)} style={{ width: 52, height: 52, borderRadius: '50%', border: '2px solid rgba(14,165,233,0.4)', objectFit: 'cover' }} />
            : (
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={24} color="#fff" />
              </div>
            )
          }
          <div>
            <p className="label">STUDENT PROFILE</p>
            <h2 style={{ fontSize: 22 }}>{user.displayName || 'Your Profile'}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{user.email}</p>
          </div>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 12 }}>
          Your profile drives the Priority Engine's company-match bonuses and personalises your daily study plan.
        </p>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ padding: '12px 16px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: 10, marginBottom: 20, fontSize: 13, color: 'var(--rose)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertTriangle size={14} />{error}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Basic Info */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="card" style={{ padding: 24, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <GraduationCap size={16} color="var(--violet-light)" />
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>Basic Information</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            <div>
              <label className="label" style={{ fontSize: 11, marginBottom: 6, display: 'block' }}>Full Name</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11, marginBottom: 6, display: 'block' }}>Branch</label>
              <select className="input" value={branch} onChange={e => setBranch(e.target.value)}
                style={{ background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer' }}>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 11, marginBottom: 6, display: 'block' }}>Current Year</label>
              <select className="input" value={year} onChange={e => setYear(e.target.value)}
                style={{ background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer' }}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 11, marginBottom: 6, display: 'block' }}>CGPA</label>
              <input className="input" type="number" min={0} max={10} step={0.01}
                value={cgpa} onChange={e => setCgpa(e.target.value)} placeholder="e.g. 8.5" />
            </div>
          </div>
        </motion.div>

        {/* Priority Bias */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Target size={16} color="var(--cyan)" />
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>Priority Bias</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {BIAS_OPTIONS.map(opt => (
              <motion.button key={opt.value} whileHover={{ x: 2 }}
                onClick={() => setPriorityBias(opt.value)}
                style={{
                  padding: '12px 14px', borderRadius: 10, border: `1px solid ${priorityBias === opt.value ? 'rgba(6,182,212,0.5)' : 'var(--border)'}`,
                  background: priorityBias === opt.value ? 'rgba(6,182,212,0.08)' : 'var(--surface-2)',
                  textAlign: 'left', cursor: 'pointer', color: 'var(--text)',
                }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{opt.desc}</div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Target Companies */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Building2 size={16} color="var(--emerald)" />
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>Target Companies</h3>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>+2 priority boost per match</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input className="input" placeholder="e.g. Google, TCS, Infosys"
              value={companyInput} onChange={e => setCompanyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCompany()} style={{ flex: 1 }} />
            <button className="btn btn-secondary" onClick={addCompany} style={{ padding: '0 12px', gap: 4 }}>
              <Plus size={14} />
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {targetCompanies.map(c => (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 20, fontSize: 12, color: 'var(--emerald)' }}>
                {c}
                <button onClick={() => setTargetCompanies(p => p.filter(x => x !== c))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--emerald)', display: 'flex', alignItems: 'center', padding: 0 }}>
                  <X size={11} />
                </button>
              </div>
            ))}
            {targetCompanies.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No companies added yet</p>}
          </div>
        </motion.div>

        {/* Skills */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
          className="card" style={{ padding: 24, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Star size={16} color="var(--amber)" />
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>Technical Skills</h3>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input className="input" placeholder="e.g. Python, React, SQL, DSA"
              value={skillInput} onChange={e => setSkillInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSkill()} style={{ flex: 1 }} />
            <button className="btn btn-secondary" onClick={addSkill} style={{ padding: '0 12px', gap: 4 }}>
              <Plus size={14} />
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {skills.map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 20, fontSize: 12, color: 'var(--amber)' }}>
                {s}
                <button onClick={() => setSkills(p => p.filter(x => x !== s))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)', display: 'flex', alignItems: 'center', padding: 0 }}>
                  <X size={11} />
                </button>
              </div>
            ))}
            {skills.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No skills added yet</p>}
          </div>
        </motion.div>

      </div>

      {/* Save button */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ gap: 8, minWidth: 140 }}>
          {saving
            ? <><div className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} />Saving…</>
            : saved
              ? <><CheckCircle size={15} />Saved to Firestore!</>
              : <><Save size={15} />Save Profile</>
          }
        </button>
        <button onClick={() => window.location.reload()} className="btn btn-ghost" style={{ gap: 6, fontSize: 13 }}>
          <RefreshCw size={13} />Reload
        </button>
        {saved && (
          <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} style={{ fontSize: 13, color: 'var(--emerald)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle size={13} />Profile updated!
          </motion.span>
        )}
      </motion.div>
    </div>
  );
}
