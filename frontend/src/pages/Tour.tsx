import { useState, type ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass,
  ArrowRight,
  ArrowLeft,
  Users,
  Mic,
  FileText,
} from 'lucide-react';

interface TourStep {
  id: number;
  title: string;
  badge: string;
  badgeColor: string;
  headline: string;
  description: string;
  icon: ElementType;
  illustration: {
    tag: string;
    items: { label: string; value: string; detail?: string }[];
  };
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 1,
    title: 'Progressive Disclosure Architecture',
    badge: 'STAGE 1: PHILOSOPHY',
    badgeColor: 'status-pill-cyan',
    headline: 'No Cognitive Overload. One Intentional Step at a Time.',
    description:
      'Unlike generic hackathon apps that dump resumes, questions, audio controls, and scores onto a single chaotic screen, Apex guides you through a calibrated Silicon Valley pipeline. You explore your track, synthesize your blueprint, audition your persona, and enter a dedicated voice chamber.',
    icon: Compass,
    illustration: {
      tag: '5-STAGE PROGRESSIVE PIPELINE',
      items: [
        { label: 'Stage 1', value: 'Trajectory Hub', detail: 'Select Target Tier & Systems Focus' },
        { label: 'Stage 2', value: 'Resume Ingest', detail: 'PDF Extraction & Binary Assertions' },
        { label: 'Stage 3', value: 'Interviewer Showroom', detail: 'Audio Audition of Staff Personas' },
        { label: 'Stage 4', value: 'Voice Studio', detail: 'Full-Duplex WebRTC Live Sound Chamber' },
        { label: 'Stage 5', value: 'Executive Dossier', detail: 'Anti-Phantom Deterministic Evaluation' },
      ],
    },
  },
  {
    id: 2,
    title: 'Resume Intake & Calibrated Blueprint',
    badge: 'STAGE 2: SYNTHESIS',
    badgeColor: 'status-pill-emerald',
    headline: 'Every Question Grounded in Real Experience & Binary Assertions.',
    description:
      'Drop your PDF resume and target company. Our backend extracts your tech stack, projects, and architecture patterns. It generates 3-5 calibrated technical and system design questions. Crucially, each question is paired with 3-4 binary pass/fail assertions that eliminate subjective AI hallucinations.',
    icon: FileText,
    illustration: {
      tag: 'CALIBRATED QUESTION SPECIFICATION',
      items: [
        { label: 'Competency', value: 'Distributed Consensus & Replication' },
        { label: 'Assertion 1', value: 'Explicitly contrasts Raft leader election vs Multi-Paxos' },
        { label: 'Assertion 2', value: 'Addresses split-brain prevention via quorum fencing' },
        { label: 'Assertion 3', value: 'Quantifies p99 latency under WAN network partition' },
      ],
    },
  },
  {
    id: 3,
    title: 'The Persona Showroom & Voice Sweet-Spot',
    badge: 'STAGE 3: CALIBRATION',
    badgeColor: 'status-pill-purple',
    headline: 'Audition Real Staff Interviewers Before You Speak.',
    description:
      'Practice against distinct interviewer archetypes. Alex Rivera offers empathetic Socratic probing with a generous 4.5s pause tolerance. Marcus Vance challenges your design with skepticism and 2.5s cadence. Priya Sharma demands high velocity. The AI speaks first autonomously.',
    icon: Users,
    illustration: {
      tag: 'STAFF PERSONA PROFILES',
      items: [
        { label: 'Alex Rivera (Emerald)', value: 'Puck Voice · 4.5s Pause · Socratic Scaffolding' },
        { label: 'Marcus Vance (Amber)', value: 'Charon Voice · 2.5s Pause · Adversarial Drill' },
        { label: 'Priya Sharma (Violet)', value: 'Aoede Voice · 2.0s Pause · Algorithmic Velocity' },
        { label: 'Turn Economy', value: '<35 words per turn to guarantee real dialogue' },
      ],
    },
  },
  {
    id: 4,
    title: 'Full-Duplex Sound Studio & Anti-Phantom Dossier',
    badge: 'STAGE 4 & 5: EXECUTION',
    badgeColor: 'status-pill-amber',
    headline: 'Sub-650ms Latency Backed by Cryptographic Turn Ledger.',
    description:
      'During your live interview, our LiveKit WebRTC engine streams full-duplex audio with real-time latency telemetry. Every single spoken turn is recorded into an append-only SQLite Turn Ledger. The post-interview Hiring Committee Dossier strictly grades only reached questions—mathematically guaranteeing 0% phantom hallucinations.',
    icon: Mic,
    illustration: {
      tag: 'LIVE TELEMETRY & LEDGER AUDIT',
      items: [
        { label: 'TTFT Latency', value: '~280 ms Time-to-First-Token' },
        { label: 'VAD Processing', value: 'Silero Neural Voice Activity Detection' },
        { label: 'Ledger Audit', value: 'SHA-256 Session Integrity Digest' },
        { label: 'Hiring Committee', value: 'Deterministic Strong Hire / Hire / No Hire Gate' },
      ],
    },
  },
];

