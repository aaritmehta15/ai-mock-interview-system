import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Sparkles,
  Building2,
  Award,
  Layers,
  Clock,
  History as HistoryIcon,
  ShieldCheck,
  GraduationCap,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useInterview } from '../context/InterviewContext';
import { getHistory, type SessionSummary } from '../lib/api';

interface PresetTemplate {
  id: string;
  badge: string;
  badgeColor: string;
  title: string;
  company: string;
  role: string;
  seniority: string;
  accent: string;
  description: string;
  icon: React.ElementType;
}

const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    id: 'campus',
    badge: 'STUDENT / FRESHER',
    badgeColor: '#10b981',
    title: 'Campus Placement & IT Services',
    company: 'TCS',
    role: 'System Engineer',
    seniority: 'Student / Intern',
    accent: '#10b981',
    description: 'Core OOPs principles, SQL queries, clean functions, and capstone project walkthrough.',
    icon: GraduationCap,
  },
  {
    id: 'backend',
    badge: 'CORE ENGINEERING',
    badgeColor: '#38bdf8',
    title: 'Backend Microservices & DSA',
    company: 'Amazon',
    role: 'Backend SDE II',
    seniority: 'Mid-Level',
    accent: '#38bdf8',
    description: 'Algorithmic efficiency, concurrency, database indexing, and defensive edge-case handling.',
    icon: Layers,
  },
  {
    id: 'fintech',
    badge: 'HIGH INTEGRITY',
    badgeColor: '#f59e0b',
    title: 'FinTech & Transaction Systems',
    company: 'Stripe',
    role: 'Financial Systems Engineer',
    seniority: 'Senior',
    accent: '#f59e0b',
    description: 'ACID semantics, idempotency, race condition prevention, and zero-data-loss pipelines.',
    icon: Zap,
  },
  {
    id: 'fullstack',
    badge: 'PRODUCT SCALE',
    badgeColor: '#a855f7',
    title: 'Full-Stack Product & Scaled UI',
    company: 'Databricks',
    role: 'Full-Stack Product Engineer',
    seniority: 'Mid-Level',
    accent: '#a855f7',
    description: 'End-to-end component contracts, REST/GraphQL APIs, real-time UI state, and project deep-dives.',
    icon: Sparkles,
  },
];

