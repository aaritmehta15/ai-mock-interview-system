import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import {
  UploadCloud,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  AlertCircle,
  FileCheck,
  Loader2,
  Building2,
  Briefcase,
  Award,
} from 'lucide-react';
import { useInterview } from '../context/InterviewContext';
import { createBlueprint, uploadResumePdf, type InterviewBlueprint } from '../lib/api';

const SAMPLE_STAFF_RESUME = `
Alex Morgan — Staff Distributed Systems Engineer
Experience:
- Staff Software Engineer at CloudScale (2021 - Present): Architected distributed Raft consensus state machine replicating 50M ops/sec with <15ms p99 latency across multi-region VPCs. Designed split-brain quorum fencing mechanisms and log compaction.
- Senior Backend Engineer at FinTech Global (2018 - 2021): Built real-time transaction processing engine using Apache Kafka, gRPC, and Cassandra. Handled exactly-once processing semantics with transactional outbox patterns.
- Software Engineer at DataStream (2016 - 2018): Low-level network I/O optimization in Go and C++. Reduced tail latency by 40% via zero-copy ring buffers and epoll event loops.
Skills: Go, C++, Rust, Distributed Systems, Raft, Paxos, Kafka, Redis, Cassandra, Docker, Kubernetes, AWS, High Availability.
Education: B.S. in Computer Science, Carnegie Mellon University.
`;

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
  } = useInterview();

  const navigate = useNavigate();

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const handleLoadSampleResume = () => {
    setResumeText(SAMPLE_STAFF_RESUME.trim());
    setUploadedFile(null);
    setErrorMsg(null);
  };

  const handleGenerateBlueprint = async () => {
    setIsGenerating(true);
    setErrorMsg(null);

    try {
      let bp: InterviewBlueprint;
      if (uploadedFile) {
        bp = await uploadResumePdf(
          uploadedFile,
          targetCompany,
          targetRole,
          seniority,
          sessionId
        );
      } else {
        const textToSubmit = resumeText.trim() || SAMPLE_STAFF_RESUME.trim();
        bp = await createBlueprint({
          company: targetCompany,
          role: targetRole,
          seniority,
          resume_text: textToSubmit,
          session_id: sessionId,
        });
      }
      setBlueprint(bp);
    } catch (err: any) {
      console.error('[intake] Blueprint generation failed:', err);
      const detail = err.response?.data?.detail;
      // Pydantic v2 returns detail as an array of {type, loc, msg, input} — must stringify
      const errorString =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
          ? detail.map((e: any) => e.msg || JSON.stringify(e)).join('; ')
          : detail
          ? JSON.stringify(detail)
          : 'Failed to synthesize interview blueprint. Please verify backend status and try again.';
      setErrorMsg(errorString);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleProceed = () => {
    if (blueprint) {
      navigate('/personas');
    }
  };

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px' }}>
      {/* Step Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="status-pill status-pill-emerald">
            <Sparkles size={12} />
            STAGE 2 OF 5 · RESUME INTAKE & BLUEPRINT
          </span>
          <span style={{ fontSize: 12, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
            TARGET: {targetCompany.toUpperCase()} · {seniority.toUpperCase()}
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
          Synthesize Calibrated Interview Blueprint
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14, maxWidth: 680 }}>
          Upload your resume PDF or use our pre-calibrated Staff Engineering profile. Apex extracts your technical depth and generates real interview questions with mathematical binary assertions.
        </p>
      </motion.div>

      {/* Target Position Calibration */}
      <div
        className="studio-card"
        style={{
          padding: '20px 24px',
          background: 'rgba(14, 18, 28, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
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
              placeholder="e.g. Apple, Google, Meta, Netflix..."
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

      {/* Main Grid: Upload & Controls on Left, Blueprint Preview on Right */}
      <div style={{ display: 'grid', gridTemplateColumns: blueprint ? '1fr 1.2fr' : '1fr', gap: 24, marginBottom: 36 }}>
        {/* Left: Uploader Card */}
        <div
          className="studio-card"
          style={{
            padding: 28,
            background: 'rgba(14, 17, 24, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
              1. Candidate Credentials Ingest
            </h2>
            <button
              type="button"
              onClick={handleLoadSampleResume}
              style={{
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#a5b4fc',
                cursor: 'pointer',
              }}
            >
              Load Staff Sample
            </button>
          </div>

          {/* Dropzone */}
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
              marginBottom: 18,
              transition: 'all 0.15s ease',
            }}
          >
            <input {...getInputProps()} />
            {uploadedFile ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <FileCheck size={32} color="#10b981" />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>
                  {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
                </span>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Click or drag another PDF to replace
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <UploadCloud size={32} color="#818cf8" />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#f8fafc' }}>
                  Drop your Resume PDF here, or <span style={{ color: '#818cf8' }}>browse</span>
                </span>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Supports standard single or multi-page PDF resumes
                </span>
              </div>
            )}
          </div>

          {/* Fallback Text Input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6, display: 'block' }}>
              Or Paste Resume Text / Tech Summary
            </label>
            <textarea
              className="studio-textarea"
              rows={4}
              value={resumeText}
              onChange={(e) => {
                setResumeText(e.target.value);
                setUploadedFile(null);
              }}
              placeholder="e.g. Staff Distributed Systems Engineer with expertise in Raft, Paxos, Kafka, gRPC, zero-copy networking..."
              style={{ fontSize: 12, resize: 'vertical' }}
            />
          </div>

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
                marginBottom: 16,
              }}
            >
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Button */}
          <button
            type="button"
            onClick={handleGenerateBlueprint}
            disabled={isGenerating}
            className="btn-primary"
            style={{ width: '100%', padding: '12px 18px', fontSize: 13 }}
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Synthesizing Binary Assertions...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>{blueprint ? 'Regenerate Blueprint' : 'Synthesize Blueprint'}</span>
              </>
            )}
          </button>
        </div>

        {/* Right: Synthesized Blueprint Preview */}
        {blueprint && (
          <div
            className="studio-card"
            style={{
              padding: 28,
              background: 'rgba(14, 18, 28, 0.9)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <span className="status-pill status-pill-emerald" style={{ marginBottom: 6 }}>
                  CALIBRATED BLUEPRINT READY
                </span>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#f8fafc' }}>
                  {blueprint.questions.length} Targeted Assessment Questions
                </h3>
              </div>
              <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#64748b' }}>
                ID: {blueprint.blueprint_id.slice(0, 14)}...
              </span>
            </div>

            {/* Keyword Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
              {blueprint.keywords.map((kw, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: 'rgba(99, 102, 241, 0.12)',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    color: '#c7d2fe',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>

            {/* Question Previews */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
              {blueprint.questions.map((q, idx) => (
                <div
                  key={q.id}
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: 10,
                    padding: 14,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', fontFamily: "'JetBrains Mono', monospace" }}>
                      Q{idx + 1} · {q.competency.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 10, color: '#64748b' }}>
                      {q.target_seconds}s Target
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: '#f8fafc', fontWeight: 500, lineHeight: 1.4, marginBottom: 8 }}>
                    {q.text}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {q.assertions.slice(0, 2).map((a, aIdx) => (
                      <div key={aIdx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
                        <CheckCircle2 size={12} color="#10b981" />
                        <span>{a.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Primary Navigation CTA */}
      {blueprint && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: 14,
            padding: '18px 24px',
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#10b981', marginBottom: 2 }}>
              READY FOR STAGE 3
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
              Blueprint synthesized with {blueprint.questions.length} questions and binary assertion gates.
            </div>
          </div>

          <button
            type="button"
            onClick={handleProceed}
            className="btn-primary"
            style={{
              padding: '12px 24px',
              fontSize: 14,
              background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
              borderColor: 'rgba(255, 255, 255, 0.2)',
            }}
          >
            <span>Select Interviewer Persona</span>
            <ArrowRight size={16} />
          </button>
        </motion.div>
      )}
    </div>
  );
}
