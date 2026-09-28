import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Terminal,
  Loader2,
} from 'lucide-react';
import { useInterview } from '../context/InterviewContext';
import {
  evaluateSession,
  getLedger,
  type EvaluationReport,
  type LedgerAuditResponse,
} from '../lib/api';

export default function Evaluation() {
  const { sessionId: paramSessionId } = useParams<{ sessionId: string }>();
  const {
    sessionId: contextSessionId,
    latestReport,
    setLatestReport,
    resetSession,
    targetCompany,
    targetRole,
  } = useInterview();

  const navigate = useNavigate();
  const activeSessionId = paramSessionId || contextSessionId;

  const [report, setReport] = useState<EvaluationReport | null>(latestReport);
  const [ledger, setLedger] = useState<LedgerAuditResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!latestReport);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [showLedgerDrawer, setShowLedgerDrawer] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (!activeSessionId) return;
      setIsLoading(true);
      setErrorMsg(null);

      try {
        const [evalReport, ledgerData] = await Promise.all([
          latestReport ? Promise.resolve(latestReport) : evaluateSession(activeSessionId),
          getLedger(activeSessionId).catch(() => null),
        ]);

        if (isMounted) {
          setReport(evalReport);
          setLatestReport(evalReport);
          if (ledgerData) setLedger(ledgerData);

          // default first question expanded
          if (evalReport?.questions_evaluated?.length) {
            setExpandedQuestions({ [evalReport.questions_evaluated[0].question_id]: true });
          }
        }
      } catch (err: any) {
        console.error('[evaluation] Failed to load evaluation dossier:', err);
        if (isMounted) {
          setErrorMsg(
            err.response?.data?.detail ||
              'Evaluation dossier could not be compiled. Please ensure the voice session has completed and try again.'
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [activeSessionId, latestReport, setLatestReport]);

  const toggleQuestion = (id: string) => {
    setExpandedQuestions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDownloadJSON = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify({ report, ledger }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apex_dossier_${activeSessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStartNewSession = () => {
    resetSession();
    navigate('/dashboard');
  };

  const getRecommendationBadge = (rec: string) => {
    const norm = rec.toUpperCase();
    if (norm.includes('STRONG HIRE')) {
      return { label: 'STRONG HIRE', bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', color: '#10b981' };
    }
    if (norm.includes('HIRE') && !norm.includes('NO')) {
      return { label: 'HIRE', bg: 'rgba(56, 189, 248, 0.15)', border: '#38bdf8', color: '#38bdf8' };
    }
    if (norm.includes('LEAN') || norm.includes('BORDERLINE')) {
      return { label: 'LEAN HIRE', bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', color: '#f59e0b' };
    }
    return { label: 'NO HIRE', bg: 'rgba(244, 63, 94, 0.15)', border: '#f43f5e', color: '#f43f5e' };
  };

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <Loader2 size={36} className="animate-spin" color="#6366f1" />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>
          Compiling Staff Hiring Committee Dossier...
        </h2>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>
          Auditing verified turns in SQLite Turn Ledger & evaluating binary assertions.
        </p>
      </div>
    );
  }

  if (errorMsg || !report) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: 24 }}>
        <div
          className="studio-card"
          style={{
            padding: 32,
            border: '1px solid rgba(244, 63, 94, 0.3)',
            background: 'rgba(244, 63, 94, 0.04)',
            textAlign: 'center',
          }}
        >
          <AlertCircle size={40} color="#f43f5e" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Evaluation Dossier Unavailable
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
            {errorMsg || 'No completed interview session found for evaluation.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/interview')}
            className="btn-primary"
            style={{ padding: '10px 20px', fontSize: 13 }}
          >
            Return to Sound Studio
          </button>
        </div>
      </div>
    );
  }

  const recBadge = getRecommendationBadge(report.recommendation);

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px' }}>
      {/* Top Banner: Stage & Ledger Verification */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="status-pill status-pill-emerald">
            <ShieldCheck size={12} />
            STAGE 5 OF 5 · HIRING COMMITTEE DOSSIER
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#64748b',
              }}
            >
              SHA-256: {report.session_hash ? report.session_hash.slice(0, 16) + '...' : 'VERIFIED'}
            </span>
          </div>
        </div>

        <h1
          style={{
            fontSize: 30,
            fontWeight: 800,
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: '-0.025em',
            marginBottom: 6,
          }}
        >
          Staff Hiring Committee Executive Dossier
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>
          Calibrated assessment for {targetCompany} · {targetRole}. Verified mathematically against the SQLite Turn Ledger.
        </p>
      </motion.div>

      {/* Primary Score & Verdict Card */}
      <div
        className="studio-card"
        style={{
          padding: 32,
          background: 'rgba(14, 18, 28, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          marginBottom: 28,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 32, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span
                style={{
                  padding: '6px 16px',
                  borderRadius: 99,
                  fontSize: 13,
                  fontWeight: 800,
                  fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: '0.04em',
                  background: recBadge.bg,
                  border: `1px solid ${recBadge.border}`,
                  color: recBadge.color,
                }}
              >
                {recBadge.label}
              </span>
              <span style={{ fontSize: 12, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
                {report.verified_turns_count} VERIFIED SPOKEN TURNS
              </span>
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginBottom: 12 }}>
              Executive Recommendation Summary
            </h2>
            <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 20 }}>
              {report.hiring_committee_summary}
            </p>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={handleDownloadJSON}
                className="btn-secondary"
                style={{ fontSize: 12, padding: '8px 14px' }}
              >
                <Download size={14} />
                <span>Export Audit JSON</span>
              </button>
              <button
                type="button"
                onClick={() => setShowLedgerDrawer(!showLedgerDrawer)}
                className="btn-secondary"
                style={{ fontSize: 12, padding: '8px 14px' }}
              >
                <Terminal size={14} />
                <span>{showLedgerDrawer ? 'Hide Turn Ledger' : 'Audit Turn Ledger'}</span>
              </button>
              <button
                type="button"
                onClick={handleStartNewSession}
                className="btn-primary"
                style={{ fontSize: 12, padding: '8px 16px' }}
              >
                <RotateCcw size={14} />
                <span>Start New Session</span>
              </button>
            </div>
          </div>

          {/* Right: Score Gauge & 4 Dimensions */}
          <div
            style={{
              background: '#0a0d14',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>OVERALL SCORE</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span
                  style={{
                    fontSize: 42,
                    fontWeight: 800,
                    fontFamily: "'Space Grotesk', sans-serif",
                    color: recBadge.color,
                  }}
                >
                  {report.total_score}
                </span>
                <span style={{ fontSize: 14, color: '#64748b' }}>/ 100</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Technical DSA', score: report.technical_dsa_score, color: '#38bdf8' },
                { label: 'System Design', score: report.system_design_score, color: '#818cf8' },
                { label: 'Communication', score: report.communication_score, color: '#10b981' },
                { label: 'Trade-Off Intuition', score: report.tradeoff_score, color: '#f59e0b' },
              ].map((dim) => (
                <div key={dim.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: '#94a3b8' }}>{dim.label}</span>
                    <span style={{ fontWeight: 600, color: '#f8fafc', fontFamily: "'JetBrains Mono', monospace" }}>
                      {dim.score} / 100
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255, 255, 255, 0.06)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(0, dim.score))}%`,
                        background: dim.color,
                        borderRadius: 3,
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chronological Turn Ledger Drawer (Audit Inspector) */}
      {showLedgerDrawer && (
        <div
          className="studio-card"
          style={{
            padding: 24,
            background: '#07090e',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            marginBottom: 28,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Terminal size={16} color="#818cf8" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                Append-Only SQLite Turn Ledger (SHA-256 Digest: {report.session_hash})
              </h3>
            </div>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {ledger?.turns?.length || 0} turns recorded
            </span>
          </div>

          <div
            style={{
              maxHeight: 240,
              overflowY: 'auto',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              background: '#05070a',
              padding: 12,
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.04)',
            }}
          >
            {ledger?.turns && ledger.turns.length > 0 ? (
              ledger.turns.map((t, i) => (
                <div key={i} style={{ color: t.speaker === 'candidate' ? '#38bdf8' : '#cbd5e1' }}>
                  <span style={{ color: '#64748b' }}>[{new Date(t.timestamp).toLocaleTimeString()}]</span>{' '}
                  <span style={{ fontWeight: 700 }}>{t.speaker.toUpperCase()}:</span> {t.text}
                </div>
              ))
            ) : (
              <span style={{ color: '#64748b' }}>No raw turns retrieved from ledger.</span>
            )}
          </div>
        </div>
      )}

      {/* Per-Question Evidence Audit Breakdown */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>
            Question-by-Question Binary Assertion Audit
          </h2>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {report.questions_evaluated.filter((q) => q.reached).length} Reached ·{' '}
            {report.unreached_questions_count} Unreached (Zero Weight)
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {report.questions_evaluated.map((q, idx) => {
            const isExpanded = !!expandedQuestions[q.question_id];

            if (!q.reached) {
              return (
                <div
                  key={q.question_id}
                  className="studio-card"
                  style={{
                    padding: 20,
                    background: 'rgba(14, 17, 24, 0.5)',
                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                    opacity: 0.75,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: '#94a3b8',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        Q{idx + 1} · UNREACHED
                      </span>
                      <span style={{ fontSize: 13, color: '#94a3b8' }}>{q.question_text}</span>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '3px 8px',
                        borderRadius: 4,
                        background: 'rgba(244, 63, 94, 0.1)',
                        border: '1px solid rgba(244, 63, 94, 0.3)',
                        color: '#f43f5e',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      0.0 WEIGHT · ZERO HALLUCINATION
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={q.question_id}
                className="studio-card"
                style={{
                  padding: 24,
                  background: 'rgba(14, 18, 28, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div
                  onClick={() => toggleQuestion(q.question_id)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 4,
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: '#818cf8',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      Q{idx + 1} · {q.category.toUpperCase()}
                    </span>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                      {q.question_text}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        fontFamily: "'Space Grotesk', sans-serif",
                        color: q.score >= 70 ? '#10b981' : q.score >= 50 ? '#f59e0b' : '#f43f5e',
                      }}
                    >
                      {q.score} / 100
                    </span>
                    {isExpanded ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 16 }}>
                      <strong style={{ color: '#f8fafc' }}>Candidate Summary:</strong> {q.candidate_summary}
                    </p>

                    {/* Binary Assertion Audit List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                        Binary Assertion Evidence Gate:
                      </span>
                      {q.assertions.map((a, aIdx) => (
                        <div
                          key={aIdx}
                          style={{
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: `1px solid ${a.passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'}`,
                            borderRadius: 8,
                            padding: '10px 14px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {a.passed ? (
                                <CheckCircle2 size={16} color="#10b981" />
                              ) : (
                                <XCircle size={16} color="#f43f5e" />
                              )}
                              <span style={{ fontSize: 13, fontWeight: 600, color: a.passed ? '#f8fafc' : '#fda4af' }}>
                                {a.name}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                fontFamily: "'JetBrains Mono', monospace",
                                color: a.passed ? '#10b981' : '#f43f5e',
                              }}
                            >
                              {a.passed ? 'PASS' : 'FAIL'}
                            </span>
                          </div>

                          {a.evidence_quote && (
                            <div style={{ fontSize: 12, color: '#cbd5e1', fontStyle: 'italic', marginTop: 4 }}>
                              "{a.evidence_quote}"
                            </div>
                          )}

                          {a.reason && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                              {a.reason}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {q.actionable_coaching && (
                      <div
                        style={{
                          background: 'rgba(99, 102, 241, 0.06)',
                          border: '1px solid rgba(99, 102, 241, 0.2)',
                          borderRadius: 8,
                          padding: '10px 14px',
                          fontSize: 12,
                          color: '#c7d2fe',
                        }}
                      >
                        <strong style={{ color: '#818cf8' }}>Actionable Coaching Tip: </strong>
                        {q.actionable_coaching}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
