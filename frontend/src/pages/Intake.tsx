import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import {
  UploadCloud,
  ArrowRight,
  Sparkles,
  AlertCircle,
  FileCheck,
  Loader2,
  Building2,
  Briefcase,
  Award,
  Users,
  FileText,
  Volume2,
  Code2,
  Target,
  Lightbulb,
  CheckCircle2,
  Check,
} from 'lucide-react';
import { useInterview } from '../context/InterviewContext';
import { createBlueprint, uploadResumePdf, type InterviewBlueprint, type PersonaProfile } from '../lib/api';

const SAMPLE_STAFF_RESUME = `
Alex Morgan — Staff Distributed Systems Engineer
Experience:
- Staff Software Engineer at CloudScale (2021 - Present): Architected distributed Raft consensus state machine replicating 50M ops/sec with <15ms p99 latency across multi-region VPCs. Designed split-brain quorum fencing mechanisms and log compaction.
- Senior Backend Engineer at FinTech Global (2018 - 2021): Built real-time transaction processing engine using Apache Kafka, gRPC, and Cassandra. Handled exactly-once processing semantics with transactional outbox patterns.
- Software Engineer at DataStream (2016 - 2018): Low-level network I/O optimization in Go and C++. Reduced tail latency by 40% via zero-copy ring buffers and epoll event loops.
Skills: Go, C++, Rust, Distributed Systems, Raft, Paxos, Kafka, Redis, Cassandra, Docker, Kubernetes, AWS, High Availability.
Education: B.S. in Computer Science, Carnegie Mellon University.
`;

const PERSONA_OPTIONS: PersonaProfile[] = [
  {
    id: 'alex',
    name: 'Alex Rivera',
    title: 'The Empathetic Lead',
    difficulty: 'accessible',
    accent_color: '#10b981',
    voice_model: 'Puck (Gemini)',
    pause_tolerance: 4.5,
    thinking_delay: 1.2,
    max_words: 32,
    signature_phrase: "Take a beat. Let's break down the failure modes together.",
  },
  {
    id: 'marcus',
    name: 'Marcus Vance',
    title: 'The Skeptical Staff Architect',
    difficulty: 'adversarial',
    accent_color: '#f59e0b',
    voice_model: 'Charon (Gemini)',
    pause_tolerance: 2.5,
    thinking_delay: 0.8,
    max_words: 28,
    signature_phrase: "That handles happy path, but what happens when the network partitions right here?",
  },
  {
    id: 'priya',
    name: 'Priya Sharma',
    title: 'The High-Velocity Bar Raiser',
    difficulty: 'rigorous',
    accent_color: '#8b5cf6',
    voice_model: 'Aoede (Gemini)',
    pause_tolerance: 2.0,
    thinking_delay: 0.5,
    max_words: 25,
    signature_phrase: "Walk me through the p99 latency curve at ten million transactions per second.",
  },
];

