import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { InterviewBlueprint, PersonaProfile, EvaluationReport } from '../lib/api';

interface InterviewContextType {
  sessionId: string;
  targetCompany: string;
  targetRole: string;
  seniority: string;
  blueprint: InterviewBlueprint | null;
  selectedPersonaId: string;
  selectedPersona: PersonaProfile | null;
  latestReport: EvaluationReport | null;
  setTargetCompany: (c: string) => void;
  setTargetRole: (r: string) => void;
  setSeniority: (s: string) => void;
  setBlueprint: (bp: InterviewBlueprint | null) => void;
  setSelectedPersonaId: (id: string) => void;
  setSelectedPersona: (p: PersonaProfile | null) => void;
  setLatestReport: (r: EvaluationReport | null) => void;
  initSession: () => string;
  startFreshSession: () => string;
  resetSession: () => void;
}

const InterviewContext = createContext<InterviewContextType | null>(null);

const STORAGE_KEY = 'apex_interview_session';

export function InterviewProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string>(() => {
    const saved = sessionStorage.getItem(`${STORAGE_KEY}_id`);
    return saved || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  });

  const [targetCompany, setTargetCompany] = useState<string>(() => {
    return sessionStorage.getItem(`${STORAGE_KEY}_company`) || 'Google';
  });

  const [targetRole, setTargetRole] = useState<string>(() => {
    return sessionStorage.getItem(`${STORAGE_KEY}_role`) || 'Staff Distributed Systems Engineer';
  });

  const [seniority, setSeniority] = useState<string>(() => {
    return sessionStorage.getItem(`${STORAGE_KEY}_seniority`) || 'Staff';
  });

  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(() => {
    return sessionStorage.getItem(`${STORAGE_KEY}_persona`) || 'alex';
  });

  const [blueprint, setBlueprintState] = useState<InterviewBlueprint | null>(() => {
    try {
      const stored = sessionStorage.getItem(`${STORAGE_KEY}_blueprint`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [selectedPersona, setSelectedPersona] = useState<PersonaProfile | null>(null);
  const [latestReport, setLatestReport] = useState<EvaluationReport | null>(null);

  const setBlueprint = (bp: InterviewBlueprint | null) => {
    setBlueprintState(bp);
    if (bp) {
      sessionStorage.setItem(`${STORAGE_KEY}_blueprint`, JSON.stringify(bp));
      if (bp.company) {
        setTargetCompany(bp.company);
        sessionStorage.setItem(`${STORAGE_KEY}_company`, bp.company);
      }
      if (bp.role) {
        setTargetRole(bp.role);
        sessionStorage.setItem(`${STORAGE_KEY}_role`, bp.role);
      }
      if (bp.seniority) {
        setSeniority(bp.seniority);
        sessionStorage.setItem(`${STORAGE_KEY}_seniority`, bp.seniority);
      }
    } else {
      sessionStorage.removeItem(`${STORAGE_KEY}_blueprint`);
    }
  };

  useEffect(() => {
    sessionStorage.setItem(`${STORAGE_KEY}_id`, sessionId);
    sessionStorage.setItem(`${STORAGE_KEY}_company`, targetCompany);
    sessionStorage.setItem(`${STORAGE_KEY}_role`, targetRole);
    sessionStorage.setItem(`${STORAGE_KEY}_seniority`, seniority);
    sessionStorage.setItem(`${STORAGE_KEY}_persona`, selectedPersonaId);
  }, [sessionId, targetCompany, targetRole, seniority, selectedPersonaId]);

  const initSession = () => {
    const newId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setSessionId(newId);
    sessionStorage.setItem(`${STORAGE_KEY}_id`, newId);
    return newId;
  };

  const startFreshSession = () => {
    const newId = initSession();
    setLatestReport(null);
    return newId;
  };

  const resetSession = () => {
    const newId = startFreshSession();
    setBlueprint(null);
    return newId;
  };

  return (
    <InterviewContext.Provider
      value={{
        sessionId,
        targetCompany,
        targetRole,
        seniority,
        blueprint,
        selectedPersonaId,
        selectedPersona,
        latestReport,
        setTargetCompany,
        setTargetRole,
        setSeniority,
        setBlueprint,
        setSelectedPersonaId,
        setSelectedPersona,
        setLatestReport,
        initSession,
        startFreshSession,
        resetSession,
      }}
    >
      {children}
    </InterviewContext.Provider>
  );
}

export function useInterview() {
  const ctx = useContext(InterviewContext);
  if (!ctx) throw new Error('useInterview must be used within an InterviewProvider');
  return ctx;
}
