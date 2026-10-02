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
  History as HistoryIcon,
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

  // Strict session check: ONLY use latestReport if it actually belongs to activeSessionId
  const hasMatchingCache = !!(latestReport && latestReport.session_id === activeSessionId);

  const [report, setReport] = useState<EvaluationReport | null>(hasMatchingCache ? latestReport : null);
  const [ledger, setLedger] = useState<LedgerAuditResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!hasMatchingCache);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [showLedgerDrawer, setShowLedgerDrawer] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (!activeSessionId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setErrorMsg(null);

      try {
        const isCacheValid = latestReport && latestReport.session_id === activeSessionId;

        // Fetch ledger first to verify turn count and avoid evaluating empty sessions
        const ledgerData = await getLedger(activeSessionId).catch(() => null);
        if (isMounted && ledgerData) {
          setLedger(ledgerData);
        }

        // If no matching cache and ledger has zero turns, don't trigger zero-turn evaluation
        if (!isCacheValid && (!ledgerData || ledgerData.turns_count === 0)) {
          if (isMounted) {
            setReport(null);
            setIsLoading(false);
          }
          return;
        }

        const evalReport = isCacheValid ? latestReport : await evaluateSession(activeSessionId);

        if (isMounted) {
          setReport(evalReport);
          setLatestReport(evalReport);

          // default first question expanded
          if (evalReport?.question_evaluations?.length) {
            setExpandedQuestions({ [evalReport.question_evaluations[0].question_id]: true });
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
    a.download = `ai_mock_interviewer_dossier_${activeSessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStartNewSession = () => {
    resetSession();
    navigate('/setup');
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
    const isNoSession = !errorMsg && !report;
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: 24 }}>
        <div
          className="studio-card"
          style={{
            padding: 40,
            border: isNoSession ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(244, 63, 94, 0.3)',
            background: isNoSession ? 'rgba(14, 18, 28, 0.85)' : 'rgba(244, 63, 94, 0.04)',
            textAlign: 'center',
          }}
        >
          {isNoSession ? (
            <>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#818cf8',
                  marginBottom: 18,
                }}
              >
                <ShieldCheck size={28} />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
                No Active Interview to Evaluate
              </h2>
              <p
                style={{
                  color: '#94a3b8',
                  fontSize: 13,
                  lineHeight: 1.6,
                  maxWidth: 460,
                  margin: '0 auto 24px',
                }}
              >
                You have not completed a voice interview session yet, or this session does not contain recorded turns.
                You can start a new interview or browse your past evaluation reports.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => navigate('/setup')}
                  className="btn-primary"
                  style={{ padding: '10px 20px', fontSize: 13 }}
                >
                  Start New Interview
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/history')}
                  style={{
                    padding: '10px 20px',
                    fontSize: 13,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 8,
                    color: '#f8fafc',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Past Sessions
                </button>
              </div>
            </>
          ) : (
            <>
              <AlertCircle size={40} color="#f43f5e" style={{ margin: '0 auto 16px' }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#f8fafc' }}>
                Evaluation Dossier Unavailable
              </h2>
              <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
                {errorMsg}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => navigate('/setup')}
                  className="btn-primary"
                  style={{ padding: '10px 20px', fontSize: 13 }}
                >
                  Start New Interview
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/history')}
                  style={{
                    padding: '10px 20px',
                    fontSize: 13,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 8,
                    color: '#f8fafc',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Past Sessions
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const recBadge = getRecommendationBadge(report.recommendation || 'HIRE');
  const questionsList = report.question_evaluations || report.questions_evaluated || [];
  const overallScore = report.overall_score ?? report.total_score ?? 0;
  const verifiedTurns = report.verified_turn_count ?? report.verified_turns_count ?? 0;
  const unreachedCount =
    report.unreached_question_count ??
    report.unreached_questions_count ??
    questionsList.filter((q) => q.status === 'UNREACHED' || q.reached === false).length;
  const dsaScore = report.competencies?.dsa_score ?? report.technical_dsa_score ?? 0;
  const sysScore = report.competencies?.system_design_score ?? report.system_design_score ?? 0;
  const commScore = report.competencies?.communication_score ?? report.communication_score ?? 0;
  const tradeoffScore = report.competencies?.tradeoff_intuition_score ?? report.tradeoff_score ?? 0;
  const summaryText =
    report.hiring_committee_summary ||
    'Evaluation compiled strictly against verified turns in the append-only SQLite Turn Ledger.';

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px' }}>
      {/* Top Banner: Stage & Ledger Verification */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
          <span className="status-pill status-pill-emerald">
            <ShieldCheck size={12} />
            EVALUATION REPORT · EVIDENCE GROUNDED
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#64748b',
                marginRight: 6,
              }}
            >
              SHA-256: {report.session_hash ? report.session_hash.slice(0, 16) + '...' : 'VERIFIED'}
            </span>

            <button
              type="button"
              onClick={handleDownloadJSON}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#cbd5e1',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <Download size={13} />
              <span>Export JSON</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/history')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#cbd5e1',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <HistoryIcon size={13} />
              <span>Past Sessions</span>
            </button>

            <button
              type="button"
              onClick={handleStartNewSession}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                background: 'rgba(99, 102, 241, 0.2)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                color: '#818cf8',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={13} />
              <span>New Interview</span>
            </button>
          </div>
        </div>

        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: '-0.025em',
            marginBottom: 6,
          }}
        >
          Candidate Assessment & Hiring Committee Dossier
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>
          Calibrated assessment for <strong>{report.company || targetCompany}</strong> · <strong>{report.role || targetRole}</strong>.
          Evaluated strictly against verified turns in the SQLite Turn Ledger.
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
                {verifiedTurns} VERIFIED SPOKEN TURNS
              </span>
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginBottom: 12 }}>
              Executive Recommendation Summary
            </h2>
            <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 20 }}>
              {summaryText}
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
                  {overallScore}
                </span>
                <span style={{ fontSize: 14, color: '#64748b' }}>/ 100</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Technical DSA', score: dsaScore, color: '#38bdf8' },
                { label: 'System Design', score: sysScore, color: '#818cf8' },
                { label: 'Communication', score: commScore, color: '#10b981' },
                { label: 'Trade-Off Intuition', score: tradeoffScore, color: '#f59e0b' },
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
            {questionsList.filter((q) => q.status !== 'UNREACHED' && q.reached !== false).length} Reached ·{' '}
            {unreachedCount} Unreached (Zero Weight)
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {questionsList.map((q, idx) => {
            const isExpanded = !!expandedQuestions[q.question_id];
            const isReached = q.status !== 'UNREACHED' && q.reached !== false;
            const assertions = q.assertion_results || q.assertions || [];
            const qCategory = q.category || 'TECHNICAL';
            const candidateSummary =
              q.candidate_summary ||
              (q.verbatim_citations && q.verbatim_citations.length > 0
                ? q.verbatim_citations.join(' ')
                : 'Responses verified from spoken audio.');

            if (!isReached) {
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
                      Q{idx + 1} · {qCategory.toUpperCase()}
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
                      <strong style={{ color: '#f8fafc' }}>Candidate Summary:</strong> {candidateSummary}
                    </p>

                    {/* Binary Assertion Audit List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                        Binary Assertion Evidence Gate:
                      </span>
                      {assertions.map((a, aIdx) => {
                        const aName = a.assertion_name || a.name || `Assertion ${aIdx + 1}`;
                        const aReason = a.critique || a.reason || '';
                        return (
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
                                  {aName}
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

                            {aReason && (
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                {aReason}
                              </div>
                            )}
                          </div>
                        );
                      })}
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
