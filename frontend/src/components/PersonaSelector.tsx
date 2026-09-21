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
    badgeText: string;
    borderActive: string;
    icon: React.ReactNode;
  }
> = {
  alex: {
    avatarGlow: 'from-emerald-500 to-teal-400',
    badgeBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
    badgeText: 'Supportive & Mentoring',
    borderActive: 'border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.25)]',
    icon: <Sparkles className="w-4 h-4 text-emerald-400" />,
  },
  marcus: {
    avatarGlow: 'from-amber-500 to-orange-400',
    badgeBg: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
    badgeText: 'Rigorous & Skeptical',
    borderActive: 'border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.25)]',
    icon: <ShieldAlert className="w-4 h-4 text-amber-400" />,
  },
  priya: {
    avatarGlow: 'from-purple-500 to-indigo-400',
    badgeBg: 'bg-purple-500/15 border-purple-500/30 text-purple-400',
    badgeText: 'Elite Bar Raiser',
    borderActive: 'border-purple-500 shadow-[0_0_25px_rgba(139,92,246,0.25)]',
    icon: <Zap className="w-4 h-4 text-purple-400" />,
  },
};

export default function PersonaSelector({
  personas,
  selectedPersonaId,
  onSelectPersona,
}: PersonaSelectorProps) {
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-wider uppercase text-zinc-400 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            Select Your Calibrated Interviewer
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Choose an interviewer persona calibrated to the psychological pressure you want to inoculate against.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-[11px] text-zinc-300 self-start sm:self-auto">
          <Clock className="w-3 h-3 text-zinc-400" />
          <span>Realtime Voice Dynamics</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {personas.map((persona) => {
          const isSelected = persona.id === selectedPersonaId;
          const config = PERSONA_CONFIGS[persona.id] || {
            avatarGlow: 'from-blue-500 to-cyan-400',
            badgeBg: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
            badgeText: persona.archetype,
            borderActive: 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.25)]',
            icon: <Sparkles className="w-4 h-4 text-blue-400" />,
          };

          return (
            <motion.div
              key={persona.id}
              whileHover={{ y: -3, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onSelectPersona(persona.id)}
              className={`relative cursor-pointer rounded-2xl p-5 transition-all duration-300 flex flex-col justify-between backdrop-blur-xl border ${
                isSelected
                  ? `bg-zinc-900/90 ${config.borderActive}`
                  : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/60'
              }`}
            >
              {/* Selected Check Pill */}
              {isSelected && (
                <div className="absolute top-4 right-4 flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-white text-[11px] font-medium border border-white/20">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Selected</span>
                </div>
              )}

              <div>
                {/* Header: Avatar + Name + Title */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${config.avatarGlow} p-0.5 flex-shrink-0`}
                  >
                    <div className="w-full h-full rounded-[10px] bg-zinc-950 flex items-center justify-center font-bold text-white text-base">
                      {persona.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </div>
                  </div>
                  <div className="min-w-0 pr-16">
                    <h4 className="font-semibold text-white text-sm truncate flex items-center gap-1.5">
                      {persona.name}
                    </h4>
                    <p className="text-xs text-zinc-400 truncate">{persona.title}</p>
                  </div>
                </div>

                {/* Archetype Badge */}
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium border ${config.badgeBg}`}
                  >
                    {config.icon}
                    {config.badgeText}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 font-mono">
                    {persona.difficulty}
                  </span>
                </div>

                {/* Tagline */}
                <p className="text-xs text-zinc-300 leading-relaxed mb-4">
                  {persona.tagline}
                </p>

                {/* Persona Behavioral Traits */}
                <div className="space-y-1.5 mb-4">
                  {persona.traits.map((trait, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[11px] text-zinc-400">
                      <span className="w-1 h-1 rounded-full bg-zinc-600 mt-1.5 flex-shrink-0" />
                      <span className="leading-snug">{trait}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom Telemetry Info */}
              <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                <span className="flex items-center gap-1">
                  <HelpCircle className="w-3 h-3 text-zinc-500" />
                  Pause: {persona.pause_tolerance_seconds}s
                </span>
                <span className="text-right truncate max-w-[130px]" title={persona.probe_style}>
                  {persona.probe_style.split('&')[0]}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
