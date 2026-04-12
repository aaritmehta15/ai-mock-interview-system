import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, BookOpen, Clock, AlertTriangle, CheckCircle, Mail,
  CalendarDays, Calendar as CalendarIcon, History, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  generatePlan, logStudy, getCachedPlan,
  fetchGoogleCalendarEvents, fetchIndianHolidays, fetchClassroomDeadlines,
  type GCalEvent
} from '../lib/api';

type Tab = 'generate' | 'calendar' | 'past';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PriorityEngine() {
  const { accessToken, user } = useAuth();
  
  const [activeTab, setActiveTab] = useState<Tab>('generate');

  // Generate Plan state
  const [plan,    setPlan]    = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [hours,   setHours]   = useState('');
  const [subject, setSubject] = useState('');
  const [logDone, setLogDone] = useState(false);

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calEvents, setCalEvents] = useState<GCalEvent[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

  // Load calendar events
  useEffect(() => {
    if (activeTab === 'calendar' && accessToken) {
      setCalLoading(true);
      Promise.all([
        fetchGoogleCalendarEvents(accessToken),
        fetchIndianHolidays(accessToken),
        fetchClassroomDeadlines(accessToken)
      ]).then(([userEvents, holidays, classroom]) => {
        setCalEvents([...userEvents, ...holidays, ...classroom]);
      }).catch(e => {
        console.error("Calendar fetch error:", e);
      }).finally(() => {
        setCalLoading(false);
      });
    }
  }, [activeTab, accessToken]);

  const handleGenerate = async () => {
    if (!accessToken) { setError('No Gmail access token. Sign out and sign in again, granting Google Calendar & Gmail permissions.'); return; }
    setLoading(true); setError(''); setPlan(null);
    try { const data = await generatePlan(accessToken); setPlan(data); }
    catch (e: any) { setError(e.response?.data?.detail || e.message); }
    finally { setLoading(false); }
  };

  const handleLogStudy = async () => {
    if (!user || !hours) return;
    try {
      await logStudy({ userId: user.uid, date: new Date().toISOString().slice(0,10), hours: Number(hours), subject });
      setLogDone(true); setHours(''); setSubject('');
      setTimeout(() => setLogDone(false), 3000);
    } catch (e: any) { setError(e.response?.data?.detail || e.message); }
  };

  // Calendar render helpers
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const getDateStr = (day: number) => {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getEventsForDate = (dateStr: string) => {
    return calEvents.filter(e => {
      if (e.start.date) return e.start.date === dateStr;
      if (e.start.dateTime) return e.start.dateTime.startsWith(dateStr);
      return false;
    });
  };

  const getEventColor = (source: string) => {
    switch (source) {
      case 'holiday': return 'var(--text-3)'; // Gray
      case 'classroom': return 'var(--emerald)'; // Green
      case 'gcal': default: return 'var(--cyan)'; // Blue
    }
  };

  return (
    <div style={{ padding:32, maxWidth:1000, margin:'0 auto' }}>
      {/* Header */}
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} style={{ marginBottom:32 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
          <div style={{ width:40, height:40, borderRadius:12, background:'rgba(6,182,212,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Zap size={20} color="var(--cyan)" />
          </div>
          <div>
            <p className="label">MODULE 1</p>
            <h2 style={{ fontSize:22 }}>Smart Priority Engine</h2>
          </div>
        </div>
        <p style={{ fontSize:14, color:'var(--text-2)', maxWidth:560 }}>
          Connects to Gmail and Calendar. Extractions are AI priority-scored. 
        </p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 12, marginTop: 24, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
          {[
            { id: 'generate', icon: Zap, label: 'Generate Today' },
            { id: 'calendar', icon: CalendarDays, label: 'Priority Calendar' },
            { id: 'past', icon: History, label: 'Past Plans' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as Tab)}
              className={`btn ${activeTab === t.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{ gap: 8, padding: '8px 16px', fontSize: 13 }}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Tab: Generate Plan */}
      <AnimatePresence mode="wait">
        {activeTab === 'generate' && (
          <motion.div key="generate" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="card" style={{ padding:24, marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <Mail size={16} color="var(--cyan)" />
                <h3 style={{ fontSize:15, fontWeight:600 }}>Generate Today's Plan</h3>
              </div>
              <p style={{ fontSize:13, color:'var(--text-2)', marginBottom:20 }}>
                Scans recent emails · Priority-scored · Firestore cached
              </p>
              {!accessToken && (
                <div style={{ padding:'10px 14px', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:8, marginBottom:16, fontSize:13, color:'var(--amber)', display:'flex', gap:8, alignItems:'center' }}>
                  <AlertTriangle size={14} /> Sign in with Google with Gmail permissions to use this feature.
                </div>
              )}
              <button onClick={handleGenerate} disabled={loading || !accessToken} className="btn btn-primary" style={{ gap:8 }}>
                {loading ? <><div className="spinner" style={{ width:16, height:16, borderWidth:2 }} />Generating…</> : <><Zap size={15} />Generate Plan</>}
              </button>
            </div>

            {error && (
              <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ padding:'12px 16px', background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.25)', borderRadius:10, marginBottom:20, fontSize:13, color:'var(--rose)' }}>
                {error}
              </motion.div>
            )}

            {plan && (
              <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} style={{ marginBottom:24 }}>
                <div className="card" style={{ padding:24, marginBottom:16 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <CheckCircle size={16} color="var(--emerald)" />
                    <h3 style={{ fontSize:15, fontWeight:700 }}>Today's Focus</h3>
                  </div>
                  <p style={{ fontSize:18, fontWeight:700, color:'var(--cyan)', marginBottom:8 }}>{plan.focus_verdict || plan.plan?.focus_verdict || 'Plan generated!'}</p>
                  {(plan.reason || plan.plan?.reason) && <p style={{ fontSize:13, color:'var(--text-2)' }}>{plan.reason || plan.plan?.reason}</p>}
                  {(plan.warning || plan.plan?.warning) && (
                    <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.2)', borderRadius:8, fontSize:13, color:'var(--rose)' }}>
                      ⚠ {plan.warning || plan.plan?.warning}
                    </div>
                  )}
                </div>

                {((plan.hourly_breakdown || plan.plan?.hourly_breakdown) || []).length > 0 && (
                  <div className="card" style={{ padding:24 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                      <Clock size={15} color="var(--violet-light)" />
                      <h3 style={{ fontSize:14, fontWeight:700 }}>Hourly Breakdown</h3>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {(plan.hourly_breakdown || plan.plan?.hourly_breakdown || []).map((item: any, i: number) => (
                        <div key={i} style={{ display:'flex', gap:14, padding:'12px 16px', background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)' }}>
                          <div style={{ width:52, height:52, borderRadius:10, background:'rgba(124,58,237,0.15)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <span style={{ fontSize:16, fontWeight:800, color:'var(--violet-light)' }}>{item.hours}</span>
                            <span style={{ fontSize:9, color:'var(--text-3)' }}>hrs</span>
                          </div>
                          <div>
                            <p style={{ fontSize:13, fontWeight:600, marginBottom:3 }}>{item.task}</p>
                            <p style={{ fontSize:12, color:'var(--text-3)' }}>{item.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            <div className="card" style={{ padding:24 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                <BookOpen size={16} color="var(--violet-light)" />
                <h3 style={{ fontSize:15, fontWeight:600 }}>Log Study Hours</h3>
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
                <input className="input" type="number" min={0} max={24} step={0.5} placeholder="Hours (e.g. 2.5)" value={hours} onChange={e => setHours(e.target.value)} style={{ width:160 }} />
                <input className="input" type="text" placeholder="Subject (optional)" value={subject} onChange={e => setSubject(e.target.value)} style={{ flex:1, minWidth:180 }} />
              </div>
              <button onClick={handleLogStudy} disabled={!hours || !user} className="btn btn-secondary" style={{ gap:8 }}>
                {logDone ? <><CheckCircle size={14} color="var(--emerald)" /> Logged!</> : 'Log Hours'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Tab: Calendar */}
        {activeTab === 'calendar' && (
          <motion.div key="calendar" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <CalendarIcon size={20} color="var(--cyan)" />
                  <h3 style={{ fontSize: 18, fontWeight: 700 }}>{MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}</h3>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={prevMonth} className="btn btn-secondary" style={{ padding: '6px 10px' }}><ChevronLeft size={16}/></button>
                  <button onClick={() => setCurrentDate(new Date())} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>Today</button>
                  <button onClick={nextMonth} className="btn btn-secondary" style={{ padding: '6px 10px' }}><ChevronRight size={16}/></button>
                </div>
              </div>

              {calLoading ? (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner" style={{ width: 24, height: 24 }} />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                  {WEEKDAYS.map(day => (
                    <div key={day} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', paddingBottom: 8 }}>{day}</div>
                  ))}
                  
                  {/* Empty slots */}
                  {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                    <div key={`empty-${i}`} style={{ minHeight: 80, borderRadius: 8, background: 'var(--surface-2)', opacity: 0.3 }} />
                  ))}

                  {/* Days */}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = getDateStr(day);
                    const eventsForDay = getEventsForDate(dateStr);
                    const isToday = new Date().toISOString().slice(0, 10) === dateStr;
                    const isSelected = selectedDateStr === dateStr;

                    return (
                      <div
                        key={day}
                        onClick={() => setSelectedDateStr(dateStr)}
                        style={{
                          minHeight: 80, borderRadius: 8, padding: 8,
                          background: isSelected ? 'rgba(6,182,212,0.1)' : 'var(--surface-2)',
                          border: `1px solid ${isSelected ? 'var(--cyan)' : isToday ? 'var(--text-3)' : 'var(--border)'}`,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex', flexDirection: 'column', gap: 4
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--cyan)' : 'var(--text)' }}>
                          {day}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {eventsForDay.slice(0, 3).map((e, idx) => (
                            <div key={idx} style={{
                              fontSize: 9, padding: '2px 4px', borderRadius: 4,
                              background: getEventColor(e.source), color: '#000',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                            }}>
                              {e.summary}
                            </div>
                          ))}
                          {eventsForDay.length > 3 && (
                            <div style={{ fontSize: 9, color: 'var(--text-3)' }}>+{eventsForDay.length - 3} more</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected Date Details */}
            {selectedDateStr && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ marginTop: 20, padding: 24 }}>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Events for {selectedDateStr}</h4>
                {getEventsForDate(selectedDateStr).length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-3)' }}>No events on this date.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {getEventsForDate(selectedDateStr).map((e, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--surface-2)', borderRadius: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: getEventColor(e.source) }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{e.summary}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase' }}>{e.source}</div>
                        </div>
                        {e.htmlLink && (
                          <a href={e.htmlLink} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }}>View</a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Tab: Past Plans */}
        {activeTab === 'past' && (
          <motion.div key="past" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <History size={16} color="var(--violet-light)" />
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>Past Priorities</h3>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-3)' }}>This feature requires Firestore to fetch previously generated plans.</p>
              {/* Could add a fetch past plans call here in the future using getCachedPlan */}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
