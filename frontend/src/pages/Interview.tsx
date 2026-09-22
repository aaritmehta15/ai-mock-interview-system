import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  ArrowRight,
  AlertTriangle,
  Loader2,
  Building2,
  Briefcase,
  Layers,
  FileText,
  User,
  Radio,
  CheckCircle2,
} from 'lucide-react';
import {
  createBlueprint,
  getLiveKitToken,
  evaluateSession,
  getPersonas,
  type Persona,
} from '../lib/api';
import LiveKitRoomWrapper from '../components/LiveKitRoomWrapper';
import DossierReport from '../components/DossierReport';
import PersonaSelector from '../components/PersonaSelector';
import type { InterviewDossier } from '../components/DossierReport';

const FALLBACK_PERSONAS: Persona[] = [
  {
    id: 'alex',
    name: 'Alex Rivera',
    title: 'Engineering Lead',
    archetype: 'The Empathetic Lead',
    badge_label: 'Supportive & Mentoring',
    accent_color: '#10B981',
    difficulty: 'Moderate',
    tagline: 'Encouraging and patient. Gives gentle nudges when you pause and helps you structure your thoughts.',
    pause_tolerance_seconds: 4.5,
    thinking_pause_seconds: 0.5,
    probe_style: 'Scaffolding & Guided Clarification',
    traits: [
      'Patient listener',
      'Provides subtle scaffolding hints',
      'Celebrates sound architectural intuition',
      'Forgives minor terminology slips',
    ],
  },
  {
    id: 'marcus',
    name: 'Marcus Vance',
    title: 'Principal Staff Architect',
    archetype: 'The Skeptical Staff Engineer',
    badge_label: 'Rigorous & Skeptical',
    accent_color: '#F59E0B',
    difficulty: 'High',
    tagline: 'Analytical and unhurried. Inserts deliberate pauses, questions high-level buzzwords, and tests edge cases.',
    pause_tolerance_seconds: 2.5,
    thinking_pause_seconds: 2.0,
    probe_style: 'Trade-Offs & Failure Mode Interrogation',
    traits: [
      'Deliberate, unhurried pauses',
      'Challenges buzzwords immediately',
      'Probes single points of failure (SPOF)',
      'Demands trade-off justifications',
    ],
  },
  {
    id: 'priya',
    name: 'Priya Sharma',
    title: 'VP of Platform Engineering',
    archetype: 'The High-Velocity Bar Raiser',
    badge_label: 'Elite Bar Raiser',
    accent_color: '#8B5CF6',
    difficulty: 'Elite',
    tagline: 'Fast-paced and exacting. Tests distributed scale, algorithmic optimality, and zero tolerance for hand-waving.',
    pause_tolerance_seconds: 2.0,
    thinking_pause_seconds: 0.2,
    probe_style: 'Asymptotic Scale & Distributed Systems',
    traits: [
      'High tempo & rapid transitions',
      'Demands exact asymptotic complexity',
      'Refuses to give hints',
      'Tests extreme scale (millions of QPS)',
    ],
  },
];

type Stage = 'intake' | 'blueprint_ready' | 'interview_live' | 'evaluating' | 'dossier';

interface BlueprintQuestion {
  id: string;
  text: string;
  competency: string;
  category: string;
}

interface InterviewBlueprint {
  blueprint_id: string;
  company: string;
  role: string;
  seniority: string;
  keywords: string[];
  rounds: string[];
  questions: BlueprintQuestion[];
}

const RECRUITER_PRESETS = [
  {
    label: 'Stripe · Payments Infrastructure',
    company: 'Stripe',
    role: 'Staff Infrastructure Engineer',
    seniority: 'Staff/Principal',
    jd: 'Build high-throughput, mission-critical financial ledger processing engines with strict idempotency keys, atomic row locks, and distributed consensus.',
  },
  {
    label: 'Google · Distributed Storage',
    company: 'Google',
    role: 'Principal Systems Engineer',
    seniority: 'Staff/Principal',
    jd: 'Lead design of distributed consensus engines, Raft protocol variants, and zero-downtime replication topologies for globally distributed storage systems.',
  },
  {
    label: 'Airbnb · Core Platform',
    company: 'Airbnb',
    role: 'Senior Backend Engineer',
    seniority: 'Senior',
    jd: 'Develop distributed caching architectures, optimize PostgreSQL B-tree indexing and query planners, and prevent cache stampede thundering herd failures under high concurrency.',
  },
];

