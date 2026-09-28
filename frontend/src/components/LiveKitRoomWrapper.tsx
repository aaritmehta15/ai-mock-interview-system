import { useState, useEffect } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
  useLocalParticipant,
  useRemoteParticipants,
} from '@livekit/components-react';
import { Mic, MicOff, PhoneOff, Volume2, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import LatencyTelemetry from './LatencyTelemetry';

import type { Persona } from '../lib/api';

interface LiveKitRoomWrapperProps {
  token: string;
  serverUrl: string;
  onLeave: () => void;
  sessionTitle: string;
  persona?: Persona | null;
}

function RoomControls({
  onLeave,
  sessionTitle,
  persona,
}: {
  onLeave: () => void;
  sessionTitle: string;
  persona?: Persona | null;
}) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);

  useEffect(() => {
    if (!localParticipant) return;
    const interval = setInterval(() => {
      setIsSpeaking(localParticipant.isSpeaking);
      const agent = remoteParticipants.find(p => p.identity.includes('agent') || p.identity.includes('interviewer') || true);
      if (agent) {
        setAgentSpeaking(agent.isSpeaking);
      }
    }, 150);
    return () => clearInterval(interval);
  }, [localParticipant, remoteParticipants]);

  const toggleMic = async () => {
    if (localParticipant) {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      width: '100%',
      maxWidth: 780,
      margin: '0 auto',
      padding: 32,
      background: 'var(--surface-1, #12141a)',
      border: '1px solid var(--border, #2a2e39)',
      borderRadius: 20,
      boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
    }}>
      {/* Header telemetry & status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-3, #7a8290)', textTransform: 'uppercase' }}>
            Live WebRTC Session
          </span>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1, #f0f2f5)', margin: '4px 0 0' }}>
            {sessionTitle}
          </h2>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LatencyTelemetry
            isCallActive={true}
            isAgentSpeaking={agentSpeaking}
            isCandidateSpeaking={isSpeaking}
          />
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 99,
            color: '#10b981',
            fontSize: 12,
            fontWeight: 600,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 8px #10b981' }} />
            Connected
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: 99,
            color: '#818cf8',
            fontSize: 12,
            fontWeight: 600,
          }}>
            <ShieldCheck size={14} />
            Ledger Active
          </div>
        </div>
      </div>

      {/* Stage: AI Interviewer Presence & Waveform */}
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 280,
        background: 'linear-gradient(180deg, rgba(20, 24, 35, 0.8) 0%, rgba(15, 18, 26, 0.95) 100%)',
        border: '1px solid var(--border, #2a2e39)',
        borderRadius: 16,
        padding: '32px 16px',
        overflow: 'hidden',
      }}>
        {/* Active Interviewer Persona Card */}
        {persona && (
          <div style={{
            position: 'absolute',
            top: 14,
            left: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 12px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 99,
            fontSize: 12,
            color: '#e2e8f0',
            zIndex: 3,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: persona.accent_color || '#10b981' }} />
            <span style={{ fontWeight: 600 }}>{persona.name}</span>
            <span style={{ color: '#94a3b8' }}>·</span>
            <span style={{ color: '#94a3b8' }}>{persona.archetype}</span>
          </div>
        )}

        {/* Glow halo */}
        <motion.div
          animate={{
            scale: agentSpeaking ? [1, 1.25, 1] : [1, 1.05, 1],
            opacity: agentSpeaking ? [0.6, 0.9, 0.6] : [0.2, 0.3, 0.2],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            width: 220,
            height: 220,
            borderRadius: '50%',
            background: agentSpeaking
              ? `radial-gradient(circle, ${persona?.accent_color || '#6366f1'} 0%, transparent 70%)`
              : 'radial-gradient(circle, #3b82f6 0%, transparent 70%)',
            filter: 'blur(30px)',
            pointerEvents: 'none',
          }}
        />

        {/* AI Avatar Orb */}
        <motion.div
          animate={{
            scale: agentSpeaking ? [1, 1.08, 0.98, 1.04, 1] : [1, 1.02, 1],
            boxShadow: agentSpeaking
              ? `0 0 35px ${persona?.accent_color || 'rgba(99, 102, 241, 0.8)'}`
              : '0 0 20px rgba(59, 130, 246, 0.4)',
          }}
          transition={{ duration: agentSpeaking ? 0.8 : 2.5, repeat: Infinity }}
          style={{
            width: 96,
            height: 96,
            borderRadius: '50%',
            background: persona?.id === 'marcus'
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)'
              : persona?.id === 'priya'
              ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 50%, #4338ca 100%)'
              : 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            zIndex: 2,
          }}
        >
          <Volume2 size={40} />
        </motion.div>

        {/* Dynamic status badge */}
        <div style={{ marginTop: 20, zIndex: 2, textAlign: 'center' }}>
          <span style={{
            display: 'inline-block',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.05em',
            padding: '4px 14px',
            borderRadius: 99,
            background: agentSpeaking ? 'rgba(99, 102, 241, 0.2)' : isSpeaking ? 'rgba(244, 63, 94, 0.2)' : 'rgba(255, 255, 255, 0.05)',
            border: agentSpeaking ? '1px solid #6366f1' : isSpeaking ? '1px solid #f43f5e' : '1px solid rgba(255, 255, 255, 0.1)',
            color: agentSpeaking ? '#a5b4fc' : isSpeaking ? '#fda4af' : 'var(--text-2, #a0aec0)',
          }}>
            {agentSpeaking
              ? `🎙️ ${persona?.name?.toUpperCase() || 'APEX INTERVIEWER'} IS SPEAKING`
              : isSpeaking
              ? '🗣️ CANDIDATE SPEAKING'
              : `👂 ${persona?.name?.toUpperCase() || 'APEX INTERVIEWER'} IS LISTENING`}
          </span>
          <p style={{ fontSize: 13, color: 'var(--text-3, #7a8290)', margin: '8px 0 0' }}>
            {persona
              ? `${persona.tagline}`
              : 'Speak naturally. When you finish, pause for 1-2 seconds to respond.'}
          </p>
        </div>

        {/* Audio reactive pulse bars */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 24, height: 36, zIndex: 2 }}>
          {[12, 24, 36, 20, 32, 16, 28, 40, 22, 14, 30, 18].map((baseH, idx) => (
            <motion.div
              key={idx}
              animate={{
                height: (agentSpeaking || isSpeaking) ? [baseH * 0.4, baseH * 1.3, baseH * 0.5] : 6,
                background: agentSpeaking ? (persona?.accent_color || '#818cf8') : isSpeaking ? '#f43f5e' : '#334155',
              }}
              transition={{ duration: 0.4 + (idx % 4) * 0.1, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: 5, borderRadius: 99 }}
            />
          ))}
        </div>
      </div>

      {/* Interactive Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        <button
          onClick={toggleMic}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            borderRadius: 99,
            border: isMicrophoneEnabled ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(244, 63, 94, 0.4)',
            background: isMicrophoneEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
            color: isMicrophoneEnabled ? '#10b981' : '#f43f5e',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          {isMicrophoneEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
        </button>

        <button
          onClick={() => {
            room.disconnect();
            onLeave();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 28px',
            borderRadius: 99,
            border: 'none',
            background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(225, 29, 72, 0.4)',
          }}
        >
          <PhoneOff size={18} />
          End Interview & Evaluate
        </button>
      </div>
    </div>
  );
}

export default function LiveKitRoomWrapper({
  token,
  serverUrl,
  onLeave,
  sessionTitle,
  persona,
}: LiveKitRoomWrapperProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={onLeave}
      data-lk-theme="default"
    >
      <RoomAudioRenderer />
      <RoomControls onLeave={onLeave} sessionTitle={sessionTitle} persona={persona} />
    </LiveKitRoom>
  );
}