export default function Dashboard() {
  const { user } = useAuth();
  const {
    targetCompany,
    targetRole,
    seniority,
    setTargetCompany,
    setTargetRole,
    setSeniority,
  } = useInterview();

  const navigate = useNavigate();
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    getHistory(5, 0)
      .then((data) => {
        if (isMounted) {
          setRecentSessions(data.sessions || []);
        }
      })
      .catch((err) => {
        console.warn('[dashboard] Failed to load recent history:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingHistory(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleApplyPreset = (preset: PresetTemplate) => {
    setTargetCompany(preset.company);
    setTargetRole(preset.role);
    setSeniority(preset.seniority);
    navigate('/setup');
  };

  const candidateName = user?.displayName?.split(' ')[0] || 'Engineer';

  const getScoreBadge = (score: number | null) => {
    if (score === null || score === undefined) {
      return (
        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.05)', color: '#94a3b8' }}>
          Pending
        </span>
      );
    }
    const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
    return (
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          padding: '3px 8px',
          borderRadius: 6,
          background: `${color}18`,
          color,
          border: `1px solid ${color}40`,
        }}
      >
        {score} / 100
      </span>
    );
  };

  const getRecommendationPill = (rec: string | null) => {
    if (!rec) return null;
    const isHire = rec.toUpperCase().includes('HIRE') && !rec.toUpperCase().includes('NO');
    const color = isHire ? '#10b981' : '#ef4444';
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 4,
          background: `${color}15`,
          color,
          border: `1px solid ${color}35`,
          letterSpacing: '0.05em',
        }}
      >
        {rec.toUpperCase()}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '36px 24px' }}>
      {/* Hero Command Banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="studio-card"
        style={{
          padding: '32px',
          background: 'linear-gradient(135deg, rgba(14, 18, 28, 0.95) 0%, rgba(20, 26, 42, 0.95) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: 16,
          marginBottom: 32,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span className="status-pill status-pill-cyan">
              <Sparkles size={12} />
              AI MOCK INTERVIEWER · COMMAND CENTER
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
                ACTIVE PROFILE:
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', padding: '2px 8px', borderRadius: 4, background: 'rgba(56, 189, 248, 0.12)' }}>
                {targetCompany} · {targetRole} ({seniority})
              </span>
            </div>
          </div>

          <h1
            style={{
              fontSize: 32,
              fontWeight: 800,
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: '-0.025em',
              marginBottom: 10,
              color: '#f8fafc',
            }}
          >
            Welcome, {candidateName}!
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 15, maxWidth: 680, lineHeight: 1.6, marginBottom: 24 }}>
            Prepare for real-world technical interviews with live speech-to-speech AI evaluators. Calibrated against actual hiring standards—from IT services like <strong>TCS & Infosys</strong> to FinTech and Big Tech.
          </p>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => navigate('/setup')}
              className="btn-primary"
              style={{
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 0 20px rgba(99, 102, 241, 0.35)',
              }}
            >
              <Sparkles size={16} />
              <span>Start New Mock Interview</span>
              <ArrowRight size={16} />
            </button>

            <button
              type="button"
              onClick={() => navigate('/history')}
              className="btn-secondary"
              style={{ padding: '12px 20px', fontSize: 14 }}
            >
              <HistoryIcon size={16} />
              <span>View Past Dossiers</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* 1-Click Quick-Launch Presets */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              Quick-Launch Presets
            </h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 0' }}>
              1-click calibrated session setups tailored to specific company archetypes and seniority tiers
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {PRESET_TEMPLATES.map((preset) => {
            const Icon = preset.icon;
            return (
              <div
                key={preset.id}
                onClick={() => handleApplyPreset(preset)}
                className="studio-card"
                style={{
                  padding: 20,
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(14, 18, 28, 0.75)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: `${preset.badgeColor}15`,
                        color: preset.badgeColor,
                        fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: '0.04em',
                      }}
                    >
                      {preset.badge}
                    </span>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: `${preset.accent}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: preset.accent,
                      }}
                    >
                      <Icon size={16} />
                    </div>
                  </div>

                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>
                    {preset.title}
                  </h3>
                  <div style={{ fontSize: 12, color: '#a5b4fc', fontWeight: 600, marginBottom: 8 }}>
                    {preset.company} · {preset.role}
                  </div>
                  <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 16 }}>
                    {preset.description}
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 12,
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <span style={{ fontSize: 11, color: '#64748b' }}>1-Click Setup</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: preset.accent, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Launch</span>
                    <ArrowRight size={14} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Evaluations & Dossiers */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              Recent Mock Interview Dossiers
            </h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 0' }}>
              Review objective binary assertions, transcripts, and hire recommendations from past sessions
            </p>
          </div>
          {recentSessions.length > 0 && (
            <button
              type="button"
              onClick={() => navigate('/history')}
              className="btn-secondary"
              style={{ fontSize: 12, padding: '6px 14px' }}
            >
              View All ({recentSessions.length})
            </button>
          )}
        </div>

        {isLoadingHistory ? (
          <div className="studio-card" style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
            Loading past interview performance...
          </div>
        ) : recentSessions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recentSessions.map((session) => (
              <div
                key={session.session_id}
                onClick={() => navigate(`/evaluation/${session.session_id}`)}
                className="studio-card"
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(14, 18, 28, 0.75)',
                  transition: 'all 0.15s ease',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(99, 102, 241, 0.12)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#818cf8',
                    }}
                  >
                    <Building2 size={20} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                        {session.company}
                      </span>
                      <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
                      <span style={{ fontSize: 13, color: '#cbd5e1' }}>
                        {session.role}
                      </span>
                      {getRecommendationPill(session.recommendation)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#64748b', marginTop: 3 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Award size={12} />
                        {session.seniority}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} />
                        {session.turn_count} Spoken Turns
                      </span>
                      <span>
                        {new Date(session.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {getScoreBadge(session.overall_score)}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#818cf8',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>View Dossier</span>
                    <ArrowRight size={14} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="studio-card"
            style={{
              padding: '36px',
              textAlign: 'center',
              border: '1px dashed rgba(255, 255, 255, 0.12)',
              background: 'rgba(14, 18, 28, 0.4)',
              borderRadius: 14,
            }}
          >
            <ShieldCheck size={36} color="#818cf8" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>
              No Completed Interviews Yet
            </h3>
            <p style={{ fontSize: 13, color: '#94a3b8', maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.5 }}>
              Launch your first calibrated mock interview session above. Your spoken answers will be scored across 6 real-world dimensions with verbatim evidence citations.
            </p>
            <button
              type="button"
              onClick={() => navigate('/setup')}
              className="btn-primary"
              style={{ fontSize: 13, padding: '10px 20px' }}
            >
              <span>Setup Your First Session</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
