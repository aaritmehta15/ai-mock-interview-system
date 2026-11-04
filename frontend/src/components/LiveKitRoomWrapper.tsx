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
  Code,
  HelpCircle,
  Play,
  Square,
  Activity,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import LatencyTelemetry from './LatencyTelemetry';

import {
  startInterviewSession,
  sendInterviewTurn,
  getTtsAudioUrl,
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
  turnType?: string;
  codeSnippet?: string | null;
  wpm?: number | null;
  fillerCount?: number | null;
}

const VERBAL_FILLER_REGEX = /\b(um|uh|like|basically|literally|you know|sort of|kind of|actually)\b/gi;

// Voice matching fallback for browser SpeechSynthesis
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
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [spokenAnswer, setSpokenAnswer] = useState<string>('');
  const [manualText, setManualText] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
  const [showTranscript, setShowTranscript] = useState<boolean>(false);
  const [micMuted, setMicMuted] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);

  // Advanced Feature 1 & 5 State: Telemetry and Code Scratchpad
  const [rollingWpm, setRollingWpm] = useState<number>(0);
  const [verbalFillerCount, setVerbalFillerCount] = useState<number>(0);
  const [showScratchpad, setShowScratchpad] = useState<boolean>(false);
  const [codeSnippet, setCodeSnippet] = useState<string>('');
  const [scratchpadLang, setScratchpadLang] = useState<string>('Python');
  const [playingTurnId, setPlayingTurnId] = useState<string | null>(null);

  // References
  const recognitionRef = useRef<any>(null);
  const shouldBeListeningRef = useRef<boolean>(false);
  const accumulatedFinalTextRef = useRef<string>('');
  const speechStartTimeRef = useRef<number | null>(null);

  // Web Audio API References for Neural TTS
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechSafetyTimerRef = useRef<any>(null);
  const keepAliveTimerRef = useRef<any>(null);

  const isAgentSpeakingRef = useRef<boolean>(false);
  const isConcludedRef = useRef<boolean>(false);
  const micMutedRef = useRef<boolean>(false);
  const isSubmittingRef = useRef<boolean>(false);
  const transcriptBottomRef = useRef<HTMLDivElement>(null);

  isAgentSpeakingRef.current = isAgentSpeaking;
  isConcludedRef.current = isConcluded;
  micMutedRef.current = micMuted;

  // Initialize Web Audio Context
  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioContextRef.current = new AudioContextClass();
    }
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close();
        } catch (_) {}
      }
    };
  }, []);

  // Auto-scroll turn ledger drawer
  useEffect(() => {
    if (showTranscript) {
      transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turns, showTranscript]);

  // Forward declarations for mutual referencing
  const startListeningRef = useRef<() => void>(() => {});
  const stopListeningRef = useRef<() => void>(() => {});
  const submitTurnRef = useRef<(forcedText?: string, turnType?: 'answer' | 'clarification') => Promise<void>>(async () => {});
  const handleBargeInRef = useRef<() => void>(() => {});

  // Instant Barge-In / Interrupt Handler
  const handleBargeIn = useCallback(() => {
    if (!isAgentSpeakingRef.current) return;
    console.log('[barge-in] User interrupted interviewer speech.');

    // 1. Immediately kill Web Audio playback
    if (currentSourceNodeRef.current) {
      try {
        currentSourceNodeRef.current.stop();
      } catch (_) {}
      currentSourceNodeRef.current = null;
    }

    // 2. Kill SpeechSynthesis fallback if running
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    if (speechSafetyTimerRef.current) {
      clearTimeout(speechSafetyTimerRef.current);
      speechSafetyTimerRef.current = null;
    }

    setIsAgentSpeaking(false);
    isAgentSpeakingRef.current = false;
    setPlayingTurnId(null);
    setStatusMessage('Interrupted. Mic is open — continue speaking.');

    // 3. Immediately re-arm microphone
    if (!micMutedRef.current && !isConcludedRef.current) {
      startListeningRef.current();
    }
  }, []);

  handleBargeInRef.current = handleBargeIn;

  // Global Spacebar Shortcut:
  // - If interviewer is speaking: instant barge-in!
  // - If candidate is ready: submit turn!
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (e.target as HTMLElement)?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (isAgentSpeakingRef.current) {
          handleBargeInRef.current();
        } else if (!isSubmittingRef.current && !isConcludedRef.current) {
          submitTurnRef.current();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Initialize Chrome/Edge Web Speech API Recognition
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      console.warn('[STT] Web Speech API (webkitSpeechRecognition) not supported in this browser.');
      return;
    }

    const rec = new SpeechRecognitionClass();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-IN'; // Calibrated for global/Indian English accents
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      if (shouldBeListeningRef.current) {
        setIsCandidateSpeaking(false);
      }
    };

    rec.onresult = (event: any) => {
      if (!shouldBeListeningRef.current || isAgentSpeakingRef.current) return;

      let currentInterim = '';
      let newlyFinalized = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        const transcriptPart = item[0]?.transcript || '';
        if (item.isFinal) {
          newlyFinalized += transcriptPart + ' ';
        } else {
          currentInterim += transcriptPart;
        }
      }

      if (newlyFinalized) {
        accumulatedFinalTextRef.current = (accumulatedFinalTextRef.current + ' ' + newlyFinalized).trim();
        setSpokenAnswer(accumulatedFinalTextRef.current);
      }

      setInterimTranscript(currentInterim);
      const fullUtterance = (accumulatedFinalTextRef.current + ' ' + currentInterim).trim();
      const isSpeakingNow = Boolean(fullUtterance);
      setIsCandidateSpeaking(isSpeakingNow);

      // Speech Telemetry Engine: Compute rolling WPM & verbal filler counts
      if (isSpeakingNow) {
        if (!speechStartTimeRef.current) {
          speechStartTimeRef.current = Date.now();
        }
        const words = fullUtterance.split(/\s+/).filter(Boolean);
        const elapsedMins = (Date.now() - speechStartTimeRef.current) / 60000;
        if (elapsedMins > 0.03) {
          const calculatedWpm = Math.min(240, Math.max(50, Math.round(words.length / elapsedMins)));
          setRollingWpm(calculatedWpm);
        }

        // Count verbal fillers with regex
        const matches = fullUtterance.match(VERBAL_FILLER_REGEX);
        setVerbalFillerCount(matches ? matches.length : 0);
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      if (event.error === 'not-allowed') {
        setStatusMessage('Microphone access denied. Please allow microphone permission in browser settings.');
      } else {
        console.warn('[STT] SpeechRecognition error:', event.error);
      }
    };

    rec.onend = () => {
      setIsCandidateSpeaking(false);
      // Keep-Alive: Chrome automatically kills recognition after short pauses.
      // If we are in the listening window and call is active, restart after 200ms.
      if (shouldBeListeningRef.current && !isAgentSpeakingRef.current && !isSubmittingRef.current && !isConcludedRef.current && !micMutedRef.current) {
        if (keepAliveTimerRef.current) clearTimeout(keepAliveTimerRef.current);
        keepAliveTimerRef.current = setTimeout(() => {
          if (shouldBeListeningRef.current && !isAgentSpeakingRef.current && !isSubmittingRef.current) {
            try {
              rec.start();
            } catch (_) {}
          }
        }, 200);
      }
    };

    recognitionRef.current = rec;

    return () => {
      shouldBeListeningRef.current = false;
      if (keepAliveTimerRef.current) clearTimeout(keepAliveTimerRef.current);
      try {
        rec.abort();
      } catch (_) {}
      recognitionRef.current = null;
    };
  }, []);

  // Safe Half-Duplex STT Starters/Stoppers
  const startListening = useCallback(() => {
    if (isAgentSpeakingRef.current || isConcludedRef.current || micMutedRef.current || isSubmittingRef.current) return;
    shouldBeListeningRef.current = true;
    setIsCandidateSpeaking(false);
    setInterimTranscript('');
    setStatusMessage('');
    speechStartTimeRef.current = Date.now();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (err: any) {
        // InvalidStateError means already running
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    shouldBeListeningRef.current = false;
    if (keepAliveTimerRef.current) clearTimeout(keepAliveTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (_) {}
    }
    setIsCandidateSpeaking(false);
  }, []);

  startListeningRef.current = startListening;
  stopListeningRef.current = stopListening;

  // Speak Utterance via High-Quality Microsoft Edge Neural TTS + Web Audio API
  const speakUtterance = useCallback(async (text: string, onEndCallback?: () => void) => {
    if (!text || !text.trim()) {
      if (onEndCallback) onEndCallback();
      return;
    }

    try {
      // 1. Half-Duplex: Hard kill STT before AI speaks so she never transcribes her own voice
      stopListeningRef.current();

      // Stop previous playback
      if (currentSourceNodeRef.current) {
        try {
          currentSourceNodeRef.current.stop();
        } catch (_) {}
        currentSourceNodeRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (speechSafetyTimerRef.current) {
        clearTimeout(speechSafetyTimerRef.current);
        speechSafetyTimerRef.current = null;
      }

      setIsAgentSpeaking(true);
      isAgentSpeakingRef.current = true;

      // Ensure AudioContext is running (requires user interaction)
      const ctx = audioContextRef.current;
      if (ctx && ctx.state === 'suspended') {
        await ctx.resume();
      }

      const pId = persona?.id || 'alex';
      const cacheKey = `${pId}:${text.trim()}`;

      let audioBuffer: AudioBuffer | null = null;
      if (audioCacheRef.current.has(cacheKey)) {
        audioBuffer = audioCacheRef.current.get(cacheKey) || null;
      }

      if (!audioBuffer && ctx) {
        try {
          const ttsUrl = getTtsAudioUrl(text, pId);
          const resp = await fetch(ttsUrl);
          if (resp.ok) {
            const arrayBuffer = await resp.arrayBuffer();
            if (arrayBuffer.byteLength > 500) {
              audioBuffer = await ctx.decodeAudioData(arrayBuffer);
              audioCacheRef.current.set(cacheKey, audioBuffer);
            }
          }
        } catch (fetchErr) {
          console.warn('[tts] Neural TTS fetch failed, falling back to browser SpeechSynthesis:', fetchErr);
        }
      }

      let hasCompleted = false;
      const completeSpeech = () => {
        if (hasCompleted) return;
        hasCompleted = true;
        if (speechSafetyTimerRef.current) {
          clearTimeout(speechSafetyTimerRef.current);
          speechSafetyTimerRef.current = null;
        }
        setIsAgentSpeaking(false);
        isAgentSpeakingRef.current = false;
        setPlayingTurnId(null);

        // Half-Duplex: 350ms settle window after AI finishes speaking, then re-arm STT
        setTimeout(() => {
          if (!isConcludedRef.current && !isSubmittingRef.current && !micMutedRef.current) {
            startListeningRef.current();
          }
          if (onEndCallback) onEndCallback();
        }, 350);
      };

      // 2. Play via Web Audio API if buffer acquired
      if (audioBuffer && ctx) {
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        currentSourceNodeRef.current = source;

        source.onended = completeSpeech;
        const safetyDurationMs = Math.round(audioBuffer.duration * 1000) + 1200;
        speechSafetyTimerRef.current = setTimeout(completeSpeech, safetyDurationMs);

        source.start(0);
        return;
      }

      // 3. Graceful Fallback: Browser SpeechSynthesis
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(text);
        activeUtteranceRef.current = utterance;

        const voices = window.speechSynthesis.getVoices();
        const chosenVoice = selectPersonaVoice(voices, pId);
        if (chosenVoice) utterance.voice = chosenVoice;

        utterance.onstart = () => {
          setIsAgentSpeaking(true);
          isAgentSpeakingRef.current = true;
        };
        utterance.onend = completeSpeech;
        utterance.onerror = completeSpeech;

        const wordCount = text.split(/\s+/).filter(Boolean).length;
        const estimatedDurationMs = Math.max(2000, (wordCount / 2.3) * 1000 + 1200);
        speechSafetyTimerRef.current = setTimeout(completeSpeech, estimatedDurationMs);

        window.speechSynthesis.speak(utterance);
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } else {
        completeSpeech();
      }
    } catch (err) {
      console.error('[tts] Playback pipeline error:', err);
      setIsAgentSpeaking(false);
      isAgentSpeakingRef.current = false;
      if (onEndCallback) onEndCallback();
    }
  }, [persona]);

  // Turn Replay function for the ledger drawer
  const playTurnAudio = useCallback((turnId: string, text: string) => {
    setPlayingTurnId(turnId);
    speakUtterance(text, () => {
      setPlayingTurnId(null);
    });
  }, [speakUtterance]);

  // Bulletproof Candidate Turn Submission (Answers & Clarification Requests)
  const submitTurn = useCallback(async (forcedText?: string, turnType: 'answer' | 'clarification' = 'answer') => {
    if (isSubmittingRef.current || !sessionId) return;
    isSubmittingRef.current = true;
    setIsThinking(true);
    setStatusMessage(turnType === 'clarification' ? 'Requesting Socratic clarification...' : 'Evaluating response against blueprint...');

    // 1. Immediately abort STT so no further audio leaks
    stopListeningRef.current();

    // 2. Resolve candidate text: either forced, or accumulated finalized + trailing interim speech
    let candidateText = (forcedText || '').trim();
    if (!candidateText) {
      const fullRecognized = (accumulatedFinalTextRef.current + ' ' + (interimTranscript || '')).trim();
      candidateText = fullRecognized;
    }

    // Telemetry capture for this turn
    const turnWpm = rollingWpm > 0 ? rollingWpm : 140.0;
    const turnFillers = verbalFillerCount;
    const currentCode = codeSnippet.trim() ? codeSnippet.trim() : null;

    // Reset turn buffers for next exchange
    accumulatedFinalTextRef.current = '';
    setSpokenAnswer('');
    setInterimTranscript('');
    speechStartTimeRef.current = null;

    if (!candidateText && !currentCode) {
      candidateText = turnType === 'clarification'
        ? 'Could you clarify the constraints or give a hint?'
        : '[inaudible / faint audio]';
    }

    // Record candidate turn in local ledger
    const candRecord: TurnRecord = {
      id: `cand_${Date.now()}`,
      speaker: 'candidate',
      text: candidateText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      questionIndex: currentQuestionIndex,
      turnType: turnType,
      codeSnippet: currentCode,
      wpm: turnWpm,
      fillerCount: turnFillers,
    };
    setTurns(prev => [...prev, candRecord]);

    try {
      const res = await sendInterviewTurn({
        session_id: sessionId,
        candidate_text: candidateText,
        persona_id: persona?.id || 'alex',
        turn_type: turnType,
        code_snippet: currentCode,
        wpm: turnWpm,
        filler_count: turnFillers,
      });

      setIsThinking(false);
      isSubmittingRef.current = false;
      setStatusMessage('');

      // Record interviewer turn in local ledger
      const aiRecord: TurnRecord = {
        id: `ai_${Date.now()}`,
        speaker: 'interviewer',
        text: res.interviewer_text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        questionIndex: res.question_index,
        turnType: turnType,
      };
      setTurns(prev => [...prev, aiRecord]);

      if (res.total_questions) setTotalQuestions(res.total_questions);
      setCurrentQuestionIndex(res.question_index);
      if (res.current_question_text) setCurrentQuestionText(res.current_question_text);

      if (res.is_finished) {
        setIsConcluded(true);
        speakUtterance(res.interviewer_text);
      } else {
        // Speak interviewer reply in crisp neural voice, which automatically re-arms STT upon finish!
        speakUtterance(res.interviewer_text);
      }
    } catch (err) {
      console.error('[interview] Turn transmission failed:', err);
      setIsThinking(false);
      isSubmittingRef.current = false;
      setStatusMessage('');
      const fallbackReply = "That's an interesting point. Let's dig deeper into the system trade-offs and failure modes.";
      speakUtterance(fallbackReply);
    }
  }, [sessionId, currentQuestionIndex, persona, interimTranscript, rollingWpm, verbalFillerCount, codeSnippet, speakUtterance]);

  submitTurnRef.current = submitTurn;

  // Initial Greeting Delivery on Mount
  useEffect(() => {
    if (hasStarted || !sessionId) return;
    setHasStarted(true);

    const initGreeting = async () => {
      try {
        setIsThinking(true);
        setStatusMessage('Connecting to interviewer persona...');
        const res = await startInterviewSession({
          session_id: sessionId,
          persona_id: persona?.id || 'alex',
          company: targetCompany,
          role: targetRole,
          seniority: seniority,
          participant_name: participantName,
        });

        setIsThinking(false);
        setStatusMessage('');

        if (res.total_questions) setTotalQuestions(res.total_questions);
        if (res.current_question_text) setCurrentQuestionText(res.current_question_text);
        setCurrentQuestionIndex(0);

        const greetingRecord: TurnRecord = {
          id: `ai_greeting_${Date.now()}`,
          speaker: 'interviewer',
          text: res.interviewer_text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          questionIndex: 0,
          turnType: 'greeting',
        };
        setTurns([greetingRecord]);

        // Speak greeting aloud via Edge Neural TTS
        speakUtterance(res.interviewer_text);
      } catch (err) {
        console.error('[interview] Failed to start session greeting:', err);
        setIsThinking(false);
        setStatusMessage('');
        const fallbackGreeting = `Hi ${participantName || 'there'}! I'm ${persona?.name || 'Alex Rivera'}, ready for your ${targetCompany || ''} interview. To begin, could you briefly introduce yourself?`;
        speakUtterance(fallbackGreeting);
      }
    };

    initGreeting();

    return () => {
      if (speechSafetyTimerRef.current) clearTimeout(speechSafetyTimerRef.current);
      stopListeningRef.current();
      if (currentSourceNodeRef.current) {
        try {
          currentSourceNodeRef.current.stop();
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

    if (nextMuted) {
      stopListeningRef.current();
    } else {
      if (!isAgentSpeakingRef.current && !isConcludedRef.current) {
        startListeningRef.current();
      }
    }
  };

  // Manual Typed Text Submit
  const handleManualSend = () => {
    if (!manualText.trim()) return;
    const text = manualText.trim();
    setManualText('');
    setShowManualInput(false);
    submitTurn(text);
  };

  // Live real-time recognized text preview
  const livePreviewText = (spokenAnswer + ' ' + (interimTranscript ? `"${interimTranscript}"` : '')).trim();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      width: '100%',
      maxWidth: 880,
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
              Edge Neural Audio Studio (24kHz)
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
            Half-Duplex Active
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

      {/* Stage: AI Interviewer Presence & Dynamic Orb (Fixed height to guarantee ZERO layout jump) */}
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 330,
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

        {/* Feature 1: Live Speech Telemetry HUD Pill */}
        <div style={{
          position: 'absolute',
          top: 14,
          right: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '4px 12px',
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 99,
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          color: '#cbd5e1',
          zIndex: 3,
        }}>
          <Activity size={13} color="#10b981" />
          <span>{rollingWpm > 0 ? `${rollingWpm} WPM` : '140 WPM'}</span>
          <span style={{ color: '#475569' }}>|</span>
          <span style={{ color: verbalFillerCount > 2 ? '#f59e0b' : '#94a3b8' }}>
            {verbalFillerCount} filler{verbalFillerCount === 1 ? '' : 's'}
          </span>
        </div>

        {/* Dynamic Glow Halo */}
        <motion.div
          animate={{
            scale: isAgentSpeaking
              ? [1, 1.35, 1.05, 1.25, 1]
              : isCandidateSpeaking
              ? [1, 1.25, 1]
              : [1, 1.05, 1],
            opacity: isAgentSpeaking
              ? [0.55, 0.9, 0.55]
              : isCandidateSpeaking
              ? [0.5, 0.8, 0.5]
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
            background: isConcluded
              ? 'rgba(16, 185, 129, 0.25)'
              : isThinking
              ? 'rgba(245, 158, 11, 0.25)'
              : isAgentSpeaking
              ? 'rgba(99, 102, 241, 0.25)'
              : isCandidateSpeaking
              ? 'rgba(244, 63, 94, 0.25)'
              : micMuted
              ? 'rgba(244, 63, 94, 0.15)'
              : 'rgba(255, 255, 255, 0.08)',
            border: isConcluded
              ? '1px solid #10b981'
              : isThinking
              ? '1px solid #f59e0b'
              : isAgentSpeaking
              ? `1px solid ${persona?.accent_color || '#6366f1'}`
              : isCandidateSpeaking
              ? '1px solid #f43f5e'
              : micMuted
              ? '1px solid #f43f5e'
              : '1px solid rgba(255, 255, 255, 0.15)',
            color: isConcluded
              ? '#a7f3d0'
              : isThinking
              ? '#fde68a'
              : isAgentSpeaking
              ? '#c7d2fe'
              : isCandidateSpeaking
              ? '#fecdd3'
              : micMuted
              ? '#fca5a5'
              : '#94a3b8',
          }}>
            {isConcluded
              ? '🏁 INTERVIEW COMPLETE · READY TO EVALUATE'
              : isThinking
              ? (statusMessage || `⚡ ${persona?.name?.toUpperCase() || 'AI INTERVIEWER'} IS EVALUATING...`)
              : isAgentSpeaking
              ? `🎙️ ${persona?.name?.toUpperCase() || 'AI INTERVIEWER'} IS SPEAKING · SPACE TO INTERRUPT`
              : isCandidateSpeaking
              ? '🗣️ CANDIDATE SPEAKING (LIVE STREAMING STT)'
              : micMuted
              ? '🔇 MICROPHONE MUTED'
              : `👂 ${persona?.name?.toUpperCase() || 'AI INTERVIEWER'} IS LISTENING · SPEAK FREELY`}
          </span>

          <p style={{ fontSize: 13, color: '#94a3b8', margin: '8px 0 0', maxWidth: 560 }}>
            {isConcluded
              ? 'You have completed all technical questions! Click "End Interview & Evaluate" below to view your dossier.'
              : statusMessage
              ? statusMessage
              : isAgentSpeaking
              ? (turns[turns.length - 1]?.text ? `"${turns[turns.length - 1].text.slice(0, 110)}..."` : 'Listening carefully to your technical rationale.')
              : isCandidateSpeaking
              ? 'Transcribing in real time... Click "Send Answer" or press Spacebar when finished.'
              : persona
              ? `${persona.tagline || persona.signature_phrase} Take all the time you need to think through your approach.`
              : 'Take all the time you need to think. Speak naturally into your mic.'}
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
              maxWidth: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              🎯 <strong style={{ color: persona?.accent_color || '#818cf8' }}>Focus:</strong> {currentQuestionText}
            </div>
          )}
        </div>

        {/* Audio Reactive Pulse Bars */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 18, height: 36, zIndex: 2 }}>
          {[14, 26, 38, 22, 34, 18, 30, 42, 24, 16, 32, 20].map((baseH, idx) => {
            return (
              <motion.div
                key={idx}
                animate={{
                  height: isAgentSpeaking
                    ? [baseH * 0.35, baseH * 1.35, baseH * 0.45]
                    : isCandidateSpeaking
                    ? [baseH * 0.4, baseH * 1.4, baseH * 0.6]
                    : 6,
                  background: isAgentSpeaking
                    ? (persona?.accent_color || '#818cf8')
                    : isCandidateSpeaking
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

      {/* Fixed-Height Feedback Banner (Live Chrome STT Transcript Preview) */}
      <div style={{
        height: 52,
        minHeight: 52,
        maxHeight: 52,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        borderRadius: 12,
        background: isCandidateSpeaking
          ? 'rgba(244, 63, 94, 0.08)'
          : livePreviewText
          ? 'rgba(99, 102, 241, 0.08)'
          : 'rgba(255, 255, 255, 0.03)',
        border: isCandidateSpeaking
          ? '1px solid rgba(244, 63, 94, 0.3)'
          : livePreviewText
          ? '1px solid rgba(99, 102, 241, 0.3)'
          : '1px solid rgba(255, 255, 255, 0.06)',
        transition: 'background 0.2s ease, border-color 0.2s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, overflow: 'hidden' }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isCandidateSpeaking ? '#f43f5e' : livePreviewText ? '#818cf8' : '#10b981',
            flexShrink: 0,
            boxShadow: isCandidateSpeaking ? '0 0 8px #f43f5e' : livePreviewText ? '0 0 8px #818cf8' : '0 0 8px #10b981',
          }} />
          <span style={{
            fontSize: 13,
            color: isCandidateSpeaking ? '#fecdd3' : livePreviewText ? '#c7d2fe' : '#94a3b8',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {livePreviewText
              ? `🗣️ Live STT: "${livePreviewText}"`
              : statusMessage
              ? statusMessage
              : 'Mic active. Speak naturally; words stream live above. Click "Send Answer" or press Space when done.'}
          </span>
        </div>
      </div>

      {/* Feature 5: Synchronized Architecture & Code Scratchpad Drawer */}
      <AnimatePresence>
        {showScratchpad && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              padding: '16px 20px',
              background: 'rgba(10, 13, 22, 0.95)',
              borderRadius: 16,
              border: '1px solid rgba(99, 102, 241, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Code size={16} color="#818cf8" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                  Synchronized Architecture & Code Scratchpad
                </span>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  (Evaluated alongside speech)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <select
                  value={scratchpadLang}
                  onChange={(e) => setScratchpadLang(e.target.value)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 6,
                    padding: '3px 8px',
                    color: '#cbd5e1',
                    fontSize: 12,
                    outline: 'none',
                  }}
                >
                  <option value="Python">Python</option>
                  <option value="TypeScript">TypeScript</option>
                  <option value="Go">Go</option>
                  <option value="Java">Java</option>
                  <option value="SQL">SQL</option>
                  <option value="ASCII Architecture">ASCII Architecture</option>
                </select>
                <button
                  type="button"
                  onClick={() => setCodeSnippet('')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              </div>
            </div>

            <textarea
              value={codeSnippet}
              onChange={(e) => setCodeSnippet(e.target.value)}
              placeholder={`// Write your ${scratchpadLang} code or sketch ASCII architecture diagrams here...\n// It will be sent automatically with your spoken answer and evaluated.`}
              rows={7}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 8,
                padding: '12px 14px',
                color: '#e2e8f0',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12.5,
                lineHeight: 1.5,
                outline: 'none',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
              <span>{codeSnippet.split('\n').length} lines · {codeSnippet.length} characters</span>
              <span>✓ Auto-attached to next turn</span>
            </div>
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
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          {/* Mute/Unmute Mic */}
          <button
            onClick={toggleMic}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
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
            <span>{!micMuted ? 'Mute' : 'Unmute'}</span>
          </button>

          {/* Feature 2: Socratic Clarification / Hint Button */}
          <button
            onClick={() => submitTurn(undefined, 'clarification')}
            disabled={isAgentSpeaking || isThinking || currentQuestionIndex === 0}
            type="button"
            title="Ask a clarifying question or request a constraint hint without burning a turn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              borderRadius: 99,
              border: '1px solid rgba(245, 158, 11, 0.35)',
              background: 'rgba(245, 158, 11, 0.12)',
              color: '#f59e0b',
              fontSize: 13,
              fontWeight: 600,
              cursor: isAgentSpeaking || isThinking || currentQuestionIndex === 0 ? 'not-allowed' : 'pointer',
              opacity: isAgentSpeaking || isThinking || currentQuestionIndex === 0 ? 0.45 : 1,
            }}
          >
            <HelpCircle size={15} />
            <span>Hint / Clarify</span>
          </button>

          {/* Feature 5 Toggle: Code Scratchpad */}
          <button
            onClick={() => setShowScratchpad(!showScratchpad)}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              borderRadius: 99,
              border: showScratchpad || codeSnippet.trim() ? '1px solid rgba(99, 102, 241, 0.6)' : '1px solid rgba(255, 255, 255, 0.12)',
              background: showScratchpad || codeSnippet.trim() ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.05)',
              color: showScratchpad || codeSnippet.trim() ? '#a5b4fc' : '#cbd5e1',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <Code size={15} />
            <span>Code Scratchpad</span>
            {codeSnippet.trim() && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1' }} />
            )}
          </button>

          {/* Type instead toggle */}
          <button
            onClick={() => setShowManualInput(!showManualInput)}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              borderRadius: 99,
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#cbd5e1',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <span>💬 Type</span>
          </button>

          {/* Toggle Ledger Drawer */}
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
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

        {/* Action Controls on the Right: Send Answer / Interrupt + End */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Barge-In / Interrupt Button (when AI is speaking) */}
          {isAgentSpeaking ? (
            <button
              onClick={handleBargeIn}
              type="button"
              title="Interrupt interviewer speech immediately and open mic"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 22px',
                borderRadius: 99,
                border: '1px solid #f59e0b',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 16px rgba(245, 158, 11, 0.4)',
              }}
            >
              <Square size={14} fill="#fff" />
              <span>Interrupt (Space)</span>
            </button>
          ) : (
            /* Send Answer Button */
            <button
              onClick={() => submitTurn()}
              disabled={isAgentSpeaking || isThinking}
              type="button"
              title="Click or press Spacebar to submit your answer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 24px',
                borderRadius: 99,
                border: isCandidateSpeaking || livePreviewText ? '1px solid #f43f5e' : '1px solid rgba(99, 102, 241, 0.4)',
                background: isCandidateSpeaking || livePreviewText
                  ? 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)'
                  : 'linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(79, 70, 229, 0.3) 100%)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: isAgentSpeaking || isThinking ? 'not-allowed' : 'pointer',
                opacity: isAgentSpeaking || isThinking ? 0.45 : 1,
                boxShadow: isCandidateSpeaking || livePreviewText ? '0 0 18px rgba(244, 63, 94, 0.5)' : '0 0 12px rgba(99, 102, 241, 0.2)',
                transition: 'all 0.2s ease',
              }}
            >
              <Send size={15} />
              <span>{isThinking ? 'Evaluating...' : 'Send Answer (Space)'}</span>
            </button>
          )}

          {/* End & Evaluate Button */}
          <button
            onClick={() => {
              if (speechSafetyTimerRef.current) clearTimeout(speechSafetyTimerRef.current);
              stopListeningRef.current();
              if (currentSourceNodeRef.current) {
                try {
                  currentSourceNodeRef.current.stop();
                } catch (_) {}
              }
              if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
              }
              onLeave();
            }}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 24px',
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
            <PhoneOff size={15} />
            <span>End & Evaluate</span>
          </button>
        </div>
      </div>

      {/* Feature 3 & 4: Collapsible Verified Turn Ledger Drawer with Audio Replay */}
      <AnimatePresence>
        {showTranscript && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              marginTop: 6,
              padding: '16px 20px',
              background: 'rgba(10, 13, 20, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 16,
              maxHeight: 320,
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
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: t.speaker === 'interviewer' ? 'rgba(99, 102, 241, 0.08)' : 'rgba(244, 63, 94, 0.08)',
                      borderLeft: t.speaker === 'interviewer'
                        ? `3px solid ${persona?.accent_color || '#6366f1'}`
                        : '3px solid #f43f5e',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: t.speaker === 'interviewer' ? (persona?.accent_color || '#818cf8') : '#f43f5e',
                        }}>
                          {t.speaker === 'interviewer' ? (persona?.name || 'AI Interviewer') : 'Candidate'}
                        </span>
                        {t.turnType === 'clarification' && (
                          <span style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'rgba(245, 158, 11, 0.2)',
                            color: '#f59e0b',
                            fontWeight: 600,
                          }}>
                            Clarification
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {t.speaker === 'interviewer' && (
                          <button
                            type="button"
                            onClick={() => playTurnAudio(t.id, t.text)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              borderRadius: 4,
                              padding: '2px 8px',
                              color: playingTurnId === t.id ? '#10b981' : '#cbd5e1',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            <Play size={10} fill={playingTurnId === t.id ? '#10b981' : 'none'} />
                            <span>{playingTurnId === t.id ? 'Playing...' : 'Play'}</span>
                          </button>
                        )}
                        <span style={{ fontSize: 10, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
                          {t.timestamp}
                        </span>
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', lineHeight: 1.45 }}>
                      {t.text}
                    </p>
                    {t.codeSnippet && (
                      <pre style={{
                        marginTop: 8,
                        padding: '8px 10px',
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 6,
                        color: '#93c5fd',
                        fontSize: 11.5,
                        fontFamily: "'JetBrains Mono', monospace",
                        overflowX: 'auto',
                      }}>
                        {t.codeSnippet}
                      </pre>
                    )}
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
