import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Mic,
  ArrowRight,
  ShieldCheck,
  Zap,
  Activity,
  Cpu,
  CheckCircle2,
  Radio,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Landing() {
  const navigate = useNavigate();
  const { user, signInWithGoogle } = useAuth();
  const [activeTab, setActiveTab] = useState<'architecture' | 'ledger' | 'personas'>('architecture');

  return (
    <div style={{ background: '#08090d', minHeight: '100vh', color: '#f8fafc', overflowX: 'hidden' }}>
      {/* Top Engineering Nav */}
      <header
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(8, 9, 13, 0.8)',
          backdropFilter: 'blur(16px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          className="studio-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 64,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 0 12px rgba(79, 70, 229, 0.4)',
              }}
            >
              <Mic size={18} />
            </div>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>
              DAAZLING
            </span>
            <span
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 99,
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: '#10b981',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600,
              }}
            >
              v2.2-PROD
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              LiveKit Cloud: 680ms RTT
            </span>

            {user ? (
              <button
                onClick={() => navigate('/interview')}
                className="btn-primary"
              >
                Launch Studio
                <ArrowRight size={15} />
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={signInWithGoogle}
                  className="btn-secondary"
                  style={{ fontSize: 12 }}
                >
                  Sign in
                </button>
                <button
                  onClick={() => navigate('/interview')}
                  className="btn-primary"
                >
                  Enter Studio (Guest)
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{ position: 'relative', padding: '100px 0 80px', textAlign: 'center', overflow: 'hidden' }}>
        {/* Subtle background ambient mesh */}
        <div
          style={{
            position: 'absolute',
            top: '-20%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 700,
            height: 450,
            background: 'radial-gradient(circle, rgba(79, 70, 229, 0.15) 0%, rgba(56, 189, 248, 0.05) 50%, transparent 70%)',
            filter: 'blur(80px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        <div className="studio-container" style={{ position: 'relative', zIndex: 1 }}>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 99, background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', marginBottom: 24 }}
          >
            <Zap size={14} color="#38bdf8" />
            <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: '#cbd5e1' }}>
              Sub-800ms Full-Duplex WebRTC · LangGraph State Machine
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            style={{
              fontSize: 'clamp(38px, 5.5vw, 68px)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              maxWidth: 960,
              margin: '0 auto 24px',
            }}
          >
            The Full-Duplex AI Technical Interviewer{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #a5b4fc 0%, #38bdf8 50%, #34d399 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              That Cannot Hallucinate.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            style={{
              fontSize: 18,
              color: '#94a3b8',
              maxWidth: 720,
              margin: '0 auto 40px',
              lineHeight: 1.65,
            }}
          >
            Real engineering interviews aren't simple text prompts. DAAZLING pairs candidates with
            calibrated interviewer personas over live WebRTC voice audio, backed by an append-only Turn Ledger
            guaranteeing zero phantom questions.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}
          >
            <button
              onClick={() => navigate('/interview')}
              className="btn-primary"
              style={{ fontSize: 15, padding: '14px 32px' }}
            >
              Launch Interview Studio
              <ArrowRight size={18} />
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn-secondary"
              style={{ fontSize: 15, padding: '14px 26px' }}
            >
              View System Telemetry
            </button>
          </motion.div>

          {/* Quick SLA Specs Pill Row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
              marginTop: 56,
              flexWrap: 'wrap',
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              color: '#64748b',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={14} color="#38bdf8" /> p50 TTFT: &lt;520ms
            </span>
            <span style={{ color: 'rgba(255, 255, 255, 0.1)' }}>|</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Cpu size={14} color="#a78bfa" /> Silero VAD: 200ms
            </span>
            <span style={{ color: 'rgba(255, 255, 255, 0.1)' }}>|</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={14} color="#10b981" /> Zero Phantom Questions
            </span>
          </motion.div>
        </div>
      </section>

      {/* Interactive Architecture & Systems Tabs */}
      <section style={{ padding: '60px 0 100px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <div className="studio-container">
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#818cf8', textTransform: 'uppercase' }}>
              System Architecture & Core Guarantees
            </span>
            <h2 style={{ fontSize: 32, fontWeight: 800, marginTop: 8 }}>
              Built Like Mission-Critical Infrastructure
            </h2>
          </div>

          {/* Tab Selector */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
            {[
              { id: 'architecture', label: 'Audio & Agent Pipeline' },
              { id: 'ledger', label: 'The Zero-Phantom Ledger' },
              { id: 'personas', label: 'Calibrated Psychometrics' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  background: activeTab === tab.id ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                  border: activeTab === tab.id ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                  color: activeTab === tab.id ? '#f8fafc' : '#94a3b8',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Architecture Pipeline */}
          {activeTab === 'architecture' && (
            <div
              className="studio-card"
              style={{
                padding: 36,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 24,
              }}
            >
              {[
                {
                  step: '01',
                  icon: <Radio size={18} color="#38bdf8" />,
                  title: 'WebRTC Full-Duplex Audio',
                  desc: 'Audio streams over LiveKit UDP Opus tracks with sub-40ms ingress latency. Real-time barge-in cuts off agent speech whenever candidate begins speaking.',
                },
                {
                  step: '02',
                  icon: <Cpu size={18} color="#a78bfa" />,
                  title: 'Server-Side Silero VAD',
                  desc: 'Voice Activity Detection triggers on a tuned 200ms trailing silence threshold, preventing awkward unnatural delays between conversation turns.',
                },
                {
                  step: '03',
                  icon: <Activity size={18} color="#34d399" />,
                  title: 'LangGraph State Graph',
                  desc: 'A cyclical state machine analyzes turns to deploy gentle Nudges on hesitations, Skeptical Doubt on absolute claims, or Escalation Probes on technical buzzwords.',
                },
                {
                  step: '04',
                  icon: <ShieldCheck size={18} color="#f59e0b" />,
                  title: 'Grounded Dossier Evaluator',
                  desc: 'Two-pass deterministic extraction pulling verbatim candidate quotes for every rubric criterion. Python calculates scores (0-100) with zero LLM-invented numbers.',
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 20,
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {item.icon}
                      </div>
                      <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: '#475569', fontWeight: 700 }}>
                        {item.step}
                      </span>
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#f1f5f9' }}>
                      {item.title}
                    </h3>
                    <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab 2: Zero Phantom Ledger */}
          {activeTab === 'ledger' && (
            <div
              className="studio-card"
              style={{
                padding: 36,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: 32,
                alignItems: 'center',
              }}
            >
              <div>
                <span className="status-pill status-pill-emerald" style={{ marginBottom: 12 }}>
                  MATHEMATICAL GROUND TRUTH
                </span>
                <h3 style={{ fontSize: 24, fontWeight: 800, marginBottom: 14 }}>
                  Why Conventional AI Interviewers Fail
                </h3>
                <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.7, marginBottom: 20 }}>
                  Standard LLM evaluators are passed full transcripts and asked to score each question.
                  If the candidate ran out of time on Question 3, the LLM hallucinates what it thinks the candidate
                  "probably" meant or grades unasked questions as failures.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 13, color: '#cbd5e1' }}>
                      <strong>Append-Only Event Store:</strong> Every audible utterance is stamped with a UUID and question ID.
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 13, color: '#cbd5e1' }}>
                      <strong>Zero Phantom Questions:</strong> Unasked questions are mathematically excluded from score averages.
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 13, color: '#cbd5e1' }}>
                      <strong>Verbatim Citations:</strong> Scores require exact string quote evidence from the candidate transcript.
                    </span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: '#0a0d14',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 14,
                  padding: 20,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: 10, marginBottom: 12 }}>
                  <span style={{ color: '#818cf8', fontWeight: 600 }}>turn_ledger.audit</span>
                  <span style={{ color: '#10b981', fontSize: 11 }}>● VERIFIED</span>
                </div>
                <pre style={{ margin: 0, color: '#94a3b8', lineHeight: 1.6, overflowX: 'auto' }}>
{`{
  "session_id": "sess_stripe_staff_01",
  "questions_planned": 4,
  "questions_completed": 2,
  "turn_events": [
    {"turn_id": "t_01", "q_id": "q_1", "speaker": "candidate", "words": 42},
    {"turn_id": "t_02", "q_id": "q_2", "speaker": "candidate", "words": 38}
  ],
  "unreached_questions": [
    {"q_id": "q_3", "status": "NOT_ATTEMPTED", "evaluated": false},
    {"q_id": "q_4", "status": "NOT_ATTEMPTED", "evaluated": false}
  ],
  "phantom_question_protection": true
}`}
                </pre>
              </div>
            </div>
          )}

          {/* Tab 3: Calibrated Personas */}
          {activeTab === 'personas' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
              {[
                {
                  name: 'Alex Rivera',
                  title: 'Engineering Lead',
                  archetype: 'The Empathetic Lead',
                  color: '#10b981',
                  pause: '4.5s',
                  difficulty: 'Moderate Rigor',
                  tagline: 'Patient and encouraging. Gives gentle nudges when you pause and helps you structure your thoughts.',
                },
                {
                  name: 'Marcus Vance',
                  title: 'Principal Staff Architect',
                  archetype: 'The Skeptical Staff Engineer',
                  color: '#f59e0b',
                  pause: '2.5s (2.0s note pause)',
                  difficulty: 'High Rigor',
                  tagline: 'Deliberate and unhurried. Questions buzzwords, tests edge cases, and demands trade-off proofs.',
                },
                {
                  name: 'Priya Sharma',
                  title: 'VP of Platform Engineering',
                  archetype: 'The High-Velocity Bar Raiser',
                  color: '#8b5cf6',
                  pause: '2.0s',
                  difficulty: 'Elite Rigor',
                  tagline: 'Fast-paced and exacting. Tests distributed scale (500k QPS) with zero hints for hand-waving.',
                },
              ].map((p, idx) => (
                <div
                  key={idx}
                  className="studio-card"
                  style={{
                    padding: 24,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 10, background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>
                        {p.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div>
                        <h4 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', margin: 0 }}>{p.name}</h4>
                        <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>{p.title}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.05)', color: '#cbd5e1' }}>
                        {p.archetype}
                      </span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.05)', color: p.color, fontFamily: "'JetBrains Mono', monospace" }}>
                        {p.difficulty}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{p.tagline}</p>
                  </div>
                  <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#64748b' }}>
                    Pause Tolerance: {p.pause}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Direct CTA Section */}
      <section style={{ padding: '80px 0', borderTop: '1px solid rgba(255, 255, 255, 0.06)', background: 'linear-gradient(180deg, transparent 0%, rgba(79, 70, 229, 0.04) 100%)' }}>
        <div className="studio-container" style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>
            Experience the Real Voice Studio
          </h2>
          <p style={{ fontSize: 16, color: '#94a3b8', maxWidth: 560, margin: '0 auto 32px' }}>
            Choose a target company preset or upload your resume to experience an evidence-grounded
            technical interview in under 60 seconds.
          </p>
          <button
            onClick={() => navigate('/interview')}
            className="btn-primary"
            style={{ fontSize: 16, padding: '16px 36px' }}
          >
            Launch Voice Studio (Zero Signup)
            <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Modern Engineering Footer */}
      <footer style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', padding: '32px 0', fontSize: 12, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
        <div className="studio-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span>DAAZLING · Flagship AI Technical Interviewer</span>
          <span>LiveKit WebRTC · Gemini Realtime · LangGraph</span>
        </div>
      </footer>
    </div>
  );
}
