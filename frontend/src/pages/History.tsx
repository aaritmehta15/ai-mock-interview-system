import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  History as HistoryIcon,
  Calendar,
  Building2,
  Briefcase,
  ArrowRight,
  Trash2,
  Clock,
  Sparkles,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { getHistory, deleteHistorySession, type SessionSummary } from '../lib/api';

export default function History() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchSessions = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await getHistory(100);
      setSessions(data.sessions || []);
    } catch (err: any) {
      console.error('[history] Failed to load sessions:', err);
      setErrorMsg('Failed to load past sessions. Please make sure the backend is connected.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to remove this session from your history?')) {
      return;
    }
    setDeletingId(sessionId);
    try {
      await deleteHistorySession(sessionId);
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
    } catch (err) {
      console.error('[history] Delete failed:', err);
      alert('Failed to delete session. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const getRecommendationBadge = (rec: string | null) => {
    if (!rec) return null;
    const upper = rec.toUpperCase();
    if (upper.includes('STRONG HIRE')) {
      return <span className="status-pill status-pill-emerald">STRONG HIRE</span>;
    }
    if (upper.includes('HIRE')) {
      return <span className="status-pill status-pill-cyan">HIRE</span>;
    }
    if (upper.includes('BORDERLINE')) {
      return <span className="status-pill status-pill-amber">BORDERLINE</span>;
    }
    return <span className="status-pill status-pill-red">NO HIRE</span>;
  };

  // Aggregated analytics metrics
  const totalInterviews = sessions.length;
  const evaluatedSessions = sessions.filter((s) => s.overall_score !== null && s.overall_score !== undefined);
  const averageScore = evaluatedSessions.length > 0
    ? Math.round(evaluatedSessions.reduce((acc, s) => acc + (s.overall_score || 0), 0) / evaluatedSessions.length)
    : null;

  return (
    <div style={{ padding: '36px 40px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#818cf8',
              }}
            >
              <HistoryIcon size={18} />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#f8fafc' }}>
              Past Sessions & History
            </h1>
          </div>
          <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>
            Every interview session, question blueprint, and verified evaluation dossier preserved for review.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={fetchSessions}
            disabled={isLoading}
            className="btn-secondary"
            style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/setup')}
            className="btn-primary"
            style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Sparkles size={15} />
            New Interview
          </button>
        </div>
      </div>

      {/* Aggregate Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="studio-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>
            Total Interviews Completed
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc' }}>
            {totalInterviews}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            Recorded in SQLite Turn Ledger
          </div>
        </div>

        <div className="studio-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>
            Average Performance Score
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: averageScore !== null ? '#10b981' : '#64748b' }}>
            {averageScore !== null ? `${averageScore}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            Deterministic Assertion Calibrated
          </div>
        </div>

        <div className="studio-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>
            Evaluated Dossiers
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#818cf8' }}>
            {evaluatedSessions.length}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            Verbatim quote evidence attached
          </div>
        </div>
      </div>

      {/* Sessions List */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
          <Loader2 size={32} className="spin" color="#818cf8" style={{ marginBottom: 16 }} />
          <p style={{ color: '#94a3b8', fontSize: 14 }}>Loading interview history...</p>
        </div>
      ) : errorMsg ? (
        <div className="studio-card" style={{ padding: 24, textAlign: 'center', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <p style={{ color: '#f87171', margin: '0 0 16px' }}>{errorMsg}</p>
          <button onClick={fetchSessions} className="btn-secondary">
            Retry
          </button>
        </div>
      ) : sessions.length === 0 ? (
        <div
          className="studio-card"
          style={{
            padding: 48,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8',
              marginBottom: 16,
            }}
          >
            <HistoryIcon size={28} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#f8fafc' }}>
            No Interview Sessions Yet
          </h3>
          <p style={{ color: '#94a3b8', maxWidth: 440, fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
            Practice your first real-time technical interview to receive instant rubric evaluation, verbatim evidence quotes, and competency tracking.
          </p>
          <button onClick={() => navigate('/setup')} className="btn-primary" style={{ padding: '12px 28px' }}>
            Start Your First Interview
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sessions.map((session, idx) => {
            const formattedDate = new Date(session.created_at).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <motion.div
                key={session.session_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.03 }}
                onClick={() => navigate(`/evaluation/${session.session_id}`)}
                className="studio-card"
                style={{
                  padding: 20,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  transition: 'all 0.15s ease',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)';
                  e.currentTarget.style.background = 'var(--bg-surface, rgba(17, 24, 39, 0.4))';
                }}
              >
                {/* Left: Role, Company & Metadata */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: 'rgba(99, 102, 241, 0.1)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#818cf8',
                      flexShrink: 0,
                    }}
                  >
                    <Briefcase size={20} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                        {session.role || 'Software Engineer'}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'rgba(56, 189, 248, 0.1)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          color: '#38bdf8',
                          fontWeight: 600,
                        }}
                      >
                        {session.seniority || 'Staff'}
                      </span>
                      {getRecommendationBadge(session.recommendation)}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#94a3b8', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Building2 size={13} color="#64748b" />
                        {session.company || 'Technology Firm'}
                      </span>
                      <span style={{ color: 'rgba(255, 255, 255, 0.1)' }}>•</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={13} color="#64748b" />
                        {formattedDate}
                      </span>
                      <span style={{ color: 'rgba(255, 255, 255, 0.1)' }}>•</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                        <Clock size={13} color="#64748b" />
                        {session.turn_count || 0} spoken turns
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Score & Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <div style={{ textAlign: 'right' }}>
                    {session.overall_score !== null && session.overall_score !== undefined ? (
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', fontFamily: "'JetBrains Mono', monospace" }}>
                          {session.overall_score}%
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Score
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
                          Ready to Score
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>
                          {session.turn_count > 0 ? 'Recorded' : 'Empty'}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={(e) => handleDelete(session.session_id, e)}
                      disabled={deletingId === session.session_id}
                      title="Delete session"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: 8,
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                    >
                      <Trash2 size={16} />
                    </button>

                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: 'rgba(255, 255, 255, 0.04)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#cbd5e1',
                      }}
                    >
                      <ArrowRight size={16} />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
