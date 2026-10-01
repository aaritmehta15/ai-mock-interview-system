import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Server,
  Layers,
  BrainCircuit,
  Zap,
  Building2,
  Award,
  Check,
  Sparkles,
  Briefcase,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useInterview } from '../context/InterviewContext';

interface TrackOption {
  id: string;
  title: string;
  baseRole: string;
  role: string;
  tagline: string;
  icon: React.ElementType;
  accent: string;
  coreConcepts: string[];
}

const TRACKS: TrackOption[] = [
  {
    id: 'dist-sys',
    title: 'Distributed Systems & Cloud Infra',
    baseRole: 'Distributed Systems Engineer',
    role: 'Distributed Systems Engineer',
    tagline: 'High-availability, consensus protocols, distributed transactions, and partition tolerance.',
    icon: Server,
    accent: '#38bdf8',
    coreConcepts: ['Raft / Multi-Paxos', 'Quorum Fencing', 'Kafka Event Streaming', 'DynamoDB / Cassandra'],
  },
  {
    id: 'ai-platform',
    title: 'AI / ML Platform & LLM Infrastructure',
    baseRole: 'AI Infrastructure Engineer',
    role: 'AI Infrastructure Engineer',
    tagline: 'High-throughput LLM inference, vLLM serving, vector search at scale, and KV cache optimization.',
    icon: BrainCircuit,
    accent: '#8b5cf6',
    coreConcepts: ['vLLM PagedAttention', 'HNSW Vector Indexing', 'Quantization (FP8/INT4)', 'Triton Inference Server'],
  },
  {
    id: 'backend',
    title: 'Backend & Scaled Microservices',
    baseRole: 'Backend Engineer',
    role: 'Backend Engineer',
    tagline: 'High-concurrency microservices, gRPC, database indexing, caching strategies, and resilient pipelines.',
    icon: Layers,
    accent: '#10b981',
    coreConcepts: ['Idempotency Keys', 'gRPC & Protobuf', 'Redis Caching', 'PostgreSQL Query Optimization'],
  },
  {
    id: 'full-stack',
    title: 'Full-Stack Product Engineering',
    baseRole: 'Full-Stack Engineer',
    role: 'Full-Stack Engineer',
    tagline: 'End-to-end product architecture, real-time WebSockets, responsive state, and API gateways.',
    icon: Layers,
    accent: '#ec4899',
    coreConcepts: ['WebSocket Multiplexing', 'GraphQL Federation', 'State Management', 'SSR & Hydration'],
  },
  {
    id: 'low-latency',
    title: 'High-Throughput & Low-Latency Systems',
    baseRole: 'Systems Performance Engineer',
    role: 'Systems Performance Engineer',
    tagline: 'Sub-millisecond processing, zero-copy network buffers, memory layout, and lockless ring queues.',
    icon: Zap,
    accent: '#f59e0b',
    coreConcepts: ['Lock-free Queues', 'Zero-Copy I/O', 'Cache-Line Alignment', 'Kernel Bypass (DPDK)'],
  },
  {
    id: 'sre-devops',
    title: 'Site Reliability & Infrastructure Platform',
    baseRole: 'Site Reliability Engineer',
    role: 'Site Reliability Engineer',
    tagline: 'Kubernetes orchestration, distributed tracing, automated failover, and SLO/SLA reliability.',
    icon: Server,
    accent: '#06b6d4',
    coreConcepts: ['Kubernetes Operators', 'OpenTelemetry Tracing', 'Chaos Engineering', 'Canary Rollouts'],
  },
];

const COMPANIES = [
  'Google',
  'Meta',
  'Amazon',
  'Stripe',
  'Databricks',
  'Apple',
  'Netflix',
  'OpenAI',
];

