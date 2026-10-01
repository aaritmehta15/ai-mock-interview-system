import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Mic,
  PhoneOff,
  Activity,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useInterview } from '../context/InterviewContext';
import {
  getLiveKitToken,
  evaluateSession,
  createBlueprint,
  type PersonaProfile,
} from '../lib/api';
import LiveKitRoomWrapper from '../components/LiveKitRoomWrapper';

const DEFAULT_PERSONA: PersonaProfile = {
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
};

export default function Interview() {
  const { user } = useAuth();
  const {
    sessionId,
    targetCompany,
    targetRole,
    seniority,
    blueprint,
    setBlueprint,
    selectedPersonaId,
    selectedPersona,
    setLatestReport,
    startFreshSession,
  } = useInterview();

  const navigate = useNavigate();

  const [liveKitToken, setLiveKitToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string>(sessionId);

  const persona: PersonaProfile = selectedPersona || {
    ...DEFAULT_PERSONA,
    id: selectedPersonaId || 'alex',
  };

  const handleStartVoiceSession = async () => {
    setIsConnecting(true);
    setConnectionError(null);

    // ALWAYS generate a fresh session ID for each interview attempt so old turns and marks never leak
    const activeSessionId = startFreshSession();
    activeSessionIdRef.current = activeSessionId;

    try {
      // 1. Ensure blueprint exists
      let currentBp = blueprint;
      if (!currentBp) {
        currentBp = await createBlueprint({
          company: targetCompany || 'Google',
          role: targetRole || 'Staff Distributed Systems Engineer',
          seniority: seniority || 'Staff',
          session_id: activeSessionId,
          persona_id: persona.id,
        });
        setBlueprint(currentBp);
      }

      // 2. Obtain WebRTC Access Token for activeSessionId
      const participantName = user?.displayName || 'Staff Candidate';
      const tokenRes = await getLiveKitToken({
        room_name: activeSessionId,
        participant_name: participantName,
        identity: `cand_${activeSessionId.slice(-6)}`,
        persona_id: persona.id,
        company: targetCompany || (currentBp?.company ?? 'Google'),
        role: targetRole || (currentBp?.role ?? 'Staff Distributed Systems Engineer'),
      });

      setLiveKitToken(tokenRes.token);
      setServerUrl(tokenRes.server_url || 'wss://ai-mock-interviewer-srea4si2.livekit.cloud');
    } catch (err: any) {
      console.error('[interview] Failed to connect to voice chamber:', err);
      setConnectionError(
        err.response?.data?.detail ||
          'Failed to initialize LiveKit WebRTC session. Please check backend status and credentials.'
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleEndInterview = async () => {
    setLiveKitToken(null);
    setIsEvaluating(true);
    const targetSessionId = activeSessionIdRef.current || sessionId;

    try {
      const report = await evaluateSession(targetSessionId);
      setLatestReport(report);
      navigate(`/evaluation/${targetSessionId}`);
    } catch (err: any) {
      console.error('[interview] Evaluation generation failed:', err);
      navigate(`/evaluation/${targetSessionId}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  if (isEvaluating) {
    return (
      <div
        style={{
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <Loader2 size={36} className="animate-spin" color="#6366f1" />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>
          Auditing Spoken Turns & Synthesizing Executive Dossier...
        </h2>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>
          Evaluating binary assertions against SQLite Turn Ledger (SHA-256 protected).
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '36px 24px' }}>
      {/* Header Bar */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="status-pill status-pill-amber">
            <Activity size={12} />
            STAGE 4 OF 5 · FULL-DUPLEX SOUND STUDIO
          </span>
          <span style={{ fontSize: 12, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
            SESSION: {sessionId.slice(0, 16)}...
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 800,
                fontFamily: "'Space Grotesk', sans-serif",
                letterSpacing: '-0.025em',
                marginBottom: 4,
              }}
            >
              {targetCompany} · {targetRole}
            </h1>
            <p style={{ color: '#94a3b8', fontSize: 13 }}>
              Sparring with <strong style={{ color: persona.accent_color }}>{persona.name}</strong> ({persona.title})
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {liveKitToken && (
              <button
                type="button"
                onClick={handleEndInterview}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: 'rgba(244, 63, 94, 0.15)',
                  border: '1px solid rgba(244, 63, 94, 0.4)',
                  color: '#f43f5e',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <PhoneOff size={14} />
                <span>End & Evaluate Session</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Main Sound Stage */}
      {liveKitToken ? (
        <div style={{ width: '100%' }}>
          <LiveKitRoomWrapper
            token={liveKitToken}
            serverUrl={serverUrl}
            sessionTitle={`${targetCompany} ${seniority} Voice Interview`}
            onLeave={handleEndInterview}
            persona={{
              ...persona,
              archetype: persona.difficulty,
              badge_label: persona.title,
              tagline: persona.signature_phrase,
              pause_tolerance_seconds: persona.pause_tolerance,
              thinking_pause_seconds: persona.thinking_delay,
              probe_style: 'Calibrated Socratic Assessment',
              traits: [persona.signature_phrase],
            }}
          />
        </div>
      ) : (
        /* Pre-Flight Chamber Card */
        <div
          className="studio-card"
          style={{
            padding: 40,
            background: 'rgba(14, 18, 28, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: `${persona.accent_color}18`,
              border: `2px solid ${persona.accent_color}40`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: persona.accent_color,
              boxShadow: `0 0 30px ${persona.accent_color}30`,
              marginBottom: 20,
            }}
          >
            <Mic size={32} />
          </div>

          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
            Ready to Enter the Technical Voice Chamber
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 14, maxWidth: 540, margin: '0 auto 24px', lineHeight: 1.6 }}>
            {persona.name} will greet you autonomously when your microphone connects. Speak naturally. All turns are preserved in the append-only ledger.
          </p>

          {connectionError && (
            <div
              style={{
                maxWidth: 480,
                margin: '0 auto 20px',
                padding: '10px 14px',
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                borderRadius: 8,
                fontSize: 12,
                color: '#f43f5e',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertTriangle size={16} />
              <span>{connectionError}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
            <button
              type="button"
              onClick={() => navigate('/personas')}
              className="btn-secondary"
              style={{ padding: '12px 20px', fontSize: 13 }}
            >
              Switch Persona
            </button>
            <button
              type="button"
              onClick={handleStartVoiceSession}
              disabled={isConnecting}
              className="btn-primary"
              style={{
                padding: '12px 28px',
                fontSize: 14,
                background: `linear-gradient(180deg, ${persona.accent_color} 0%, #4338ca 100%)`,
                borderColor: 'rgba(255, 255, 255, 0.2)',
              }}
            >
              {isConnecting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Connecting to LiveKit Cloud...</span>
                </>
              ) : (
                <>
                  <Mic size={16} />
                  <span>Launch Live Sound Studio</span>
                </>
              )}
            </button>
          </div>

          {/* System Specs Footer */}
          <div
            style={{
              marginTop: 36,
              paddingTop: 20,
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              justifyContent: 'center',
              gap: 24,
              fontSize: 11,
              color: '#64748b',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <span>LIVEKIT WEBRTC FULL-DUPLEX</span>
            <span>•</span>
            <span>PAUSE CADENCE: {persona.pause_tolerance}s</span>
            <span>•</span>
            <span>AUTONOMOUS GREETING</span>
          </div>
        </div>
      )}
    </div>
  );
}
