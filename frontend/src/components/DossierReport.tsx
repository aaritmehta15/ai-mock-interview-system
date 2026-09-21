import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, AlertCircle, Award, Download, RotateCcw, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';

interface AssertionResult {
  name: string;
  weight: number;
  passed: boolean;
  evidence_quote: string;
  reasoning: string;
}

interface QuestionEvaluation {
  question_id: string;
  question_text: string;
  competency: string;
  category: string;
  score: number;
  assertion_results: AssertionResult[];
  candidate_transcript: string;
  interviewer_reply: string;
}

interface UnreachedQuestion {
  question_id: string;
  question_text: string;
  competency: string;
  reason: string;
}

export interface InterviewDossier {
  session_id: string;
  company: string;
  role: string;
  seniority: string;
  overall_score: number;
  recommendation: 'Strong Hire' | 'Hire' | 'Borderline' | 'No Hire' | string;
  executive_summary: string;
  evaluated_questions: QuestionEvaluation[];
  unreached_questions: UnreachedQuestion[];
  total_turns_analyzed: number;
  strengths: string[];
  growth_areas: string[];
}

interface DossierReportProps {
  dossier: InterviewDossier;
  onRestart: () => void;
}

export default function DossierReport({ dossier, onRestart }: DossierReportProps) {
  const [expandedQ, setExpandedQ] = useState<Record<string, boolean>>({
    [dossier.evaluated_questions[0]?.question_id]: true,
  });

  const toggleExpand = (qid: string) => {
    setExpandedQ(prev => ({ ...prev, [qid]: !prev[qid] }));
  };

  const getRecBadgeStyle = (rec: string) => {
    switch (rec) {
      case 'Strong Hire':
        return { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', color: '#10b981' };
      case 'Hire':
        return { bg: 'rgba(6, 182, 212, 0.15)', border: '#06b6d4', color: '#06b6d4' };
      case 'Borderline':
        return { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', color: '#f59e0b' };
      default:
        return { bg: 'rgba(244, 63, 94, 0.15)', border: '#f43f5e', color: '#f43f5e' };
    }
  };

  const recStyle = getRecBadgeStyle(dossier.recommendation);

  const downloadJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(dossier, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `interview_dossier_${dossier.session_id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Top Banner Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: 'var(--surface-1, #12141a)',
          border: '1px solid var(--border, #2a2e39)',
          borderRadius: 20,
          padding: 32,
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <ShieldCheck size={16} color="#10b981" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Grounded Evaluation Dossier
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-3, #7a8290)' }}>· {dossier.session_id}</span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-1, #f0f2f5)', margin: 0 }}>
              {dossier.seniority} {dossier.role}
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-2, #a0aec0)', margin: '4px 0 0' }}>
              Target Company: <strong style={{ color: 'var(--text-1, #f0f2f5)' }}>{dossier.company}</strong>
            </p>
          </div>

          {/* Overall Score & Recommendation Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            background: 'var(--surface-2, #181c24)',
            border: '1px solid var(--border, #2a2e39)',
            borderRadius: 16,
            padding: '16px 24px',
          }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3, #7a8290)', textTransform: 'uppercase' }}>
                Mathematical Score
              </span>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-1, #f0f2f5)', lineHeight: 1.1 }}>
                {dossier.overall_score}<span style={{ fontSize: 16, color: 'var(--text-3, #7a8290)', fontWeight: 500 }}>/100</span>
              </div>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 16px',
              borderRadius: 12,
              background: recStyle.bg,
              border: `1px solid ${recStyle.border}`,
              color: recStyle.color,
            }}>
              <Award size={20} />
              <span style={{ fontSize: 13, fontWeight: 800, marginTop: 4, letterSpacing: '0.02em' }}>
                {dossier.recommendation}
              </span>
            </div>
          </div>
        </div>

        {/* Executive Summary */}
        <div style={{
          marginTop: 24,
          padding: 18,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.02)',
          borderLeft: '4px solid #6366f1',
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--text-2, #d1d5db)',
        }}>
          {dossier.executive_summary}
        </div>

        {/* Strengths & Growth Areas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 20 }}>
          <div style={{
            padding: 16,
            borderRadius: 12,
            background: 'rgba(16, 185, 129, 0.05)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
          }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#10b981', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={16} /> Key Technical Strengths
            </h4>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2, #cbd5e1)', lineHeight: 1.5 }}>
              {dossier.strengths.map((str, idx) => (
                <li key={idx} style={{ marginBottom: 6 }}>{str}</li>
              ))}
            </ul>
          </div>

          <div style={{
            padding: 16,
            borderRadius: 12,
            background: 'rgba(245, 158, 11, 0.05)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
          }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={16} /> Targeted Calibration Areas
            </h4>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2, #cbd5e1)', lineHeight: 1.5 }}>
              {dossier.growth_areas.map((ga, idx) => (
                <li key={idx} style={{ marginBottom: 6 }}>{ga}</li>
              ))}
            </ul>
          </div>
        </div>
      </motion.div>

      {/* Evaluated Questions Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1, #f0f2f5)', margin: 0 }}>
          Audited Questions & Binary Evidence ({dossier.evaluated_questions.length})
        </h3>

        {dossier.evaluated_questions.map((q, idx) => {
          const isExpanded = expandedQ[q.question_id] ?? false;
          return (
            <motion.div
              key={q.question_id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'var(--surface-1, #12141a)',
                border: '1px solid var(--border, #2a2e39)',
                borderRadius: 16,
                padding: 24,
              }}
            >
              <div
                onClick={() => toggleExpand(q.question_id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase' }}>
                      Question {idx + 1} · {q.competency}
                    </span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.06)', color: 'var(--text-3, #94a3b8)' }}>
                      {q.category}
                    </span>
                  </div>
                  <h4 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1, #f0f2f5)', margin: '6px 0 0' }}>
                    {q.question_text}
                  </h4>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      fontSize: 18,
                      fontWeight: 800,
                      color: q.score >= 75 ? '#10b981' : q.score >= 50 ? '#f59e0b' : '#f43f5e',
                    }}>
                      {q.score}%
                    </span>
                  </div>
                  {isExpanded ? <ChevronUp size={20} color="var(--text-3, #7a8290)" /> : <ChevronDown size={20} color="var(--text-3, #7a8290)" />}
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border, #2a2e39)', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Candidate Verbatim Transcript */}
                  <div style={{
                    padding: 14,
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border, #2a2e39)',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3, #7a8290)', textTransform: 'uppercase' }}>
                      Audited Candidate Utterance
                    </span>
                    <p style={{ fontSize: 13, color: 'var(--text-2, #e2e8f0)', margin: '6px 0 0', fontStyle: 'italic', lineHeight: 1.5 }}>
                      "{q.candidate_transcript}"
                    </p>
                  </div>

                  {/* Binary Assertions Breakdown */}
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3, #7a8290)', textTransform: 'uppercase' }}>
                      Binary Assertion Checks
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                      {q.assertion_results.map((a, aIdx) => (
                        <div
                          key={aIdx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            padding: 12,
                            borderRadius: 10,
                            background: a.passed ? 'rgba(16, 185, 129, 0.04)' : 'rgba(244, 63, 94, 0.04)',
                            border: a.passed ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(244, 63, 94, 0.2)',
                            gap: 12,
                          }}
                        >
                          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            {a.passed ? (
                              <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
                            ) : (
                              <XCircle size={18} color="#f43f5e" style={{ flexShrink: 0, marginTop: 2 }} />
                            )}
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1, #f0f2f5)' }}>
                                {a.name.replace(/_/g, ' ').toUpperCase()} (Weight: {a.weight})
                              </span>
                              <p style={{ fontSize: 12, color: 'var(--text-2, #cbd5e1)', margin: '4px 0 0' }}>
                                {a.reasoning}
                              </p>
                              {a.evidence_quote && a.evidence_quote !== 'Omitted from response' && (
                                <p style={{ fontSize: 11, color: '#818cf8', margin: '4px 0 0', fontStyle: 'italic' }}>
                                  Evidence: "{a.evidence_quote}"
                                </p>
                              )}
                            </div>
                          </div>

                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 99,
                            background: a.passed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                            color: a.passed ? '#10b981' : '#f43f5e',
                            flexShrink: 0,
                          }}>
                            {a.passed ? 'PASSED' : 'MISSED'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Unreached Questions (Zero Phantom Question Guarantee) */}
      {dossier.unreached_questions.length > 0 && (
        <div style={{
          background: 'var(--surface-1, #12141a)',
          border: '1px dashed var(--border, #2a2e39)',
          borderRadius: 16,
          padding: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <AlertCircle size={16} color="var(--text-3, #7a8290)" />
            <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2, #cbd5e1)', margin: 0 }}>
              Unreached Blueprint Questions ({dossier.unreached_questions.length})
            </h4>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-3, #7a8290)', margin: '0 0 16px' }}>
            These questions were planned in the blueprint but were not reached during the live dialogue. Under our zero phantom question policy, they carry <strong>no mathematical penalty</strong> and are excluded from the score.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dossier.unreached_questions.map((uq, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border, #2a2e39)',
                }}
              >
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3, #7a8290)' }}>
                    {uq.competency}
                  </span>
                  <p style={{ fontSize: 13, color: 'var(--text-2, #94a3b8)', margin: '2px 0 0' }}>
                    {uq.question_text}
                  </p>
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 10px',
                  borderRadius: 99,
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--text-3, #94a3b8)',
                }}>
                  NOT ATTEMPTED
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 12 }}>
        <button
          onClick={downloadJSON}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 20px',
            borderRadius: 12,
            border: '1px solid var(--border, #2a2e39)',
            background: 'var(--surface-2, #181c24)',
            color: 'var(--text-1, #f0f2f5)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Download size={16} />
          Export Dossier JSON
        </button>

        <button
          onClick={onRestart}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            borderRadius: 12,
            border: 'none',
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
          }}
        >
          <RotateCcw size={16} />
          Start New Interview
        </button>
      </div>
    </div>
  );
}
