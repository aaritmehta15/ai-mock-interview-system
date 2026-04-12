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

// ── Module 1 — Smart Priority Engine ────────────────────────────────────────
export const generatePlan = (suggestion?: string) => {
  const url = suggestion ? `/generate-plan?suggestion=${encodeURIComponent(suggestion)}` : '/generate-plan';
  return api.get(url).then(r => r.data);
};

export const logStudy = (payload: { userId: string; date: string; hours: number; subject?: string }) =>
  api.post('/log-study', { user_id: payload.userId, date: payload.date, hours_studied: payload.hours, subject: payload.subject }).then(r => r.data);

export const getProfile = (userId: string) =>
  api.get(`/profile/${userId}`).then(r => r.data);

export const updateProfile = (userId: string, data: object) =>
  api.post(`/profile/${userId}`, data).then(r => r.data);

export const getCachedPlan = (userId: string, date: string) =>
  api.get(`/plan/${userId}/${date}`).then(r => r.data);

// ── Module 2 — Voice Mock Interview ─────────────────────────────────────────
export const scrapeInterviewQuestions = (company: string, role: string) =>
  api.post('/interview/scrape-questions', { company, role }).then(r => r.data);

export const interviewChat = (payload: object) =>
  api.post('/interview/chat', payload).then(r => r.data);

export const interviewSummary = (payload: object) =>
  api.post('/interview/summary', payload).then(r => r.data);

// ── Module 3 — Company Intel & Prep ─────────────────────────────────────────
export const analyzeCompany = (input_text: string) =>
  api.post('/api/analyze', { input_text }).then(r => r.data);

export const gmailScan = () =>
  api.post('/api/gmail-scan', {}).then(r => r.data);

// ── Module 4 — Auto Apply Engine ────────────────────────────────────────────
export const processResumeAll = (file: File, onProgress?: (p: number) => void) => {
  const form = new FormData();
  form.append('resume', file);
  return api.post('/auto-apply/process-all', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => onProgress && onProgress(Math.round((e.loaded * 100) / (e.total ?? 1))),
  }).then(r => r.data);
};

export const uploadResumeStep = (file: File) => {
  const form = new FormData();
  form.append('resume', file);
  return api.post('/auto-apply/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};

export const parseResumeStep = (sessionId: string) =>
  api.post('/auto-apply/parse', { sessionId }).then(r => r.data);

export const getOpportunities = (sessionId: string) =>
  api.post('/auto-apply/opportunities', { sessionId }).then(r => r.data);

export const getAutoApplyResults = (sessionId: string) =>
  api.get(`/auto-apply/results/${sessionId}`).then(r => r.data);

export const getResumeGaps = (sessionId: string) =>
  api.post('/auto-apply/gaps', { sessionId }).then(r => r.data);

export const getProjectSuggestions = (sessionId: string) =>
  api.post('/auto-apply/projects', { sessionId }).then(r => r.data);

// ── Module 7 — Mission Control ───────────────────────────────────────────
export const getMissionControlStatus = (userId: string) =>
  api.get(`/mission-control/status/${userId}`).then(r => r.data);

export const syncMissionControl = (userId: string) =>
  api.post(`/mission-control/sync/${userId}`, {}).then(r => r.data);

// ── Health ───────────────────────────────────────────────────────────────────
export const health = () => api.get('/health').then(r => r.data);

// ── Google Calendar (direct — uses OAuth access token stored in sessionStorage) ──
export interface GCalEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  colorId?: string;
  htmlLink?: string;
  source: 'gcal' | 'classroom' | 'holiday';
}

/** Fetch events from a Google Calendar calendar by calendarId */
async function _fetchCalendarEvents(
  calendarId: string,
  accessToken: string,
  source: GCalEvent['source'],
  params?: Record<string, string>,
): Promise<GCalEvent[]> {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const defaults = {
    maxResults: '100',
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: new Date(Date.now() - 7 * 86400000).toISOString(), // 7 days ago
    timeMax: new Date(Date.now() + 90 * 86400000).toISOString(), // 90 days ahead
  };
  const query = new URLSearchParams({ ...defaults, ...params });
  const res = await fetch(`${base}?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.items as any[]) || []).map(e => ({ ...e, source }));
}

// ── Frontend Optimisation Helpers ──────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = sessionStorage.getItem(key);
  if (cached) {
    const { data, expiry } = JSON.parse(cached);
    if (Date.now() < expiry) return data;
  }
  const data = await fetcher();
  sessionStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + CACHE_TTL }));
  return data;
}

/** Fetch user's primary Google Calendar events (Cached) */
export async function fetchGoogleCalendarEvents(accessToken: string): Promise<GCalEvent[]> {
  return fetchWithCache('cache_gcal_events', () => _fetchCalendarEvents('primary', accessToken, 'gcal'));
}

/** Fetch Indian public holidays (Cached) */
export async function fetchIndianHolidays(accessToken: string): Promise<GCalEvent[]> {
  return fetchWithCache('cache_indian_holidays', () => 
    _fetchCalendarEvents('en.indian#holiday@group.v.calendar.google.com', accessToken, 'holiday')
  );
}


/** Fetch Google Classroom coursework deadlines (Optimised Batching + Filter) */
export async function fetchClassroomDeadlines(accessToken: string): Promise<GCalEvent[]> {
  const fetcher = async () => {
    try {
      const coursesRes = await fetch(
        'https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=15',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!coursesRes.ok) return [];
      const { courses = [] } = await coursesRes.json();

      const all: GCalEvent[] = [];
      const activeCourses = courses.slice(0, 8); // Limit to top 8 active courses
      
      // Process in batches of 4 to avoid hitting rate limits (429)
      for (let i = 0; i < activeCourses.length; i += 4) {
        const batch = activeCourses.slice(i, i + 4);
        const results = await Promise.all(
          batch.map(async (course: any) => {
            const cwRes = await fetch(
              `https://classroom.googleapis.com/v1/courses/${course.id}/courseWork?courseWorkStates=PUBLISHED&pageSize=10`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
            );
            if (!cwRes.ok) return [];
            const { courseWork = [] } = await cwRes.json();
            return { course, courseWork };
          })
        );

        for (const { course, courseWork } of results) {
          for (const cw of courseWork) {
            if (!cw.dueDate) continue;
            const { year, month, day } = cw.dueDate;
            
            // Filter: Only include deadlines from the current year and near the current date
            const now = new Date();
            if (year < now.getFullYear()) continue;
            
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            all.push({
              id: cw.id,
              summary: `📚 ${cw.title} (${course.name})`,
              description: cw.description,
              start: { date: dateStr },
              end: { date: dateStr },
              source: 'classroom',
              htmlLink: cw.alternateLink,
            });
          }
        }
        // Small delay between batches if needed, but sequential loop is usually enough throttle
      }
      return all;
    } catch {
      return [];
    }
  };

  return fetchWithCache('cache_classroom_deadlines', fetcher);
}

export default api;