export default function Intake() {
  const {
    sessionId,
    targetCompany,
    targetRole,
    seniority,
    blueprint,
    setBlueprint,
    setTargetCompany,
    setTargetRole,
    setSeniority,
    selectedPersonaId,
    setSelectedPersonaId,
    setSelectedPersona,
  } = useInterview();

  const navigate = useNavigate();

  const [setupMode, setSetupMode] = useState<'quick' | 'resume_pdf' | 'resume_text'>('quick');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState<string>('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['Python']);
  const [selectedFocuses, setSelectedFocuses] = useState<string[]>(['Balanced Screening']);
  const [spotlightTopic, setSpotlightTopic] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [auditioningId, setAuditioningId] = useState<string | null>(null);

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages((prev) => {
      if (prev.includes(lang)) {
        if (prev.length === 1) return prev; // keep at least 1 selected
        return prev.filter((l) => l !== lang);
      }
      return [...prev, lang];
    });
  };

  const toggleFocus = (focusId: string) => {
    setSelectedFocuses((prev) => {
      if (prev.includes(focusId)) {
        if (prev.length === 1) return prev; // keep at least 1 selected
        return prev.filter((f) => f !== focusId);
      }
      return [...prev, focusId];
    });
  };

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setUploadedFile(acceptedFiles[0]);
      setErrorMsg(null);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  });

  const handleAudition = (persona: PersonaProfile) => {
    if (auditioningId === persona.id) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setAuditioningId(null);
      return;
    }
    setAuditioningId(persona.id);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(`Hello, I'm ${persona.name}. ${persona.signature_phrase}`);
      utterance.rate = persona.id === 'priya' ? 1.15 : persona.id === 'marcus' ? 0.95 : 1.0;
      utterance.pitch = persona.id === 'alex' ? 1.05 : persona.id === 'marcus' ? 0.85 : 1.1;
      utterance.onend = () => setAuditioningId(null);
      utterance.onerror = () => setAuditioningId(null);
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setAuditioningId(null), 3000);
    }
  };

  const handleSelectPersona = (p: PersonaProfile) => {
    setSelectedPersonaId(p.id);
    setSelectedPersona(p);
  };

  const handleGenerateBlueprint = async () => {
    setIsGenerating(true);
    setErrorMsg(null);

    const combinedLanguages = selectedLanguages.join(', ');
    const combinedFocuses = selectedFocuses.join(' + ');

    try {
      let bp: InterviewBlueprint;
      if (setupMode === 'resume_pdf' && uploadedFile) {
        bp = await uploadResumePdf(
          uploadedFile,
          targetCompany,
          targetRole,
          seniority,
          sessionId,
          selectedPersonaId,
          combinedLanguages,
          combinedFocuses,
          spotlightTopic
        );
      } else {
        const textToSubmit = setupMode === 'resume_text' ? resumeText.trim() : '';
        bp = await createBlueprint({
          company: targetCompany,
          role: targetRole,
          seniority,
          resume_text: textToSubmit,
          session_id: sessionId,
          persona_id: selectedPersonaId,
          primary_language: combinedLanguages,
          interview_focus: combinedFocuses,
          spotlight_topic: spotlightTopic,
        });
      }
      setBlueprint(bp);
    } catch (err: any) {
      console.error('[setup] Blueprint generation failed:', err);
      const detail = err.response?.data?.detail;
      const errorString =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
          ? detail.map((e: any) => e.msg || JSON.stringify(e)).join('; ')
          : detail
          ? JSON.stringify(detail)
          : 'Failed to synthesize interview blueprint. Please verify backend connection.';
      setErrorMsg(errorString);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartInterview = async () => {
    if (!blueprint) {
      // Auto-generate blueprint if not generated yet
      await handleGenerateBlueprint();
    }
    navigate('/interview');
  };

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '36px 24px' }}>
      {/* Step Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="status-pill status-pill-emerald">
            <Sparkles size={12} />
            INTERVIEW SETUP STUDIO
          </span>
          <span style={{ fontSize: 12, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
            STEP 1 OF 3 · CUSTOMIZE SESSION
          </span>
        </div>

        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: '-0.025em',
            marginBottom: 8,
            color: '#f8fafc',
          }}
        >
          Set Up Your Mock Interview
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14, maxWidth: 680, lineHeight: 1.6 }}>
          You have full control. Choose your target company, role, and seniority level. Practice based on general industry rubrics or upload your real resume for personalized technical questions.
        </p>
      </motion.div>

      {/* Target Position Calibration */}
      <div
        className="studio-card"
        style={{
          padding: '20px 24px',
          background: 'rgba(14, 18, 28, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>1. Target Role & Company Calibration</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {/* Target Company */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', fontFamily: "'JetBrains Mono', monospace", display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Building2 size={13} />
              TARGET COMPANY
            </label>
            <input
              type="text"
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
              placeholder="e.g. Google, Stripe, Meta, Amazon..."
              style={{
                fontSize: 13,
                padding: '9px 12px',
                width: '100%',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#f8fafc',
                outline: 'none',
              }}
            />
          </div>

          {/* Job Level / Seniority */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#10b981', fontFamily: "'JetBrains Mono', monospace", display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Award size={13} />
              JOB LEVEL / SENIORITY
            </label>
            <select
              value={seniority}
              onChange={(e) => setSeniority(e.target.value)}
              style={{
                fontSize: 13,
                padding: '9px 12px',
                width: '100%',
                borderRadius: 8,
                background: '#0e121c',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#f8fafc',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="Student / Intern">🎓 Student / Intern / Fresher</option>
              <option value="Junior">Junior (L3 / SDE I)</option>
              <option value="Mid-Level">Mid-Level (L4 / SDE II)</option>
              <option value="Senior">Senior (L5 / Senior SDE)</option>
              <option value="Staff">Staff (L6 / Staff Engineer)</option>
              <option value="Principal">Principal (L7+ / Director)</option>
            </select>
          </div>

          {/* Target Role */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', fontFamily: "'JetBrains Mono', monospace", display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Briefcase size={13} />
              TARGET ROLE
            </label>
            <input
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Distributed Systems Engineer"
              style={{
                fontSize: 13,
                padding: '9px 12px',
                width: '100%',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#f8fafc',
                outline: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* 2. Candidate Focus & Technical Stack */}
      <div
        className="studio-card"
        style={{
          padding: '20px 24px',
          background: 'rgba(14, 18, 28, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Target size={15} color="#38bdf8" />
          <span>2. Preparation Focus & Language Stack</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Primary Language */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', fontFamily: "'JetBrains Mono', monospace", display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                <Code2 size={13} />
                PRIMARY PROGRAMMING LANGUAGE / STACK
              </label>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
                Select one or multiple ({selectedLanguages.length} selected)
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['Python', 'TypeScript / JS', 'Java', 'C++', 'Go', 'Rust', 'Other'].map((lang) => {
                const isSelected = selectedLanguages.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLanguage(lang)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: isSelected ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                      color: isSelected ? '#38bdf8' : '#94a3b8',
                      boxShadow: isSelected ? '0 0 14px rgba(56, 189, 248, 0.22)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isSelected && <Check size={13} strokeWidth={3} />}
                    {lang}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interview Practice Focus */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#10b981', fontFamily: "'JetBrains Mono', monospace", display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                <Target size={13} />
                INTERVIEW PRACTICE FOCUS
              </label>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
                Select one or multiple ({selectedFocuses.length} selected)
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                { id: 'Balanced Screening', label: '🎯 Balanced Screening' },
                { id: 'Project Deep-Dive', label: '🚀 Project Deep-Dive' },
                { id: 'Coding & DSA', label: '💻 Coding & DSA' },
                { id: 'System Design', label: '🏗️ System Design' },
              ].map((focus) => {
                const isSelected = selectedFocuses.includes(focus.id);
                return (
                  <button
                    key={focus.id}
                    type="button"
                    onClick={() => toggleFocus(focus.id)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      border: isSelected ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: isSelected ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                      color: isSelected ? '#10b981' : '#94a3b8',
                      boxShadow: isSelected ? '0 0 14px rgba(16, 185, 129, 0.22)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isSelected && <Check size={13} strokeWidth={3} />}
                    {focus.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Specific Spotlight Topic */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', fontFamily: "'JetBrains Mono', monospace", display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Sparkles size={13} />
              SPECIFIC TOPIC OR PROJECT TO SPOTLIGHT (OPTIONAL)
            </label>
            <input
              type="text"
              value={spotlightTopic}
              onChange={(e) => setSpotlightTopic(e.target.value)}
              placeholder="e.g. Grill me on my capstone Redis caching layer, React rendering, or SQL indexing..."
              style={{
                fontSize: 13,
                padding: '9px 12px',
                width: '100%',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#f8fafc',
                outline: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* Mode Selection Tabs (Resume vs Custom Role) */}
      <div
        className="studio-card"
        style={{
          padding: '24px',
          background: 'rgba(14, 18, 28, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
            3. Choose Question Generation Source
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'quick', label: 'Quick Start (Role Rubric)', icon: Sparkles },
              { id: 'resume_pdf', label: 'Upload Resume PDF', icon: UploadCloud },
              { id: 'resume_text', label: 'Paste Experience Text', icon: FileText },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSetupMode(tab.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: setupMode === tab.id ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                  background: setupMode === tab.id ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                  color: setupMode === tab.id ? '#f8fafc' : '#94a3b8',
                }}
              >
                <tab.icon size={13} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab 1: Quick Start */}
        {setupMode === 'quick' && (
          <div style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
              Questions will be synthesized directly from Tier-1 engineering interview standards for{' '}
              <strong style={{ color: '#f8fafc' }}>{seniority} {targetRole}</strong> at{' '}
              <strong style={{ color: '#f8fafc' }}>{targetCompany}</strong>. No resume required!
            </p>
          </div>
        )}

        {/* Tab 2: Resume PDF */}
        {setupMode === 'resume_pdf' && (
          <div>
            <div
              {...getRootProps()}
              style={{
                border: isDragActive
                  ? '2px dashed #6366f1'
                  : uploadedFile
                  ? '2px solid rgba(16, 185, 129, 0.4)'
                  : '2px dashed rgba(255, 255, 255, 0.12)',
                borderRadius: 12,
                padding: 24,
                textAlign: 'center',
                background: isDragActive
                  ? 'rgba(99, 102, 241, 0.05)'
                  : uploadedFile
                  ? 'rgba(16, 185, 129, 0.04)'
                  : 'rgba(255, 255, 255, 0.01)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <input {...getInputProps()} />
              {uploadedFile ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <FileCheck size={28} color="#10b981" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>
                    {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    PDF uploaded · Click to replace
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <UploadCloud size={28} color="#818cf8" />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#f8fafc' }}>
                    Drag & Drop your Resume PDF here, or <span style={{ color: '#818cf8' }}>browse</span>
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    Questions will be personalized to your actual projects & architecture experience
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Text Paste */}
        {setupMode === 'resume_text' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
              <button
                type="button"
                onClick={() => setResumeText(SAMPLE_STAFF_RESUME.trim())}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#818cf8',
                  fontSize: 11,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Load Staff Sample Profile
              </button>
            </div>
            <textarea
              className="studio-textarea"
              rows={4}
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your past experience, technical projects, or skills summary..."
              style={{ fontSize: 12, resize: 'vertical' }}
            />
          </div>
        )}

        {errorMsg && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 12,
              color: '#f43f5e',
              marginTop: 16,
            }}
          >
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* 4. Interviewer Persona Choice */}
      <div
        className="studio-card"
        style={{
          padding: '24px',
          background: 'rgba(14, 18, 28, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={15} color="#818cf8" />
          <span>4. Select Interviewer Persona</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {PERSONA_OPTIONS.map((p) => {
            const isSelected = (selectedPersonaId || 'alex') === p.id;
            const isAuditioning = auditioningId === p.id;

            return (
              <div
                key={p.id}
                onClick={() => handleSelectPersona(p)}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  border: isSelected ? `2px solid ${p.accent_color}` : '1px solid rgba(255, 255, 255, 0.06)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 8,
                          background: `${p.accent_color}20`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: p.accent_color,
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        {p.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: p.accent_color }}>{p.title}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAudition(p);
                      }}
                      title="Audition voice"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 6,
                        padding: 6,
                        color: isAuditioning ? p.accent_color : '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Volume2 size={14} />
                    </button>
                  </div>

                  <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 10px', lineHeight: 1.5 }}>
                    "{p.signature_phrase}"
                  </p>
                </div>

                <div style={{ fontSize: 10, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
                  Pause tolerance: {p.pause_tolerance}s
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Blueprint Preview & Launch Bar */}
      {blueprint && (
        <div
          className="studio-card"
          style={{
            padding: 24,
            background: 'rgba(14, 18, 28, 0.9)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <span className="status-pill status-pill-emerald" style={{ marginBottom: 4 }}>
                CALIBRATED QUESTIONS READY
              </span>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                {blueprint.questions.length} Targeted Questions for {targetCompany}
              </h3>
            </div>
            <button
              onClick={handleGenerateBlueprint}
              disabled={isGenerating}
              className="btn-secondary"
              style={{ fontSize: 12 }}
            >
              {isGenerating ? 'Synthesizing...' : 'Regenerate Questions'}
            </button>
          </div>

          {/* Strategy Briefing Card */}
          {(blueprint.strategy_summary || (blueprint.preparation_tips && blueprint.preparation_tips.length > 0)) && (
            <div
              style={{
                marginBottom: 20,
                padding: 16,
                borderRadius: 10,
                background: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Lightbulb size={16} color="#818cf8" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                    Personalized Strategy & Candidate Coaching Briefing
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {blueprint.domain && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 600 }}>
                      {blueprint.domain}
                    </span>
                  )}
                  {blueprint.primary_language && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 600 }}>
                      Stack: {blueprint.primary_language}
                    </span>
                  )}
                </div>
              </div>

              {blueprint.strategy_summary && (
                <p style={{ fontSize: 13, color: '#cbd5e1', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                  {blueprint.strategy_summary}
                </p>
              )}

              {blueprint.preparation_tips && blueprint.preparation_tips.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {blueprint.preparation_tips.map((tip, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#94a3b8' }}>
                      <CheckCircle2 size={14} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
            {blueprint.questions.map((q, idx) => (
              <div
                key={q.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                  Q{idx + 1} · {q.competency}
                </div>
                <p style={{ fontSize: 13, color: '#f1f5f9', margin: 0, lineHeight: 1.4 }}>
                  {q.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Primary Action Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
        {!blueprint ? (
          <button
            type="button"
            onClick={handleGenerateBlueprint}
            disabled={isGenerating}
            className="btn-primary"
            style={{ padding: '14px 32px', fontSize: 14 }}
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Synthesizing Question Blueprint...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>Generate Questions & Preview</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStartInterview}
            className="btn-primary"
            style={{
              padding: '14px 36px',
              fontSize: 15,
              background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
              borderColor: 'rgba(255, 255, 255, 0.2)',
            }}
          >
            <span>Start Live Voice Interview</span>
            <ArrowRight size={17} />
          </button>
        )}
      </div>
    </div>
  );
}
