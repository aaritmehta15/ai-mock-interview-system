import axios from 'axios';

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const api = axios.create({ baseURL: BASE, timeout: 120_000 });

// ── Auth helper ──────────────────────────────────────────────────────────────
export function setAuthToken(token: string) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}
export function clearAuthToken() {
  delete api.defaults.headers.common['Authorization'];
}

// ── Module 2 — Voice Mock Interview ─────────────────────────────────────────
export const scrapeInterviewQuestions = (company: string, role: string) =>
  api.post('/interview/scrape-questions', { company, role }).then(r => r.data);

export const interviewChat = (payload: object) =>
  api.post('/interview/chat', payload).then(r => r.data);

export const interviewSummary = (payload: object) =>
  api.post('/interview/summary', payload).then(r => r.data);

// ── LiveKit WebRTC & Blueprint Gateway ────────────────────────────────────────
export const getLiveKitToken = (room_name: string, participant_name: string, identity?: string) =>
  api.post('/api/token', { room_name, participant_name, identity }).then(r => r.data);

export const createBlueprint = (payload: {
  company: string;
  role: string;
  seniority?: string;
  resume_text?: string;
  jd_text?: string;
  session_id?: string;
}) => api.post('/api/blueprint', payload).then(r => r.data);

export const getBlueprint = (session_id: string) =>
  api.get(`/api/blueprint/${session_id}`).then(r => r.data);

export const evaluateSession = (session_id: string) =>
  api.post(`/api/evaluate/${session_id}`).then(r => r.data);

// ── Health ───────────────────────────────────────────────────────────────────
export const health = () => api.get('/health').then(r => r.data);

export default api;