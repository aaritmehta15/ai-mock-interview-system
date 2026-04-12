import { useState, useEffect } from 'react'; // RE-SCAN
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, Target, Award, ShieldAlert, 
  RefreshCcw, ChevronRight, TrendingUp, Calendar, 
  Briefcase, CheckCircle2, Clock, Inbox
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { getMissionControlStatus, syncMissionControl } from '../lib/api';

const STATUS_COLUMNS = [
  { id: 'applied', label: 'Applied', color: '#94a3b8', icon: Inbox },
  { id: 'assessment', label: 'Assessment', color: '#f59e0b', icon: Clock },
  { id: 'interview', label: 'Interview', color: '#0ea5e9', icon: Activity },
  { id: 'offer', label: 'Offer', color: '#10b981', icon: Award },
];

export default function MissionControl() {
  const { user, accessToken } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = async () => {
    if (!user) return;
    try {
      const res = await getMissionControlStatus(user.uid);
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, [user]);

  const handleSync = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      await syncMissionControl(user.uid);
      await fetchStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
        <RefreshCcw className="animate-spin" size={24} color="var(--violet)" />
      </div>
    );
  }

  const appsByStatus = (status: string) => 
    data?.applications?.filter((a: any) => a.status === status) || [];

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(236,72,153,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Target size={18} color="#ec4899" />
            </div>
            <p className="label" style={{ marginBottom: 0 }}>Module 7 — Mission Control</p>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}>Autonomous Ops</h1>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <motion.button 
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={handleSync}
            disabled={syncing}
            className="btn btn-primary"
            style={{ padding: '12px 20px', gap: 10, background: 'var(--violet)' }}
          >
            {syncing ? <RefreshCcw className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
            {syncing ? 'Scanning Gmail Agent...' : 'Sync Agentic Pipeline'}
          </motion.button>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>
              Authorized Account: <span style={{ color: 'var(--violet-light)', fontWeight: 600 }}>{user?.email}</span>
            </p>
            <p style={{ fontSize: 9, color: 'var(--text-3)', opacity: 0.7 }}>
              System will scan primary inbox for job status updates.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
        
        {/* Left Col: Kanban + Analytics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Kanban Board */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Briefcase size={18} color="var(--text-3)" />
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Ghost-Managed Pipeline</h3>
              </div>
              <span className="chip" style={{ fontSize: 10, background: 'rgba(14,165,233,0.1)', color: 'var(--violet)' }}>
                AUTO-SYNC ON
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {STATUS_COLUMNS.map(col => (
                <div key={col.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px' }}>
                    <col.icon size={14} color={col.color} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {col.label}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', opacity: 0.6 }}>({appsByStatus(col.id).length})</span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 100, padding: 8, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px dashed var(--border)' }}>
                    <AnimatePresence mode="popLayout">
                      {appsByStatus(col.id).map((app: any) => (
                        <motion.div 
                          key={app.id} 
                          layout 
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                          whileHover={{ y: -2, borderColor: 'var(--violet)' }}
                          className="card" 
                          style={{ padding: 12, fontSize: 13, fontWeight: 600, cursor: 'default', background: 'var(--surface-2)' }}
                        >
                          <div style={{ marginBottom: 4 }}>{app.company}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 400 }}>
                            Updated {new Date(app.last_updated).toLocaleDateString()}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Burn-up Chart */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={18} color="var(--text-3)" />
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Performance Burn-up Analytics</h3>
              </div>
            </div>

            <div style={{ height: 300, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.performance_history || []}>
                  <defs>
                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-3)" fontSize={11} tickFormatter={(v) => v.split('-').slice(2).join('/')} />
                  <YAxis stroke="var(--text-3)" fontSize={11} domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}
                    itemStyle={{ fontSize: 12, fontWeight: 600 }}
                  />
                  <Area type="monotone" dataKey="interview_score" name="Interview Score" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div style={{ marginTop: 20, display: 'flex', gap: 24 }}>
               <div className="card" style={{ flex: 1, padding: 16, background: 'rgba(14,165,233,0.05)', border: 'none' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>AVG INTERVIEW SCORE</p>
                  <p style={{ fontSize: 24, fontWeight: 800, color: '#0ea5e9' }}>
                    {data?.performance_history?.length > 0
                      ? Math.round(data.performance_history.reduce((a: any, b: any) => a + (b.interview_score || 0), 0) / data.performance_history.length)
                      : 0}%
                  </p>
               </div>
               <div className="card" style={{ flex: 1, padding: 16, background: 'rgba(6,182,212,0.05)', border: 'none' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>TOTAL STUDY HOURS</p>
                  <p style={{ fontSize: 24, fontWeight: 800, color: '#06b6d4' }}>
                    {data?.performance_history?.reduce((a: any, b: any) => a + (b.study_hours || 0), 0).toFixed(1)}h
                  </p>
               </div>
            </div>
          </div>
        </div>

        {/* Right Col: Action Center */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card" style={{ 
            padding: 24, 
            background: data?.urgency_level === 'high' ? 'rgba(239,68,68,0.05)' : 'var(--surface)',
            borderColor: data?.urgency_level === 'high' ? 'rgba(239,68,68,0.3)' : 'var(--border)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {data?.urgency_level === 'high' && (
              <motion.div 
                animate={{ opacity: [0.1, 0.2, 0.1] }} transition={{ repeat: Infinity, duration: 2 }}
                style={{ position: 'absolute', inset: 0, background: 'none' }}
              />
            )}
            
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                {data?.urgency_level === 'high' ? <ShieldAlert size={18} color="#ef4444" /> : <Award size={18} color="var(--violet)" />}
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Dynamic Action Center</h3>
              </div>

              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current Status</p>
                <div style={{ fontSize: 14, fontWeight: 600, color: data?.urgency_level === 'high' ? '#ef4444' : 'var(--text)', lineHeight: 1.5 }}>
                  {data?.urgency_level === 'high' 
                    ? "Critical Drive Detection: You have a verified interview session predicted within 48 hours."
                    : "Low Urgency Detected: Your next major drive is more than 3 days away."}
                </div>
              </div>

              <motion.button 
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className={`btn ${data?.urgency_level === 'high' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ 
                  width: '100%', padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                  background: data?.urgency_level === 'high' ? '#ef4444' : 'transparent',
                  border: data?.urgency_level === 'high' ? 'none' : '1px solid var(--border)',
                  color: data?.urgency_level === 'high' ? '#fff' : 'var(--violet)'
                }}
              >
                {data?.action_cta}
              </motion.button>
            </div>
          </div>

          <div style={{ padding: 12 }}>
            <p className="label" style={{ marginBottom: 12 }}>MISSION LOGS</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data?.applications?.slice(0, 3).map((app: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--violet)', marginTop: 6 }} />
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Pipeline: {app.company} status moved to {app.status}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{new Date(app.last_updated).toLocaleTimeString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