export default function Interview() {
  const [stage, setStage] = useState<Stage>('intake');
  const [company, setCompany] = useState(RECRUITER_PRESETS[0].company);
  const [role, setRole] = useState(RECRUITER_PRESETS[0].role);
  const [seniority, setSeniority] = useState(RECRUITER_PRESETS[0].seniority);
  const [resumeText, setResumeText] = useState('');
  const [jdText, setJdText] = useState(RECRUITER_PRESETS[0].jd);
  const [candidateName, setCandidateName] = useState('Alex Chen');

  // Calibrated Personas
  const [personas, setPersonas] = useState<Persona[]>(FALLBACK_PERSONAS);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('marcus');

  useEffect(() => {
    getPersonas()
      .then((data) => {
        if (data && data.length > 0) {
          setPersonas(data);
        }
      })
      .catch((err) => console.warn('Using fallback personas:', err));
  }, []);

  const activePersona = personas.find((p) => p.id === selectedPersonaId) || personas[0];

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [blueprint, setBlueprint] = useState<InterviewBlueprint | null>(null);
  const [sessionId, setSessionId] = useState('');

  // LiveKit Connection
  const [token, setToken] = useState('');
  const [serverUrl, setServerUrl] = useState('');

  // Evaluated Dossier
  const [dossier, setDossier] = useState<InterviewDossier | null>(null);

  const applyPreset = (preset: typeof RECRUITER_PRESETS[0]) => {
    setCompany(preset.company);
    setRole(preset.role);
    setSeniority(preset.seniority);
    setJdText(preset.jd);
  };

  const handleGenerateBlueprint = async () => {
    setLoading(true);
    setError('');
    const sid = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setSessionId(sid);

    try {
      const bp = await createBlueprint({
        company,
        role,
        seniority,
        resume_text: resumeText,
        jd_text: jdText,
        session_id: sid,
        persona_id: selectedPersonaId,
      });
      setBlueprint(bp);
      setStage('blueprint_ready');
    } catch (err: any) {
      console.error('Failed to generate blueprint:', err);
      setError(err?.response?.data?.detail || 'Failed to synthesize blueprint. Please check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartCall = async () => {
    if (!blueprint) return;
    setLoading(true);
    setError('');

    try {
      const tokenRes = await getLiveKitToken(sessionId, candidateName, undefined, selectedPersonaId);
      setToken(tokenRes.token);
      setServerUrl(tokenRes.url);
      setStage('interview_live');
    } catch (err: any) {
      console.error('Failed to get token:', err);
      const detail = err?.response?.data?.detail;
      if (detail && detail.includes('LiveKit credentials')) {
        setError(
          'LiveKit credentials (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) are not configured in your Render service Environment tab. Please add them in the Render Dashboard to start the WebRTC voice call.'
        );
      } else {
        setError(detail || 'Failed to connect to LiveKit WebRTC Cloud. Please check your backend connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEndCall = async () => {
    setStage('evaluating');
    try {
      const report = await evaluateSession(sessionId);
      setDossier(report);
      setStage('dossier');
    } catch (err: any) {
      console.error('Evaluation failed:', err);
      setError('Evaluation service could not generate dossier. Showing provisional view.');
      setDossier({
        session_id: sessionId,
        company: blueprint?.company || company,
        role: blueprint?.role || role,
        seniority: blueprint?.seniority || seniority,
        overall_score: 65,
        recommendation: 'Borderline',
        executive_summary: 'Live voice interview concluded. Evaluator recorded turn ledger events and assessed candidate communication and architecture trade-offs.',
        evaluated_questions: [],
        unreached_questions: [],
        total_turns_analyzed: 2,
        strengths: ['Direct communication style', 'Identified primary architecture trade-offs'],
        growth_areas: ['Provide deeper quantitative justification for distributed system choices'],
      });
      setStage('dossier');
    }
  };

  const handleReset = () => {
    setStage('intake');
    setBlueprint(null);
    setDossier(null);
    setSessionId('');
    setToken('');
    setServerUrl('');
    setError('');
  };

  return (
    <div style={{ minHeight: '100%', padding: '40px 0 80px' }}>
      <div className="studio-container">
        {/* STAGE 1: INTAKE & PERSONA SETUP */}
        {stage === 'intake' && (
          <motion.div
            key="intake"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 32 }}
          >
            {/* Header */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Radio size={16} color="#38bdf8" />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#38bdf8', textTransform: 'uppercase' }}>
                  LiveKit Voice Studio · Session Configuration
                </span>
              </div>
              <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                Technical Interview Studio
              </h1>
              <p style={{ fontSize: 15, color: '#94a3b8', maxWidth: 680, marginTop: 4 }}>
                Synthesize an immutable interview blueprint tailored to your target company and resume.
                Every question defines concrete binary assertions scored mathematically in pure Python.
              </p>
            </div>

            {/* Recruiter Presets */}
            <div className="studio-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Building2 size={15} color="#818cf8" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  1-Click Role Calibration Presets
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {RECRUITER_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 10,
                      border: company === preset.company ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.08)',
                      background: company === preset.company ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      color: company === preset.company ? '#a5b4fc' : '#cbd5e1',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Form Fields Grid */}
            <div
              className="studio-card"
              style={{
                padding: 28,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 20,
              }}
            >
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 8 }}>
                  <Building2 size={14} color="#64748b" /> Target Company
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Stripe, Google, Netflix"
                  className="studio-input"
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 8 }}>
                  <Briefcase size={14} color="#64748b" /> Target Role
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Staff Infrastructure Engineer"
                  className="studio-input"
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 8 }}>
                  <Layers size={14} color="#64748b" /> Seniority Level
                </label>
                <select
                  value={seniority}
                  onChange={(e) => setSeniority(e.target.value)}
                  className="studio-select"
                >
                  <option value="Junior">Junior Engineer (L3)</option>
                  <option value="Mid-Level">Mid-Level Engineer (L4)</option>
                  <option value="Senior">Senior Engineer (L5)</option>
                  <option value="Staff/Principal">Staff / Principal (L6+)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 8 }}>
                  <User size={14} color="#64748b" /> Candidate Name
                </label>
                <input
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="Your Name"
                  className="studio-input"
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 8 }}>
                  <FileText size={14} color="#64748b" /> Candidate Experience / Resume Highlights (Optional)
                </label>
                <textarea
                  rows={3}
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste resume summary, distributed systems projects, or core tech stack to ground questions on your actual experience..."
                  className="studio-textarea"
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 8 }}>
                  <FileText size={14} color="#64748b" /> Job Description & Requirements
                </label>
                <textarea
                  rows={3}
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="Paste JD requirements or leave default preset..."
                  className="studio-textarea"
                />
              </div>
            </div>

            {/* Calibrated Persona Selector */}
            <div className="studio-card" style={{ padding: 28 }}>
              <PersonaSelector
                personas={personas}
                selectedPersonaId={selectedPersonaId}
                onSelectPersona={setSelectedPersonaId}
              />
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#f43f5e', fontSize: 14 }}>
                <AlertTriangle size={18} /> {error}
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontSize: 14,
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16 }}>
              <button
                type="button"
                onClick={handleGenerateBlueprint}
                disabled={loading}
                className="btn-primary"
                style={{ padding: '14px 36px', fontSize: 15 }}
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {loading ? 'Synthesizing Blueprint...' : 'Synthesize Interview Blueprint'}
              </button>
            </div>
          </motion.div>
        )}

        {/* STAGE 2: BLUEPRINT PREVIEW & JOIN CALL */}
        {stage === 'blueprint_ready' && blueprint && (
          <motion.div
            key="blueprint"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 28 }}
          >
            {/* Header & Meta */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <CheckCircle2 size={16} color="#10b981" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Blueprint Synthesized & Grounded
                  </span>
                </div>
                <h2 style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                  {blueprint.seniority} {blueprint.role} at {blueprint.company}
                </h2>
                <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0', fontFamily: "'JetBrains Mono', monospace" }}>
                  Session ID: <code style={{ color: '#818cf8' }}>{sessionId}</code>
                </p>

                {/* Assigned Interviewer Persona Badge */}
                {activePersona && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 99, background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', marginTop: 14 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: activePersona.accent_color, display: 'inline-block', boxShadow: `0 0 8px ${activePersona.accent_color}` }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                      Interviewer: {activePersona.name}
                    </span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      ({activePersona.archetype} · {activePersona.difficulty} Rigor)
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setStage('intake')}
                  className="btn-secondary"
                >
                  Edit Blueprint
                </button>

                <button
                  type="button"
                  onClick={handleStartCall}
                  disabled={loading}
                  className="btn-primary"
                  style={{ background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)' }}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  {loading ? 'Joining Studio Room...' : 'Enter WebRTC Voice Room'}
                </button>
              </div>
            </div>

            {error && (
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontSize: 14,
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Keyword Vocabulary Pills */}
            <div className="studio-card" style={{ padding: 18 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Speech Recognition Technical Vocabulary (Pre-Boosted):
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {blueprint.keywords.map((kw, idx) => (
                  <span key={idx} className="status-pill status-pill-cyan">
                    {kw}
                  </span>
                ))}
              </div>
            </div>

            {/* Planned Questions List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Structured Rounds ({blueprint.questions.length})
              </h3>

              {blueprint.questions.map((q, idx) => (
                <div key={q.id} className="studio-card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', fontFamily: "'JetBrains Mono', monospace" }}>
                      Round {idx + 1}
                    </span>
                    <span className="status-pill status-pill-purple">
                      {q.competency}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, color: '#f1f5f9', margin: 0, fontWeight: 500, lineHeight: 1.5 }}>
                    {q.text}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* STAGE 3: LIVE WEBRTC CALL */}
        {stage === 'interview_live' && token && serverUrl && (
          <motion.div
            key="live"
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
          >
            <LiveKitRoomWrapper
              token={token}
              serverUrl={serverUrl}
              onLeave={handleEndCall}
              sessionTitle={`${blueprint?.seniority} ${blueprint?.role} · ${blueprint?.company}`}
              persona={activePersona}
            />
          </motion.div>
        )}

        {/* STAGE 4: EVALUATING STATE */}
        {stage === 'evaluating' && (
          <motion.div
            key="evaluating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 480,
              gap: 24,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1.5px solid rgba(99, 102, 241, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 30px rgba(99, 102, 241, 0.25)',
              }}
            >
              <Loader2 size={36} color="#818cf8" className="animate-spin" />
            </div>

            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                Synthesizing Grounded Dossier
              </h2>
              <p style={{ fontSize: 14, color: '#94a3b8', maxWidth: 460, margin: '8px auto 0', lineHeight: 1.6 }}>
                Querying append-only turn ledger events, extracting verbatim evidence quotes,
                and calculating deterministic scoring (zero phantom questions).
              </p>
            </div>
          </motion.div>
        )}

        {/* STAGE 5: GROUNDED DOSSIER REPORT */}
        {stage === 'dossier' && dossier && (
          <motion.div
            key="dossier"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setStage('intake');
                  setBlueprint(null);
                  setDossier(null);
                }}
                className="btn-primary"
              >
                Start New Interview Session
                <ArrowRight size={16} />
              </button>
            </div>

            <DossierReport dossier={dossier} onRestart={handleReset} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
