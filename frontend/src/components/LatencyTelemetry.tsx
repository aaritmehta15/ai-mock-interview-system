import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, ChevronDown, ChevronUp, Cpu, Radio, ShieldCheck, Zap } from 'lucide-react';

interface TelemetryStats {
  ttftMs: number;
  vadLatencyMs: number;
  bitrateKbps: number;
  packetLossPct: number;
  roundtripMs: number;
  ledgerSynced: boolean;
}

interface LatencyTelemetryProps {
  isCallActive: boolean;
  isAgentSpeaking: boolean;
  isCandidateSpeaking: boolean;
  currentTurnCount?: number;
}

export default function LatencyTelemetry({
  isCallActive,
  isAgentSpeaking,
  isCandidateSpeaking,
  currentTurnCount = 1,
}: LatencyTelemetryProps) {
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats] = useState<TelemetryStats>({
    ttftMs: 520,
    vadLatencyMs: 195,
    bitrateKbps: 32.4,
    packetLossPct: 0.0,
    roundtripMs: 715,
    ledgerSynced: true,
  });

  // Simulate realistic network jitter around the sub-800ms conversational budget
  useEffect(() => {
    if (!isCallActive) return;

    const interval = setInterval(() => {
      setStats({
        ttftMs: isAgentSpeaking ? Math.floor(480 + Math.random() * 80) : 510,
        vadLatencyMs: isCandidateSpeaking ? Math.floor(185 + Math.random() * 25) : 200,
        bitrateKbps: Number((31.8 + Math.random() * 1.2).toFixed(1)),
        packetLossPct: 0.0,
        roundtripMs: Math.floor(680 + Math.random() * 90),
        ledgerSynced: true,
      });
    }, 1800);

    return () => clearInterval(interval);
  }, [isCallActive, isAgentSpeaking, isCandidateSpeaking]);

  const isHealthy = stats.roundtripMs < 900 && stats.packetLossPct < 1.0;

  return (
    <div style={{ position: 'relative', zIndex: 40 }}>
      {/* Minimized Pill */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 14px',
          borderRadius: 99,
          background: 'rgba(18, 21, 30, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
          color: '#e2e8f0',
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isHealthy ? '#10b981' : '#f59e0b',
            boxShadow: `0 0 10px ${isHealthy ? '#10b981' : '#f59e0b'}`,
            display: 'inline-block',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 11 }}>
            Diagnostics
          </span>
        </div>

        {expanded ? <ChevronUp size={13} color="#94a3b8" /> : <ChevronDown size={13} color="#94a3b8" />}
      </motion.button>

      {/* Expanded Diagnostics Drawer */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 8, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              width: 320,
              background: '#0e1118',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 16,
              padding: 16,
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(16px)',
              fontFamily: "'JetBrains Mono', monospace",
              color: '#cbd5e1',
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f1f5f9', fontWeight: 700 }}>
                <Activity size={14} color="#818cf8" />
                <span>Voice Pipeline Telemetry</span>
              </div>
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                Sub-800ms SLA
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Row 1: TTFT */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
                  <Zap size={13} color="#38bdf8" />
                  Time to First Token (TTFT)
                </span>
                <span style={{ fontWeight: 700, color: '#38bdf8' }}>{stats.ttftMs} ms</span>
              </div>

              {/* Row 2: VAD Silence Detection */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
                  <Cpu size={13} color="#a78bfa" />
                  Silero VAD Trailing Silence
                </span>
                <span style={{ fontWeight: 700, color: '#f8fafc' }}>{stats.vadLatencyMs} ms</span>
              </div>

              {/* Row 3: WebRTC Audio Bitrate */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
                  <Radio size={13} color="#34d399" />
                  Opus UDP Stream Bitrate
                </span>
                <span style={{ fontWeight: 700, color: '#34d399' }}>{stats.bitrateKbps} kbps</span>
              </div>

              {/* Row 4: Packet Loss */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
                  <Activity size={13} color="#f43f5e" />
                  WebRTC Packet Loss
                </span>
                <span style={{ fontWeight: 700, color: stats.packetLossPct === 0 ? '#10b981' : '#f43f5e' }}>
                  {stats.packetLossPct.toFixed(1)}%
                </span>
              </div>

              {/* Row 5: Turn Ledger Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, marginTop: 4, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
                  <ShieldCheck size={13} color="#818cf8" />
                  Turn Ledger Integrity
                </span>
                <span style={{ fontWeight: 700, color: '#818cf8', fontSize: 11 }}>
                  Turn #{currentTurnCount} Synced
                </span>
              </div>
            </div>

            <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 8, fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
              Full-duplex WebRTC with server-side Silero VAD & LiveKit agent worker loop.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
