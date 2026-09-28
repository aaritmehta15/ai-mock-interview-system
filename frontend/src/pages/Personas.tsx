import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Mic,
  Volume2,
  VolumeX,
  ArrowRight,
  Sparkles,
  Check,
} from 'lucide-react';
import { useInterview } from '../context/InterviewContext';
import { getPersonas, type PersonaProfile } from '../lib/api';

const FALLBACK_PERSONAS: PersonaProfile[] = [
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

export default function Personas() {
  const {
    selectedPersonaId,
    setSelectedPersonaId,
    setSelectedPersona,
    targetCompany,
  } = useInterview();

  const navigate = useNavigate();

  const [personas, setPersonas] = useState<PersonaProfile[]>(FALLBACK_PERSONAS);
  const [auditioningId, setAuditioningId] = useState<string | null>(null);

  useEffect(() => {
    getPersonas()
      .then((data) => {
        if (data && data.length > 0) setPersonas(data);
      })
      .catch((err) => {
        console.warn('[personas] Failed to load personas from backend, using calibrated fallbacks:', err);
      });
  }, []);

  const handleSelect = (p: PersonaProfile) => {
    setSelectedPersonaId(p.id);
    setSelectedPersona(p);
  };

  const handleAudition = (persona: PersonaProfile) => {
    if (auditioningId === persona.id) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setAuditioningId(null);
      return;
    }

    setAuditioningId(persona.id);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        `Hello, I'm ${persona.name}. ${persona.signature_phrase}`
      );
      utterance.rate = persona.id === 'priya' ? 1.15 : persona.id === 'marcus' ? 0.95 : 1.0;
      utterance.pitch = persona.id === 'alex' ? 1.05 : persona.id === 'marcus' ? 0.85 : 1.1;
      utterance.onend = () => setAuditioningId(null);
      utterance.onerror = () => setAuditioningId(null);
      window.speechSynthesis.speak(utterance);
    } else {
      // simulate preview timeout
      setTimeout(() => setAuditioningId(null), 3500);
    }
  };

  const handleProceed = () => {
    const selected = personas.find((p) => p.id === selectedPersonaId) || personas[0];
    setSelectedPersona(selected);
    navigate('/interview');
  };

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px' }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="status-pill status-pill-purple">
            <Sparkles size={12} />
            STAGE 3 OF 5 · INTERVIEWER SHOWROOM
          </span>
          <span style={{ fontSize: 12, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
            CALIBRATING FOR {targetCompany.toUpperCase()}
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
          Select Your Interviewer Persona
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14, maxWidth: 680 }}>
          Each persona implements a distinct cadence, cognitive pause tolerance, and interrogation philosophy. Audition their voice and choose your sparring partner.
        </p>
      </motion.div>

      {/* Persona Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 36 }}>
        {personas.map((p) => {
          const isSelected = selectedPersonaId === p.id;
          const isAuditioning = auditioningId === p.id;

          return (
            <div
              key={p.id}
              onClick={() => handleSelect(p)}
              className={`studio-card ${isSelected ? 'studio-card-glow' : ''}`}
              style={{
                padding: 24,
                cursor: 'pointer',
                border: isSelected ? `2px solid ${p.accent_color}` : '1px solid rgba(255, 255, 255, 0.08)',
                background: isSelected ? 'rgba(18, 24, 38, 0.95)' : 'rgba(14, 17, 24, 0.75)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.2s ease',
              }}
            >
              <div>
                {/* Header & Badges */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: `${p.accent_color}18`,
                        border: `1px solid ${p.accent_color}40`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: p.accent_color,
                        boxShadow: `0 0 20px ${p.accent_color}25`,
                      }}
                    >
                      <Mic size={22} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 700, color: '#f8fafc', marginBottom: 2 }}>
                        {p.name}
                      </h3>
                      <span style={{ fontSize: 12, color: p.accent_color, fontWeight: 600 }}>
                        {p.title}
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: p.accent_color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#000',
                      }}
                    >
                      <Check size={16} strokeWidth={3} />
                    </div>
                  )}
                </div>

                {/* Signature Quote */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderLeft: `3px solid ${p.accent_color}`,
                    padding: '10px 14px',
                    borderRadius: '0 8px 8px 0',
                    marginBottom: 18,
                  }}
                >
                  <p style={{ fontSize: 12, color: '#cbd5e1', fontStyle: 'italic', lineHeight: 1.5 }}>
                    "{p.signature_phrase}"
                  </p>
                </div>

                {/* Technical Parameters */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      borderRadius: 8,
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>PAUSE TOLERANCE</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', fontFamily: "'JetBrains Mono', monospace" }}>
                      {p.pause_tolerance}s cadence
                    </div>
                  </div>
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      borderRadius: 8,
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>VOICE MODEL</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: p.accent_color, fontFamily: "'JetBrains Mono', monospace" }}>
                      {p.voice_model}
                    </div>
                  </div>
                </div>
              </div>

              {/* Audition Trigger */}
              <div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAudition(p);
                  }}
                  className="btn-secondary"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: isAuditioning ? `${p.accent_color}25` : undefined,
                    borderColor: isAuditioning ? p.accent_color : undefined,
                    color: isAuditioning ? p.accent_color : undefined,
                  }}
                >
                  {isAuditioning ? (
                    <>
                      <VolumeX size={14} />
                      <span>Stop Audition</span>
                    </>
                  ) : (
                    <>
                      <Volume2 size={14} />
                      <span>Audition Voice Sample</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Persona Summary & Proceed CTA */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(139, 92, 246, 0.08)',
          border: '1px solid rgba(139, 92, 246, 0.25)',
          borderRadius: 14,
          padding: '18px 24px',
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#a78bfa', marginBottom: 2 }}>
            INTERVIEWER LOCKED IN
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
            {personas.find((p) => p.id === selectedPersonaId)?.name || 'Alex Rivera'} (
            {personas.find((p) => p.id === selectedPersonaId)?.title})
          </div>
        </div>

        <button
          type="button"
          onClick={handleProceed}
          className="btn-primary"
          style={{
            padding: '12px 24px',
            fontSize: 14,
            background: 'linear-gradient(180deg, #8b5cf6 0%, #7c3aed 100%)',
          }}
        >
          <span>Enter Live Sound Studio</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
