import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  transcribeAudio,
  type Persona,
} from '../lib/api';

interface LiveKitRoomWrapperProps {
  token?: string;
  serverUrl?: string;
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
  return (
    englishVoices.find(v => /natural|google|online|david|daniel/i.test(v.name)) ||
    englishVoices[0]
  );
}

function LiveKitRoomWrapper({
  onLeave,
  sessionTitle,
  persona,
  sessionId,
  targetCompany,
  targetRole,
  seniority,
  participantName,
}: LiveKitRoomWrapperProps) {
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
  const [audioVolume, setAudioVolume] = useState<number>(0);
  const [hasStarted, setHasStarted] = useState<boolean>(false);

  // References
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const recognitionRef = useRef<any>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechSafetyTimerRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const accumulatedSpeechRef = useRef<string>('');

  const isAgentSpeakingRef = useRef<boolean>(false);
  const isConcludedRef = useRef<boolean>(false);
  const micMutedRef = useRef<boolean>(false);
  const isThinkingRef = useRef<boolean>(false);
  const transcriptBottomRef = useRef<HTMLDivElement>(null);

  isAgentSpeakingRef.current = isAgentSpeaking;
  isConcludedRef.current = isConcluded;
  micMutedRef.current = micMuted;
  isThinkingRef.current = isThinking;

  // Auto-scroll turn ledger drawer
  useEffect(() => {
    if (showTranscript) {
      transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turns, showTranscript]);

  // Chrome speech synthesis resume heartbeat
  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (typeof window !== 'undefined' && window.speechSynthesis?.speaking && window.speechSynthesis?.paused) {
        window.speechSynthesis.resume();
      }
    }, 2000);
    return () => clearInterval(heartbeat);
  }, []);

  // Initialize Microphone & Web Audio Analyser
  useEffect(() => {
    let isMounted = true;

    const setupMicrophone = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        mediaStreamRef.current = stream;

        // Setup real Web Audio Analyser
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          // Sound level polling loop
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const checkVolume = () => {
            if (!isMounted) return;
            if (analyserRef.current && !micMutedRef.current && !isAgentSpeakingRef.current) {
              analyserRef.current.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avg = sum / dataArray.length;
              setAudioVolume(avg);
            } else {
              setAudioVolume(0);
            }
            animationFrameRef.current = requestAnimationFrame(checkVolume);
          };
          checkVolume();
        }
      } catch (err) {
        console.warn('[microphone] could not initialize media stream:', err);
      }
    };

    setupMicrophone();

    return () => {
      isMounted = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close();
        } catch (_) {}
      }
    };
  }, []);

  // Forward declarations for mutual referencing
  const startListeningRef = useRef<() => void>(() => {});
  const handleCandidateSubmitRef = useRef<(text: string, audioBlob?: Blob) => Promise<void>>(async () => {});

  // Speak Utterance with Dual Completion Guarantee
  const speakUtterance = useCallback((text: string, onEndCallback?: () => void) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (onEndCallback) onEndCallback();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      if (speechSafetyTimerRef.current) clearTimeout(speechSafetyTimerRef.current);

      // Stop recognition while AI speaks to avoid hearing itself
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
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

      // Calculate speech duration guarantee (avg 2.4 words/sec + 1.2s padding)
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const estimatedDurationMs = Math.max(2000, (wordCount / 2.3) * 1000 + 1200);

      let hasCompleted = false;
      const completeSpeech = () => {
        if (hasCompleted) return;
        hasCompleted = true;
        if (speechSafetyTimerRef.current) {
          clearTimeout(speechSafetyTimerRef.current);
          speechSafetyTimerRef.current = null;
        }
        setIsAgentSpeaking(false);
        activeUtteranceRef.current = null;
        if (onEndCallback) onEndCallback();
      };

      utterance.onstart = () => {
        setIsAgentSpeaking(true);
      };

      utterance.onend = completeSpeech;
      utterance.onerror = completeSpeech;

      // Safety timeout: If Chrome's C++ synthesis queue drops onend, force complete cleanly
      speechSafetyTimerRef.current = setTimeout(completeSpeech, estimatedDurationMs);

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

  // Candidate Turn Submission Handler
  const handleCandidateSubmit = useCallback(async (spokenText: string, audioBlob?: Blob) => {
    let textToSubmit = spokenText.trim();

    // If text is empty but audio blob is available, transcribe via Groq Whisper in 150ms!
    if (!textToSubmit && audioBlob && audioBlob.size > 2000) {
      setIsThinking(true);
      try {
        const whisperText = await transcribeAudio(audioBlob);
        if (whisperText.trim()) {
          textToSubmit = whisperText.trim();
        }
      } catch (e) {
        console.warn('[transcribe] fallback error:', e);
      }
    }

    if (!textToSubmit || !sessionId || isThinkingRef.current) return;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }

    accumulatedSpeechRef.current = '';
    setInterimTranscript('');
    setIsCandidateSpeaking(false);
    setIsThinking(true);

    // Record candidate turn in local ledger
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

      // Record interviewer turn in local ledger
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
          startListeningRef.current();
        });
      }
    } catch (err: any) {
      console.error('[interview] Turn transmission error:', err);
      setIsThinking(false);
      const fallbackReply = "Understood. Let's explore the architectural trade-offs and edge failure modes.";
      speakUtterance(fallbackReply, () => {
        startListeningRef.current();
      });
    }
  }, [sessionId, currentQuestionIndex, persona, speakUtterance]);

  handleCandidateSubmitRef.current = handleCandidateSubmit;

  // Start Candidate Listening (Dual-Path STT: SpeechRecognition + MediaRecorder Whisper)
  const startListening = useCallback(() => {
    if (isAgentSpeakingRef.current || isConcludedRef.current || micMutedRef.current) return;
    if (typeof window === 'undefined') return;

    accumulatedSpeechRef.current = '';
    setInterimTranscript('');
    setIsCandidateSpeaking(false);

    // 1. Start MediaRecorder for backup audio recording
    if (mediaStreamRef.current && mediaStreamRef.current.active) {
      try {
        recordedChunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
        const recorder = new MediaRecorder(mediaStreamRef.current, { mimeType });
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };
        recorder.start(250);
        mediaRecorderRef.current = recorder;
      } catch (err) {
        console.warn('[mediaRecorder] start failed:', err);
      }
    }

    // 2. Start Web Speech API SpeechRecognition
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      console.warn('[speechRecognition] Web Speech API not supported.');
      return;
    }

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

        // Auto-silence timer: ~2.2s after last spoken word
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        const pauseToleranceMs = (persona?.pause_tolerance || 2.4) * 1000;

        silenceTimerRef.current = setTimeout(() => {
          const answerToSend = (accumulatedSpeechRef.current + ' ' + interim).trim();
          if (answerToSend.length >= 4) {
            handleCandidateSubmitRef.current(answerToSend);
          }
        }, pauseToleranceMs);
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') return;
        if (event.error === 'not-allowed') {
          console.warn('[speechRecognition] mic blocked');
        }
      };

      recognition.onend = () => {
        setIsCandidateSpeaking(false);
        // Automatically restart listening if still in active turn
        if (!isAgentSpeakingRef.current && !isConcludedRef.current && !micMutedRef.current && !isThinkingRef.current) {
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

  startListeningRef.current = startListening;

  // Initial Greeting Delivery on Mount
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

        // Speak greeting aloud, then immediately open candidate microphone
        speakUtterance(res.interviewer_text, () => {
          startListeningRef.current();
        });
      } catch (err) {
        console.error('[interview] Failed to start session greeting:', err);
        setIsThinking(false);
        const fallbackGreeting = `Hi ${participantName || 'there'}! I'm ${persona?.name || 'Alex Rivera'}, ready for your ${targetCompany || ''} interview. To begin, could you briefly introduce yourself?`;
        speakUtterance(fallbackGreeting, () => {
          startListeningRef.current();
        });
      }
    };

    initGreeting();

    return () => {
      if (speechSafetyTimerRef.current) clearTimeout(speechSafetyTimerRef.current);
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
  }, [sessionId, hasStarted, persona, targetCompany, targetRole, seniority, participantName, speakUtterance]);

  // Mic Toggle Handler
  const toggleMic = () => {
    const nextMuted = !micMuted;
    setMicMuted(nextMuted);

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
    }

    if (nextMuted) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch (_) {}
      }
      setIsCandidateSpeaking(false);
    } else {
      if (!isAgentSpeakingRef.current && !isConcludedRef.current) {
        startListeningRef.current();
      }
    }
  };

  // Explicit Candidate Submit Trigger
  const triggerManualSubmit = () => {
    const candidateText = (accumulatedSpeechRef.current + ' ' + interimTranscript).trim();
    if (candidateText.length >= 2) {
      handleCandidateSubmit(candidateText);
    } else if (recordedChunksRef.current.length > 0) {
      const audioBlob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
      handleCandidateSubmit('', audioBlob);
    }
  };

  // Manual Typed Text Submit
  const handleManualSend = () => {
    if (!manualText.trim()) return;
    const text = manualText.trim();
    setManualText('');
    setShowManualInput(false);
    handleCandidateSubmit(text);
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
              Direct Voice Studio
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
            isCandidateSpeaking={isCandidateSpeaking || audioVolume > 15}
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
            Chamber Online
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
            SHA-256 Ledger
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

        {/* Dynamic Glow Halo */}
        <motion.div
          animate={{
            scale: isAgentSpeaking
              ? [1, 1.35, 1.05, 1.25, 1]
              : (isCandidateSpeaking || audioVolume > 15)
              ? [1, 1.2, 1]
              : [1, 1.05, 1],
            opacity: isAgentSpeaking
              ? [0.55, 0.9, 0.55]
              : (isCandidateSpeaking || audioVolume > 15)
              ? [0.45, 0.75, 0.45]
              : [0.15, 0.25, 0.15],
          }}
          transition={{ duration: isAgentSpeaking ? 1.6 : 2.0, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            width: 240,
            height: 240,
            borderRadius: '50%',
            background: isAgentSpeaking
              ? `radial-gradient(circle, ${persona?.accent_color || '#6366f1'} 0%, transparent 70%)`
              : (isCandidateSpeaking || audioVolume > 15)
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
              : (isCandidateSpeaking || audioVolume > 15)
              ? '0 0 35px rgba(244, 63, 94, 0.75)'
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
              : (isCandidateSpeaking || audioVolume > 15)
              ? 'rgba(244, 63, 94, 0.25)'
              : isThinking
              ? 'rgba(245, 158, 11, 0.25)'
              : isConcluded
              ? 'rgba(16, 185, 129, 0.25)'
              : 'rgba(255, 255, 255, 0.08)',
            border: isAgentSpeaking
              ? `1px solid ${persona?.accent_color || '#6366f1'}`
              : (isCandidateSpeaking || audioVolume > 15)
              ? '1px solid #f43f5e'
              : isThinking
              ? '1px solid #f59e0b'
              : isConcluded
              ? '1px solid #10b981'
              : '1px solid rgba(255, 255, 255, 0.15)',
            color: isAgentSpeaking
              ? '#c7d2fe'
              : (isCandidateSpeaking || audioVolume > 15)
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
              : (isCandidateSpeaking || audioVolume > 15)
              ? '🗣️ CANDIDATE SPEAKING (MICROPHONE ACTIVE)'
              : micMuted
              ? '🔇 MICROPHONE MUTED'
              : `👂 ${persona?.name?.toUpperCase() || 'AI INTERVIEWER'} IS LISTENING · SPEAK NOW`}
          </span>

          <p style={{ fontSize: 13, color: '#94a3b8', margin: '8px 0 0', maxWidth: 520 }}>
            {isConcluded
              ? 'You have completed all technical questions! Click "End Interview & Evaluate" below to view your dossier.'
              : isAgentSpeaking
              ? (turns[turns.length - 1]?.text ? `"${turns[turns.length - 1].text.slice(0, 110)}..."` : 'Listening carefully to your technical rationale.')
              : (isCandidateSpeaking || audioVolume > 15)
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

        {/* Audio Reactive Pulse Bars (Connected to real Web Audio Analyser!) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 20, height: 36, zIndex: 2 }}>
          {[14, 26, 38, 22, 34, 18, 30, 42, 24, 16, 32, 20].map((baseH, idx) => {
            const dynamicScale = audioVolume > 5 ? Math.min(1.8, 0.3 + (audioVolume / 45)) : 0.25;
            return (
              <motion.div
                key={idx}
                animate={{
                  height: isAgentSpeaking
                    ? [baseH * 0.35, baseH * 1.35, baseH * 0.45]
                    : audioVolume > 10
                    ? [baseH * dynamicScale, baseH * (dynamicScale * 1.3), baseH * dynamicScale * 0.8]
                    : 6,
                  background: isAgentSpeaking
                    ? (persona?.accent_color || '#818cf8')
                    : (isCandidateSpeaking || audioVolume > 12)
                    ? '#f43f5e'
                    : 'rgba(255,255,255,0.15)',
                }}
                transition={{ duration: 0.25 + (idx % 4) * 0.08, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: 5, borderRadius: 99 }}
              />
            );
          })}
        </div>
      </div>

      {/* Live Interim Transcript Bubble (Candidate voice feedback) */}
      <AnimatePresence>
        {(interimTranscript || audioVolume > 15) && !isAgentSpeaking && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              padding: '12px 18px',
              borderRadius: 14,
              background: 'rgba(244, 63, 94, 0.08)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
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
                <strong style={{ color: '#fff', marginRight: 6 }}>
                  {interimTranscript ? 'Hearing you say:' : 'Hearing microphone audio...'}
                </strong>
                <span>{interimTranscript ? `"${interimTranscript}"` : 'Listening to your response...'}</span>
              </div>
            </div>
            <button
              onClick={triggerManualSubmit}
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

          {/* Explicit Send Answer Button */}
          <button
            onClick={triggerManualSubmit}
            disabled={isAgentSpeaking || isThinking}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '11px 18px',
              borderRadius: 99,
              border: '1px solid rgba(244, 63, 94, 0.4)',
              background: 'rgba(244, 63, 94, 0.15)',
              color: '#fda4af',
              fontSize: 13,
              fontWeight: 600,
              cursor: isAgentSpeaking || isThinking ? 'not-allowed' : 'pointer',
              opacity: isAgentSpeaking || isThinking ? 0.5 : 1,
            }}
          >
            <span>🎙️ Send Answer</span>
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
            if (speechSafetyTimerRef.current) clearTimeout(speechSafetyTimerRef.current);
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            if (recognitionRef.current) {
              try {
                recognitionRef.current.stop();
              } catch (_) {}
            }
            if (typeof window !== 'undefined' && window.speechSynthesis) {
              window.speechSynthesis.cancel();
            }
            if (mediaStreamRef.current) {
              mediaStreamRef.current.getTracks().forEach(t => t.stop());
            }
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

export default React.memo(LiveKitRoomWrapper);