const SENIORITY_LEVELS = [
  'Junior (L3)',
  'Mid-Level (L4)',
  'Senior (L5)',
  'Staff (L6)',
  'Principal (L7)',
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

  const [selectedTrackId, setSelectedTrackId] = useState<string>('dist-sys');

  // Keep track highlighting synchronized if targetRole matches a known track
  useEffect(() => {
    const matchedTrack = TRACKS.find(t =>
      targetRole.toLowerCase().includes(t.baseRole.toLowerCase())
    );
    if (matchedTrack) {
      setSelectedTrackId(matchedTrack.id);
    }
  }, [targetRole]);

  const handleSelectTrack = (track: TrackOption) => {
    setSelectedTrackId(track.id);
    const cleanBase = track.baseRole;
    const combinedRole = seniority.toLowerCase() === 'mid-level' ? cleanBase : `${seniority} ${cleanBase}`;
    setTargetRole(combinedRole);
  };

  const handleSelectSeniority = (levelStr: string) => {
    const cleanSeniority = levelStr.split(' ')[0];
    setSeniority(cleanSeniority);
    // Dynamically update targetRole so seniority is composed with role title
    const currentBase = targetRole.replace(/^(Junior|Mid-Level|Senior|Staff|Principal)\s+/i, '') || 'Distributed Systems Engineer';
    const combinedRole = cleanSeniority.toLowerCase() === 'mid-level' ? currentBase : `${cleanSeniority} ${currentBase}`;
    setTargetRole(combinedRole);
  };

  const handleProceed = () => {
    navigate('/intake');
  };

  const candidateName = user?.displayName?.split(' ')[0] || 'Engineer';

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px' }}>
      {/* Top Banner */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="status-pill status-pill-cyan">
            <Sparkles size={12} />
            STAGE 1 OF 5 · TRAJECTORY SELECTION
          </span>
          <span style={{ fontSize: 12, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
            CANDIDATE: {candidateName.toUpperCase()}
          </span>
        </div>

        <h1
          style={{
            fontSize: 30,
            fontWeight: 800,
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: '-0.025em',
            marginBottom: 8,
          }}
        >
          Define Your Technical Trajectory
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14, maxWidth: 640 }}>
          Apex calibrates every question, pause tolerance, and scoring assertion to your target company and domain. Select your target track to begin.
        </p>
      </motion.div>

      {/* Track Selection Grid */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
            1. Select Engineering Domain
          </h2>
          <span style={{ fontSize: 12, color: '#64748b' }}>Choose one core competency focus</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {TRACKS.map((track) => {
            const isSelected = selectedTrackId === track.id;
            const Icon = track.icon;
            return (
              <div
                key={track.id}
                onClick={() => handleSelectTrack(track)}
                className={`studio-card ${isSelected ? 'studio-card-glow' : ''}`}
                style={{
                  padding: 20,
                  cursor: 'pointer',
                  border: isSelected
                    ? `1px solid ${track.accent}`
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  background: isSelected
                    ? 'rgba(18, 24, 38, 0.95)'
                    : 'rgba(14, 17, 24, 0.7)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 14,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: `${track.accent}15`,
                        border: `1px solid ${track.accent}35`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: track.accent,
                      }}
                    >
                      <Icon size={20} />
                    </div>
                    {isSelected && (
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: track.accent,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#000',
                        }}
                      >
                        <Check size={14} strokeWidth={3} />
                      </div>
                    )}
                  </div>

                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: '#f8fafc' }}>
                    {track.title}
                  </h3>
                  <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 14 }}>
                    {track.tagline}
                  </p>
                </div>

                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {track.coreConcepts.slice(0, 2).map((concept, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(255, 255, 255, 0.04)',
                          color: '#cbd5e1',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {concept}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Active Role Quick Editor */}
        <div
          style={{
            marginTop: 18,
            padding: '12px 18px',
            borderRadius: 10,
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Briefcase size={16} color="#818cf8" />
          <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap', fontWeight: 600 }}>
            Active Role:
          </span>
          <input
            type="text"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            placeholder="e.g. Staff Distributed Systems Engineer"
            style={{
              flex: 1,
              padding: '7px 12px',
              fontSize: 13,
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#f8fafc',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Target Company & Seniority Configuration */}
      <div
        className="studio-card"
        style={{
          padding: 24,
          background: 'rgba(14, 17, 24, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: 36,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
          {/* Target Company */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Building2 size={16} color="#818cf8" />
              <label style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>
                2. Target Organization Tier
              </label>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {COMPANIES.map((comp) => {
                const isCompSelected = targetCompany.toLowerCase() === comp.toLowerCase();
                return (
                  <button
                    key={comp}
                    type="button"
                    onClick={() => setTargetCompany(comp)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: isCompSelected ? 600 : 400,
                      background: isCompSelected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      border: isCompSelected
                        ? '1px solid rgba(99, 102, 241, 0.6)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      color: isCompSelected ? '#c7d2fe' : '#94a3b8',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {comp}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seniority Level */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Award size={16} color="#10b981" />
              <label style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>
                3. Seniority Calibration
              </label>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SENIORITY_LEVELS.map((level) => {
                const isSenioritySelected = seniority.toLowerCase() === level.split(' ')[0].toLowerCase();
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => handleSelectSeniority(level)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isSenioritySelected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: isSenioritySelected
                        ? '1px solid rgba(16, 185, 129, 0.4)'
                        : '1px solid rgba(255, 255, 255, 0.06)',
                      color: isSenioritySelected ? '#6ee7b7' : '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{level}</span>
                    {isSenioritySelected && <Check size={14} color="#10b981" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Selected Trajectory Summary & Next Step Action */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: 14,
          padding: '18px 24px',
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#818cf8', marginBottom: 2 }}>
            CONFIGURED CALIBRATION
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
            {targetCompany} · {targetRole}
          </div>
        </div>

        <button
          type="button"
          onClick={handleProceed}
          className="btn-primary"
          style={{ padding: '12px 24px', fontSize: 14 }}
        >
          <span>Proceed to Resume Intake & Blueprint</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