export default function Tour() {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  const step = TOUR_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      navigate('/dashboard');
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirst) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    navigate('/dashboard');
  };

  const IconComponent = step.icon;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at 50% 15%, #131726 0%, #08090d 75%)',
        color: '#f8fafc',
        padding: '40px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ maxWidth: 860, width: '100%' }}>
        {/* Top Progress Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: '0.05em',
                color: '#818cf8',
              }}
            >
              APEX ORIENTATION
            </span>
            <span style={{ color: '#475569' }}>/</span>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              Step {currentStep + 1} of {TOUR_STEPS.length}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSkip}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 500,
              padding: '4px 8px',
            }}
          >
            Skip to Dashboard →
          </button>
        </div>

        {/* Step Indicator Bullets */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
          {TOUR_STEPS.map((s, idx) => (
            <div
              key={s.id}
              onClick={() => setCurrentStep(idx)}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background:
                  idx === currentStep
                    ? '#6366f1'
                    : idx < currentStep
                    ? '#38bdf8'
                    : 'rgba(255, 255, 255, 0.1)',
                cursor: 'pointer',
                transition: 'all 0.25s ease',
              }}
            />
          ))}
        </div>

        {/* Main Tour Card */}
        <div
          className="studio-card"
          style={{
            padding: 40,
            background: 'rgba(14, 18, 28, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 36, alignItems: 'center' }}>
            {/* Left Column: Description & Explanation */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#818cf8',
                  }}
                >
                  <IconComponent size={20} />
                </div>
                <span className={`status-pill ${step.badgeColor}`}>
                  {step.badge}
                </span>
              </div>

              <h2
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  fontFamily: "'Space Grotesk', sans-serif",
                  lineHeight: 1.3,
                  marginBottom: 14,
                  color: '#f8fafc',
                }}
              >
                {step.headline}
              </h2>

              <p
                style={{
                  fontSize: 14,
                  color: '#94a3b8',
                  lineHeight: 1.6,
                  marginBottom: 24,
                }}
              >
                {step.description}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {!isFirst && (
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="btn-secondary"
                    style={{ padding: '10px 18px' }}
                  >
                    <ArrowLeft size={16} />
                    <span>Previous</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleNext}
                  className="btn-primary"
                  style={{ padding: '10px 22px' }}
                >
                  <span>{isLast ? 'Begin Assessment Journey' : 'Next Discovery'}</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            {/* Right Column: Interactive Diagram / Visual Spec */}
            <div
              style={{
                background: '#090c12',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 14,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  paddingBottom: 10,
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#818cf8',
                    letterSpacing: '0.05em',
                  }}
                >
                  {step.illustration.tag}
                </span>
                <span style={{ fontSize: 11, color: '#475569' }}>ACTIVE SPEC</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {step.illustration.items.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      borderRadius: 8,
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                        {item.label}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: '#38bdf8',
                        }}
                      >
                        {item.value}
                      </span>
                    </div>
                    {item.detail && (
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        {item.detail}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
