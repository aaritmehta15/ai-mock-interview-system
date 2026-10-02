import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { InterviewProvider } from './context/InterviewContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Tour from './pages/Tour';
import Dashboard from './pages/Dashboard';
import Intake from './pages/Intake';
import Personas from './pages/Personas';
import Interview from './pages/Interview';
import Evaluation from './pages/Evaluation';
import History from './pages/History';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <InterviewProvider>
            <BrowserRouter>
              <Routes>
              {/* Standalone Gateway & Tour Pages */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/tour" element={<Tour />} />

              {/* Progressive Studio Workspace with Sidebar */}
              <Route element={<Layout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/setup" element={<Intake />} />
                <Route path="/intake" element={<Intake />} />
                <Route path="/history" element={<History />} />
                <Route path="/personas" element={<Personas />} />
                <Route path="/interview" element={<Interview />} />
                <Route path="/evaluation" element={<Evaluation />} />
                <Route path="/evaluation/:sessionId" element={<Evaluation />} />
              </Route>

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </InterviewProvider>
      </AuthProvider>
    </ThemeProvider>
  </ErrorBoundary>
  );
}
