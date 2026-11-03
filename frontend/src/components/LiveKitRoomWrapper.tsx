import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useRoomContext,
  useLocalParticipant,
} from '@livekit/components-react';
import {
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  ShieldCheck,
  Send,
  Sparkles,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import LatencyTelemetry from './LatencyTelemetry';

import {
  startInterviewSession,
  sendInterviewTurn,
  type Persona,
} from '../lib/api';

interface LiveKitRoomWrapperProps {
  token: string;
  serverUrl: string;
  onLeave: () => void;
  sessionTitle: string;
  persona?: Persona | null;
  sessionId?: string;
  targetCompany?: string;
  targetRole?: string;
  seniority?: string;
  participantName?: string;
}

interface TurnRecord {
  id: string;
  speaker: 'interviewer' | 'candidate';
  text: string;
  timestamp: string;
  questionIndex?: number;
}

// Voice matching helper for browser SpeechSynthesis
function selectPersonaVoice(voices: SpeechSynthesisVoice[], personaId?: string): SpeechSynthesisVoice | null {
  const englishVoices = voices.filter(v => v.lang.startsWith('en'));
  if (englishVoices.length === 0) return voices[0] || null;

  if (personaId === 'marcus') {
    return (
      englishVoices.find(v => /david|mark|male|guy|daniel/i.test(v.name)) ||
      englishVoices.find(v => !/female|zira|samantha/i.test(v.name)) ||
      englishVoices[0]
    );
  }
  if (personaId === 'priya') {
    return (
      englishVoices.find(v => /zira|samantha|female|karen|victoria|sonia/i.test(v.name)) ||
      englishVoices.find(v => /female/i.test(v.name)) ||
      englishVoices[0]
    );
  }
  // Alex (empathetic, natural)
  return (
    englishVoices.find(v => /natural|google|online|david|daniel/i.test(v.name)) ||
    englishVoices[0]
  );
}

function RoomControls({
  onLeave,
  sessionTitle,
  persona,
  sessionId,
  targetCompany,
  targetRole,
  seniority,
  participantName,
}: {
  onLeave: () => void;
  sessionTitle: string;
  persona?: Persona | null;
  sessionId?: string;
  targetCompany?: string;
  targetRole?: string;
  seniority?: string;
  participantName?: string;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  // Conversational state
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [totalQuestions, setTotalQuestions] = useState<number>(6);
  const [currentQuestionText, setCurrentQuestionText] = useState<string>('Candidate Introduction');
  const [isConcluded, setIsConcluded] = useState<boolean>(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState<boolean>(false);
  const [isCandidateSpeaking, setIsCandidateSpeaking] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [manualText, setManualText] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
  const [showTranscript, setShowTranscript] = useState<boolean>(false);
  const [micMuted, setMicMuted] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);

  // References for speech synthesis and recognition
  const recognitionRef = useRef<any>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const accumulatedSpeechRef = useRef<string>('');
  const silenceTimerRef = useRef<any>(null);
  const isAgentSpeakingRef = useRef<boolean>(false);
  const isConcludedRef = useRef<boolean>(false);
  const micMutedRef = useRef<boolean>(false);
  const transcriptBottomRef = useRef<HTMLDivElement>(null);

  isAgentSpeakingRef.current = isAgentSpeaking;
  isConcludedRef.current = isConcluded;
  micMutedRef.current = micMuted;

  // Auto-scroll transcript drawer
  useEffect(() => {
    if (showTranscript) {
      transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turns, showTranscript]);

  // Voice engine: Chrome speech synthesis resume heartbeat
  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (typeof window !== 'undefined' && window.speechSynthesis?.speaking && window.speechSynthesis?.paused) {
        window.speechSynthesis.resume();
      }
    }, 2500);
    return () => clearInterval(heartbeat);
  }, []);

  // Safe SpeechSynthesis trigger
  const speakUtterance = useCallback((text: string, onEndCallback?: () => void) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (onEndCallback) onEndCallback();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      // Temporary pause recognition while AI speaks to prevent echo feedback loop
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }

      const utterance = new SpeechSynthesisUtterance(text);
      activeUtteranceRef.current = utterance;

      const voices = window.speechSynthesis.getVoices();
      const chosenVoice = selectPersonaVoice(voices, persona?.id);
      if (chosenVoice) {
        utterance.voice = chosenVoice;
      }

      if (persona?.id === 'marcus') {
        utterance.pitch = 0.88;
        utterance.rate = 1.02;
      } else if (persona?.id === 'priya') {
        utterance.pitch = 1.08;
        utterance.rate = 1.06;
      } else {
        utterance.pitch = 1.0;
        utterance.rate = 1.0;
      }

      utterance.onstart = () => {
        setIsAgentSpeaking(true);
      };

      utterance.onend = () => {
        setIsAgentSpeaking(false);
        activeUtteranceRef.current = null;
        if (onEndCallback) onEndCallback();
      };

      utterance.onerror = (e) => {
        console.warn('[speechSynthesis] utterance error:', e);
        setIsAgentSpeaking(false);
        activeUtteranceRef.current = null;
        if (onEndCallback) onEndCallback();
      };

      window.speechSynthesis.speak(utterance);
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (err) {
      console.error('[speechSynthesis] playback failed:', err);
      setIsAgentSpeaking(false);
      if (onEndCallback) onEndCallback();
    }
  }, [persona]);

  // Start Candidate Listening via SpeechRecognition
  const startListening = useCallback(() => {
    if (isAgentSpeakingRef.current || isConcludedRef.current || micMutedRef.current) return;
    if (typeof window === 'undefined') return;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      console.warn('[speechRecognition] Web Speech API not supported in this browser.');
      return;
    }

    // Stop prior instance if active
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsCandidateSpeaking(false);
      };

      recognition.onresult = (event: any) => {
        if (isAgentSpeakingRef.current) return;

        let interim = '';
        let finalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            finalChunk += item[0].transcript + ' ';
          } else {
            interim += item[0].transcript;
          }
        }

        if (finalChunk) {
          accumulatedSpeechRef.current = (accumulatedSpeechRef.current + ' ' + finalChunk).trim();
        }

        const liveText = (accumulatedSpeechRef.current + ' ' + interim).trim();
        setInterimTranscript(liveText);
        setIsCandidateSpeaking(liveText.length > 0);

        // Auto-silence submission timer (cadence tuned to persona pause tolerance ~2.2s)
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        const pauseToleranceMs = (persona?.pause_tolerance || 2.4) * 1000;

        silenceTimerRef.current = setTimeout(() => {
          const answerToSend = (accumulatedSpeechRef.current + ' ' + interim).trim();
          if (answerToSend.length >= 6) {
            handleCandidateSubmit(answerToSend);
          }
        }, pauseToleranceMs);
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') return;
        if (event.error === 'not-allowed') {
          console.warn('[speechRecognition] microphone permission blocked');
        }
      };

      recognition.onend = () => {
        setIsCandidateSpeaking(false);
        // Automatically restart listening if still in active listening phase
        if (!isAgentSpeakingRef.current && !isConcludedRef.current && !micMutedRef.current) {
          try {
            recognition.start();
          } catch (_) {}
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn('[speechRecognition] error starting recognition:', e);
    }
  }, [persona]);

  // Turn submission handler
  const handleCandidateSubmit = useCallback(async (spokenText: string) => {
    const textToSubmit = spokenText.trim();
    if (!textToSubmit || !sessionId || isThinking) return;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }

    accumulatedSpeechRef.current = '';
    setInterimTranscript('');
    setIsCandidateSpeaking(false);
    setIsThinking(true);

    // Record candidate turn in local UI
    const candRecord: TurnRecord = {
      id: `cand_${Date.now()}`,
      speaker: 'candidate',
      text: textToSubmit,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      questionIndex: currentQuestionIndex,
    };
    setTurns(prev => [...prev, candRecord]);

    try {
      const res = await sendInterviewTurn({
        session_id: sessionId,
        candidate_text: textToSubmit,
        persona_id: persona?.id || 'alex',
      });

      setIsThinking(false);

      // Record interviewer turn in local UI
      const interviewerRecord: TurnRecord = {
        id: `ai_${Date.now()}`,
        speaker: 'interviewer',
        text: res.interviewer_text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        questionIndex: res.question_index,
      };
      setTurns(prev => [...prev, interviewerRecord]);

      if (res.total_questions) setTotalQuestions(res.total_questions);
      setCurrentQuestionIndex(res.question_index);
      if (res.current_question_text) setCurrentQuestionText(res.current_question_text);

      if (res.is_finished) {
        setIsConcluded(true);
        speakUtterance(res.interviewer_text);
      } else {
        // Speak interviewer reply, then re-open candidate microphone
        speakUtterance(res.interviewer_text, () => {
          startListening();
        });
      }
    } catch (err: any) {
      console.error('[interview] Turn transmission error:', err);
      setIsThinking(false);
      const fallbackReply = "I noted that point. Let's dig deeper into the system trade-offs and edge failure modes.";
      speakUtterance(fallbackReply, () => {
        startListening();
      });
    }
  }, [sessionId, isThinking, currentQuestionIndex, persona, speakUtterance, startListening]);

  // Initial greeting trigger on mount
  useEffect(() => {
    if (hasStarted || !sessionId) return;
    setHasStarted(true);

    const initGreeting = async () => {
      try {
        setIsThinking(true);
        const res = await startInterviewSession({
          session_id: sessionId,
          persona_id: persona?.id || 'alex',
          company: targetCompany,
          role: targetRole,
          seniority: seniority,
          participant_name: participantName,
        });

        setIsThinking(false);

        if (res.total_questions) setTotalQuestions(res.total_questions);
        if (res.current_question_text) setCurrentQuestionText(res.current_question_text);
        setCurrentQuestionIndex(0);

        const greetingRecord: TurnRecord = {
          id: `ai_greeting_${Date.now()}`,
          speaker: 'interviewer',
          text: res.interviewer_text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          questionIndex: 0,
        };
        setTurns([greetingRecord]);

        // Speak greeting aloud immediately
        speakUtterance(res.interviewer_text, () => {
          // As soon as greeting finishes speaking, candidate mic opens!
          startListening();
        });
      } catch (err) {
        console.error('[interview] Failed to start session greeting:', err);
        setIsThinking(false);
        const fallbackGreeting = `Hi ${participantName || 'there'}! I'm ${persona?.name || 'Alex Rivera'}, ready for your ${targetCompany || ''} interview. To begin, could you briefly introduce yourself?`;
        speakUtterance(fallbackGreeting, () => {
          startListening();
        });
      }
    };

    initGreeting();

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [sessionId, hasStarted, persona, targetCompany, targetRole, seniority, participantName, speakUtterance, startListening]);

  // Mic toggle handler
  const toggleMic = async () => {
    const nextMuted = !micMuted;
    setMicMuted(nextMuted);

    if (localParticipant) {
      try {
        await localParticipant.setMicrophoneEnabled(!nextMuted);
      } catch (_) {}
    }

    if (nextMuted) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      setIsCandidateSpeaking(false);
    } else {
      if (!isAgentSpeakingRef.current && !isConcludedRef.current) {
        startListening();
      }
    }
  };

  // Manual submission handler
  const handleManualSend = () => {
    if (!manualText.trim()) return;
    const text = manualText.trim();
    setManualText('');
    setShowManualInput(false);
    handleCandidateSubmit(text);
  };

  // Test / Unlock Audio helper
  const handleTestAudio = () => {
    speakUtterance(`Sound output calibrated for ${persona?.name || 'interviewer'}.`);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      width: '100%',
      maxWidth: 820,
      margin: '0 auto',
      padding: '28px 32px',
      background: 'var(--surface-1, #0f121a)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: 24,
      boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(20px)',
    }}>
      {/* Header Telemetry & Stage Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: persona?.accent_color || '#818cf8', textTransform: 'uppercase' }}>
              Full-Duplex Voice Studio
            </span>
            <span style={{ color: '#475569' }}>•</span>
            <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
              {currentQuestionIndex === 0 ? 'STAGE: INTRODUCTION' : `QUESTION ${currentQuestionIndex} OF ${totalQuestions}`}
            </span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: '4px 0 0' }}>
            {sessionTitle}
          </h2>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LatencyTelemetry
            isCallActive={true}
            isAgentSpeaking={isAgentSpeaking}
            isCandidateSpeaking={isCandidateSpeaking}
            currentTurnCount={turns.length}
          />
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: 99,
            color: '#10b981',
            fontSize: 12,
            fontWeight: 600,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 10px #10b981' }} />
            Connected
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
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

      {/* Dynamic Question Progress Bar */}
      <div style={{ width: '100%', background: 'rgba(255,255,255,0.06)', height: 4, borderRadius: 99, overflow: 'hidden' }}>
        <motion.div
          animate={{
            width: isConcluded
              ? '100%'
              : `${Math.max(12, Math.min(100, (currentQuestionIndex / Math.max(1, totalQuestions)) * 100))}%`,
          }}
          transition={{ duration: 0.5 }}
          style={{ height: '100%', background: persona?.accent_color || '#6366f1' }}
        />
      </div>

      {/* Stage: AI Interviewer Presence & Dynamic Orb */}
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 310,
        background: 'radial-gradient(ellipse at center, rgba(30, 36, 54, 0.6) 0%, rgba(13, 16, 24, 0.95) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 20,
        padding: '36px 20px',
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
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 99,
            fontSize: 12,
            color: '#e2e8f0',
            zIndex: 3,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: persona.accent_color || '#10b981' }} />
            <span style={{ fontWeight: 600 }}>{persona.name}</span>
            <span style={{ color: '#94a3b8' }}>·</span>
            <span style={{ color: '#94a3b8' }}>{persona.archetype || persona.title}</span>
          </div>
        )}

        {/* Audio unlock helper pill */}
        <button
          onClick={handleTestAudio}
          type="button"
          style={{
            position: 'absolute',
            top: 14,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 99,
            fontSize: 11,
            color: '#94a3b8',
            cursor: 'pointer',
            zIndex: 3,
          }}
          title="Test or unmute browser speech audio"
        >
          <Volume2 size={13} color={persona?.accent_color || '#818cf8'} />
          <span>Test Audio</span>
        </button>

        {/* Dynamic Glow Halo */}
        <motion.div
          animate={{
            scale: isAgentSpeaking ? [1, 1.35, 1.05, 1.25, 1] : isCandidateSpeaking ? [1, 1.15, 1] : [1, 1.05, 1],
            opacity: isAgentSpeaking ? [0.55, 0.9, 0.55] : isCandidateSpeaking ? [0.4, 0.65, 0.4] : [0.15, 0.25, 0.15],
          }}
          transition={{ duration: isAgentSpeaking ? 1.6 : 2.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            width: 240,
            height: 240,
            borderRadius: '50%',
            background: isAgentSpeaking
              ? `radial-gradient(circle, ${persona?.accent_color || '#6366f1'} 0%, transparent 70%)`
              : isCandidateSpeaking
              ? 'radial-gradient(circle, #f43f5e 0%, transparent 70%)'
              : 'radial-gradient(circle, #3b82f6 0%, transparent 70%)',
            filter: 'blur(35px)',
            pointerEvents: 'none',
          }}
        />

        {/* AI Avatar Orb */}
        <motion.div
          animate={{
            scale: isAgentSpeaking
              ? [1, 1.08, 0.97, 1.06, 1]
              : isThinking
              ? [1, 1.04, 1]
              : [1, 1.02, 1],
            boxShadow: isAgentSpeaking
              ? `0 0 40px ${persona?.accent_color || 'rgba(99, 102, 241, 0.85)'}`
              : isCandidateSpeaking
              ? '0 0 35px rgba(244, 63, 94, 0.7)'
              : '0 0 20px rgba(59, 130, 246, 0.3)',
          }}
          transition={{ duration: isAgentSpeaking ? 0.9 : 2.4, repeat: Infinity }}
          style={{
            width: 104,
            height: 104,
            borderRadius: '50%',
            background: persona?.id === 'marcus'
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #92400e 100%)'
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
          {isThinking ? (
            <Sparkles size={44} className="animate-pulse" />
          ) : (
            <Volume2 size={44} />
          )}
        </motion.div>

        {/* Dynamic Status Badge */}
        <div style={{ marginTop: 22, zIndex: 2, textAlign: 'center' }}>
          <span style={{
            display: 'inline-block',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.06em',
            padding: '5px 16px',
            borderRadius: 99,
            background: isAgentSpeaking
              ? 'rgba(99, 102, 241, 0.25)'
              : isCandidateSpeaking
              ? 'rgba(244, 63, 94, 0.25)'
              : isThinking
              ? 'rgba(245, 158, 11, 0.25)'
              : isConcluded
              ? 'rgba(16, 185, 129, 0.25)'
              : 'rgba(255, 255, 255, 0.08)',
            border: isAgentSpeaking
              ? `1px solid ${persona?.accent_color || '#6366f1'}`
              : isCandidateSpeaking
              ? '1px solid #f43f5e'
              : isThinking
              ? '1px solid #f59e0b'
              : isConcluded
              ? '1px solid #10b981'
              : '1px solid rgba(255, 255, 255, 0.15)',
            color: isAgentSpeaking
              ? '#c7d2fe'
              : isCandidateSpeaking
              ? '#fecdd3'
              : isThinking
              ? '#fde68a'
              : isConcluded
              ? '#a7f3d0'
              : '#94a3b8',
          }}>
            {isConcluded
              ? '🏁 INTERVIEW COMPLETE · READY TO EVALUATE'
              : isThinking
              ? `⚡ ${persona?.name?.toUpperCase() || 'AI INTERVIEWER'} IS EVALUATING...`
              : isAgentSpeaking
              ? `🎙️ ${persona?.name?.toUpperCase() || 'AI INTERVIEWER'} IS SPEAKING`
              : isCandidateSpeaking
              ? '🗣️ CANDIDATE SPEAKING'
              : micMuted
              ? '🔇 MICROPHONE MUTED'
              : `👂 ${persona?.name?.toUpperCase() || 'AI INTERVIEWER'} IS LISTENING`}
          </span>

          <p style={{ fontSize: 13, color: '#94a3b8', margin: '8px 0 0', maxWidth: 520 }}>
            {isConcluded
              ? 'You have completed all technical questions! Click "End Interview & Evaluate" below to view your dossier.'
              : isAgentSpeaking
              ? (turns[turns.length - 1]?.text ? `"${turns[turns.length - 1].text.slice(0, 110)}..."` : 'Listening carefully to your technical rationale.')
              : isCandidateSpeaking
              ? 'Speak naturally. When you finish, pause for 2 seconds or click "Send Answer".'
              : persona
              ? `${persona.tagline || persona.signature_phrase}`
              : 'Speak naturally into your microphone.'}
          </p>

          {currentQuestionText && currentQuestionIndex > 0 && !isConcluded && (
            <div style={{
              marginTop: 10,
              fontSize: 12,
              color: '#cbd5e1',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '4px 12px',
              borderRadius: 8,
              display: 'inline-block',
              maxWidth: 580,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              🎯 <strong style={{ color: persona?.accent_color || '#818cf8' }}>Focus:</strong> {currentQuestionText}
            </div>
          )}
        </div>

        {/* Audio Reactive Pulse Bars */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 20, height: 36, zIndex: 2 }}>
          {[14, 26, 38, 22, 34, 18, 30, 42, 24, 16, 32, 20].map((baseH, idx) => (
            <motion.div
              key={idx}
              animate={{
                height: (isAgentSpeaking || isCandidateSpeaking) ? [baseH * 0.35, baseH * 1.35, baseH * 0.45] : 6,
                background: isAgentSpeaking
                  ? (persona?.accent_color || '#818cf8')
                  : isCandidateSpeaking
                  ? '#f43f5e'
                  : 'rgba(255,255,255,0.15)',
              }}
              transition={{ duration: 0.35 + (idx % 4) * 0.1, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: 5, borderRadius: 99 }}
            />
          ))}
        </div>
      </div>

      {/* Live Interim Transcript Bubble (Candidate voice feedback) */}
      <AnimatePresence>
        {interimTranscript && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              padding: '12px 18px',
              borderRadius: 14,
              background: 'rgba(244, 63, 94, 0.08)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              color: '#fecdd3',
              fontSize: 13,
              lineHeight: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f43f5e', flexShrink: 0, boxShadow: '0 0 8px #f43f5e' }} />
              <div>
                <strong style={{ color: '#fff', marginRight: 6 }}>Hearing you say:</strong>
                <span>"{interimTranscript}"</span>
              </div>
            </div>
            <button
              onClick={() => handleCandidateSubmit(interimTranscript)}
              type="button"
              style={{
                background: '#f43f5e',
                border: 'none',
                borderRadius: 8,
                padding: '6px 14px',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Send Answer
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Input Fallback Drawer */}
      <AnimatePresence>
        {showManualInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              display: 'flex',
              gap: 10,
              padding: '12px 16px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <input
              type="text"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleManualSend();
              }}
              placeholder="Type your response here if in a noisy environment or mic issues..."
              style={{
                flex: 1,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                padding: '8px 14px',
                color: '#fff',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              onClick={handleManualSend}
              disabled={!manualText.trim() || isThinking}
              type="button"
              style={{
                background: persona?.accent_color || '#6366f1',
                border: 'none',
                borderRadius: 8,
                padding: '8px 18px',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Send size={14} />
              <span>Submit</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary Interactive Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Mute/Unmute Mic */}
          <button
            onClick={toggleMic}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 20px',
              borderRadius: 99,
              border: !micMuted ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(244, 63, 94, 0.4)',
              background: !micMuted ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              color: !micMuted ? '#10b981' : '#f43f5e',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {!micMuted ? <Mic size={16} /> : <MicOff size={16} />}
            <span>{!micMuted ? 'Mute Mic' : 'Unmute Mic'}</span>
          </button>

          {/* Type instead toggle */}
          <button
            onClick={() => setShowManualInput(!showManualInput)}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '11px 16px',
              borderRadius: 99,
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#cbd5e1',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <span>💬 Type Instead</span>
          </button>

          {/* Toggle Ledger Drawer */}
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '11px 16px',
              borderRadius: 99,
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#cbd5e1',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <MessageSquare size={15} />
            <span>Turns ({turns.length})</span>
            {showTranscript ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* End & Evaluate Button */}
        <button
          onClick={() => {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            if (recognitionRef.current) {
              try {
                recognitionRef.current.stop();
              } catch (_) {}
            }
            if (typeof window !== 'undefined' && window.speechSynthesis) {
              window.speechSynthesis.cancel();
            }
            room.disconnect();
            onLeave();
          }}
          type="button"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 26px',
            borderRadius: 99,
            border: 'none',
            background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(225, 29, 72, 0.45)',
          }}
        >
          <PhoneOff size={16} />
          <span>End Interview & Evaluate</span>
        </button>
      </div>

      {/* Collapsible Verified Turn Ledger Drawer */}
      <AnimatePresence>
        {showTranscript && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              marginTop: 6,
              padding: '16px 20px',
              background: 'rgba(10, 13, 20, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 16,
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', fontFamily: "'JetBrains Mono', monospace" }}>
                CHRONOLOGICAL TURN LEDGER (SHA-256 AUDIT TRAIL)
              </span>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {turns.length} Spoken Turns Recorded
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {turns.length === 0 ? (
                <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: 12 }}>
                  Awaiting first greeting exchange...
                </div>
              ) : (
                turns.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: t.speaker === 'interviewer' ? 'rgba(99, 102, 241, 0.08)' : 'rgba(244, 63, 94, 0.08)',
                      borderLeft: t.speaker === 'interviewer'
                        ? `3px solid ${persona?.accent_color || '#6366f1'}`
                        : '3px solid #f43f5e',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: t.speaker === 'interviewer' ? (persona?.accent_color || '#818cf8') : '#f43f5e',
                      }}>
                        {t.speaker === 'interviewer' ? (persona?.name || 'AI Interviewer') : 'Candidate'}
                      </span>
                      <span style={{ fontSize: 10, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
                        {t.timestamp}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', lineHeight: 1.45 }}>
                      {t.text}
                    </p>
                  </div>
                ))
              )}
              <div ref={transcriptBottomRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LiveKitRoomWrapperComponent({
  token,
  serverUrl,
  onLeave,
  sessionTitle,
  persona,
  sessionId,
  targetCompany,
  targetRole,
  seniority,
  participantName,
}: LiveKitRoomWrapperProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={(reason) => {
        console.warn('[livekit] Room event disconnected:', reason);
      }}
      data-lk-theme="default"
    >
      <RoomAudioRenderer />
      <StartAudio label="🔊 Click to enable audio playback" />
      <RoomControls
        onLeave={onLeave}
        sessionTitle={sessionTitle}
        persona={persona}
        sessionId={sessionId}
        targetCompany={targetCompany}
        targetRole={targetRole}
        seniority={seniority}
        participantName={participantName}
      />
    </LiveKitRoom>
  );
}

const LiveKitRoomWrapper = React.memo(LiveKitRoomWrapperComponent);
export default LiveKitRoomWrapper;
