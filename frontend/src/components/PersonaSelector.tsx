import React from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  ShieldAlert,
  Zap,
  CheckCircle2,
  Clock,
  HelpCircle,
  TrendingUp,
} from 'lucide-react';
import type { Persona } from '../lib/api';

interface PersonaSelectorProps {
  personas: Persona[];
  selectedPersonaId: string;
  onSelectPersona: (personaId: string) => void;
}

const PERSONA_CONFIGS: Record<
  string,
  {
    avatarGlow: string;
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
    accentColor: string;
    borderActive: string;
    icon: React.ReactNode;
  }
> = {
  alex: {
    avatarGlow: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    badgeBg: 'rgba(16, 185, 129, 0.12)',
    badgeBorder: 'rgba(16, 185, 129, 0.3)',
    badgeText: '#10b981',
    accentColor: '#10b981',
    borderActive: 'rgba(16, 185, 129, 0.6)',
    icon: <Sparkles size={14} color="#10b981" />,
  },
  marcus: {
    avatarGlow: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    badgeBg: 'rgba(245, 158, 11, 0.12)',
    badgeBorder: 'rgba(245, 158, 11, 0.3)',
    badgeText: '#f59e0b',
    accentColor: '#f59e0b',
    borderActive: 'rgba(245, 158, 11, 0.6)',
    icon: <ShieldAlert size={14} color="#f59e0b" />,
  },
  priya: {
    avatarGlow: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
    badgeBg: 'rgba(139, 92, 246, 0.12)',
    badgeBorder: 'rgba(139, 92, 246, 0.3)',
    badgeText: '#a78bfa',
    accentColor: '#8b5cf6',
    borderActive: 'rgba(139, 92, 246, 0.6)',
    icon: <Zap size={14} color="#a78bfa" />,
  },
};

export default function PersonaSelector({
  personas,
  selectedPersonaId,
  onSelectPersona,
}: PersonaSelectorProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} color="#818cf8" />
            <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8', margin: 0 }}>
              Calibrated Interviewer Personas
            </h3>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Choose an interviewer calibrated to the exact conversational psychology and pushback you want to inoculate against.
          </p>
        </div>
        <div className="status-pill status-pill-cyan">
          <Clock size={12} />
          <span>Realtime Voice Dynamics</span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {personas.map((persona) => {
          const isSelected = persona.id === selectedPersonaId;
          const config = PERSONA_CONFIGS[persona.id] || {
            avatarGlow: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            badgeBg: 'rgba(59, 130, 246, 0.12)',
            badgeBorder: 'rgba(59, 130, 246, 0.3)',
            badgeText: '#60a5fa',
            accentColor: '#3b82f6',
            borderActive: 'rgba(59, 130, 246, 0.6)',
            icon: <Sparkles size={14} color="#60a5fa" />,
          };

          return (
            <motion.div
              key={persona.id}
              whileHover={{ y: -2, transition: { duration: 0.15 } }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onSelectPersona(persona.id)}
              style={{
                position: 'relative',
                cursor: 'pointer',
                borderRadius: 16,
                padding: 22,
                background: isSelected ? 'rgba(18, 22, 32, 0.95)' : 'rgba(14, 17, 24, 0.6)',
                border: isSelected
                  ? `1.5px solid ${config.borderActive}`
                  : '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: isSelected
                  ? `0 0 25px ${config.badgeBg}`
                  : '0 4px 16px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Selected Check Indicator */}
              {isSelected && (
                <div
                  style={{
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 99,
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#f8fafc',
                  }}
                >
                  <CheckCircle2 size={12} color="#10b981" />
                  <span>Selected</span>
                </div>
              )}

              <div>
                {/* Header: Avatar + Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: config.avatarGlow,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      color: '#fff',
                      fontSize: 16,
                      boxShadow: `0 0 14px ${config.badgeBg}`,
                      flexShrink: 0,
                    }}
                  >
                    {persona.name
                      .split(' ')
                      .map((n: string) => n[0])
                      .join('')}
                  </div>
                  <div style={{ minWidth: 0, paddingRight: isSelected ? 80 : 0 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {persona.name}
                    </h4>
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {persona.title}
                    </p>
                  </div>
                </div>

                {/* Archetype & Difficulty Badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      background: config.badgeBg,
                      border: `1px solid ${config.badgeBorder}`,
                      color: config.badgeText,
                    }}
                  >
                    {config.icon}
                    {persona.archetype}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "'JetBrains Mono', monospace",
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#cbd5e1',
                    }}
                  >
                    {persona.difficulty}
                  </span>
                </div>

                {/* Tagline */}
                <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 14 }}>
                  {persona.tagline}
                </p>

                {/* Behavioral Traits */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {persona.traits?.map((trait: string, idx: number) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#94a3b8' }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#64748b', marginTop: 7, flexShrink: 0 }} />
                      <span style={{ lineHeight: 1.4 }}>{trait}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom Telemetry Footer */}
              <div
                style={{
                  paddingTop: 12,
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#64748b',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <HelpCircle size={12} color="#64748b" />
                  Pause: {persona.pause_tolerance_seconds ?? persona.pause_tolerance ?? 3}s
                </span>
                <span style={{ color: '#94a3b8' }}>
                  {(persona.probe_style || 'Socratic Assessment').split('&')[0].trim()}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
