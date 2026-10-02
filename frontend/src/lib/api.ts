import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const api = axios.create({ baseURL: BASE, timeout: 120_000 });

// ── Auth helper ──────────────────────────────────────────────────────────────
export function setAuthToken(token: string) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}
export function clearAuthToken() {
  delete api.defaults.headers.common['Authorization'];
}

// ── Schemas & Type Definitions ──────────────────────────────────────────────
export interface BinaryAssertion {
  name: string;
  weight: number;
  description: string;
}

export interface BlueprintQuestion {
  id: string;
  text: string;
  competency: string;
  category: 'technical_dsa' | 'system_design' | 'behavioral';
  assertions: BinaryAssertion[];
  model_answer: string;
  target_seconds: number;
}

export interface InterviewBlueprint {
  blueprint_id: string;
  company: string;
  role: string;
  seniority: string;
  domain?: string;
  primary_language?: string;
  interview_focus?: string;
  spotlight_topic?: string;
  strategy_summary?: string;
  preparation_tips?: string[];
  keywords: string[];
  rounds?: string[];
  questions: BlueprintQuestion[];
  created_at?: string;
}

export interface PersonaProfile {
  id: string;
  name: string;
  title: string;
  difficulty: 'accessible' | 'adversarial' | 'rigorous';
  accent_color: string;
  voice_model: string;
  pause_tolerance: number;
  thinking_delay: number;
  max_words: number;
  signature_phrase: string;
  archetype?: string;
  pause_tolerance_seconds?: number;
  thinking_pause_seconds?: number;
  tagline?: string;
  badge_label?: string;
  probe_style?: string;
  traits?: string[];
}

export type Persona = PersonaProfile;

export interface AssertionResult {
  name: string;
  assertion_name?: string;
  passed: boolean;
  score: number;
  evidence_quote: string;
  reason: string;
  critique?: string;
}

export interface CompetencyScore {
  dsa_score: number;
  system_design_score: number;
  communication_score: number;
  tradeoff_intuition_score: number;
}

export interface QuestionEvaluation {
  question_id: string;
  question_text: string;
  status?: string;
  category?: string;
  reached?: boolean;
  score: number;
  weight?: number;
  assertion_results?: {
    assertion_name?: string;
    name?: string;
    passed: boolean;
    evidence_quote?: string;
    critique?: string;
    reason?: string;
    score?: number;
  }[];
  assertions?: AssertionResult[];
  verbatim_citations?: string[];
  candidate_summary?: string;
  actionable_coaching?: string;
}

export interface EvaluationReport {
  session_id: string;
  company?: string;
  role?: string;
  overall_score?: number;
  total_score?: number;
  recommendation: 'STRONG HIRE' | 'HIRE' | 'LEAN HIRE' | 'NO HIRE' | string;
  hiring_committee_summary?: string;
  competencies?: CompetencyScore;
  technical_dsa_score?: number;
  system_design_score?: number;
  communication_score?: number;
  tradeoff_score?: number;
  question_evaluations?: QuestionEvaluation[];
  questions_evaluated?: QuestionEvaluation[];
  verified_turn_count?: number;
  verified_turns_count?: number;
  unreached_question_count?: number;
  unreached_questions_count?: number;
  session_hash: string;
  created_at?: string;
  evaluated_at?: string;
  blueprint_id?: string;
}

export interface TurnEvent {
  turn_id: string;
  session_id: string;
  speaker: string;
  role: string;
  question_index: number;
  text: string;
  word_count: number;
  confidence: number;
  timestamp: string;
  verified: boolean;
}

export interface LedgerAuditResponse {
  session_id: string;
  turns_count: number;
  asked_question_indices: number[];
  session_hash: string;
  turns: TurnEvent[];
}

export interface SessionSummary {
  session_id: string;
  company: string;
  role: string;
  seniority: string;
  persona_id: string;
  overall_score: number | null;
  recommendation: string | null;
  turn_count: number;
  created_at: string;
  updated_at: string;
}

export interface SessionHistoryResponse {
  total: number;
  sessions: SessionSummary[];
}

export interface SessionHistoryDetail {
  session: SessionSummary;
  blueprint: InterviewBlueprint | null;
  report: EvaluationReport | null;
  turns_count: number;
  session_hash: string;
  turns: TurnEvent[];
}

// ── API Methods ─────────────────────────────────────────────────────────────
export const health = () => api.get('/health').then(r => r.data);

export const getPersonas = (): Promise<PersonaProfile[]> =>
  api.get('/api/personas').then(r => r.data);

export const createBlueprint = (payload: {
  company: string;
  role: string;
  seniority?: string;
  resume_text?: string;
  session_id?: string;
  persona_id?: string;
  primary_language?: string;
  interview_focus?: string;
  spotlight_topic?: string;
}): Promise<InterviewBlueprint> => api.post('/api/blueprint', payload).then(r => r.data);

export const uploadResumePdf = async (
  file: File,
  company: string,
  role: string,
  seniority: string = 'Senior',
  sessionId?: string,
  personaId: string = 'alex',
  primaryLanguage: string = 'Python',
  interviewFocus: string = 'Balanced Screening',
  spotlightTopic: string = ''
): Promise<InterviewBlueprint> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('company', company);
  formData.append('role', role);
  formData.append('seniority', seniority);
  formData.append('persona_id', personaId);
  formData.append('primary_language', primaryLanguage);
  formData.append('interview_focus', interviewFocus);
  formData.append('spotlight_topic', spotlightTopic);
  if (sessionId) formData.append('session_id', sessionId);

  const res = await api.post('/api/blueprint/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const getBlueprint = (sessionId: string): Promise<InterviewBlueprint> =>
  api.get(`/api/blueprint/${sessionId}`).then(r => r.data);

export const getLiveKitToken = (payload: {
  room_name: string;
  participant_name: string;
  identity?: string;
  persona_id?: string;
  company?: string;
  role?: string;
  seniority?: string;
}): Promise<{ token: string; server_url: string; room_name: string; participant_name: string }> =>
  api.post('/api/token', payload).then(r => r.data);

export const evaluateSession = (sessionId: string): Promise<EvaluationReport> =>
  api.post(`/api/evaluate/${sessionId}`).then(r => r.data);

export const getLedger = (sessionId: string): Promise<LedgerAuditResponse> =>
  api.get(`/api/ledger/${sessionId}`).then(r => r.data);

export const recordTurn = (payload: {
  session_id: string;
  speaker: string;
  text: string;
  question_index?: number;
  confidence?: number;
}): Promise<TurnEvent> => api.post('/api/ledger/turn', payload).then(r => r.data);

export const getHistory = (limit: number = 50, offset: number = 0): Promise<SessionHistoryResponse> =>
  api.get('/api/history', { params: { limit, offset } }).then(r => r.data);

export const getHistoryDetail = (sessionId: string): Promise<SessionHistoryDetail> =>
  api.get(`/api/history/${sessionId}`).then(r => r.data);

export const deleteHistorySession = (sessionId: string): Promise<{ status: string; session_id: string }> =>
  api.delete(`/api/history/${sessionId}`).then(r => r.data);

export default api;