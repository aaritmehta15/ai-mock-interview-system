import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import PriorityEngine from './pages/PriorityEngine';
import Interview from './pages/Interview';
import CompanyPrep from './pages/CompanyPrep';
import AutoApply from './pages/AutoApply';
import MissionControl from './pages/MissionControl';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/"  element={<Landing />} />
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile"   element={<Profile />} />
              <Route path="/priority"  element={<PriorityEngine />} />
              <Route path="/interview" element={<Interview />} />
              <Route path="/prep"      element={<CompanyPrep />} />
              <Route path="/apply"     element={<AutoApply />} />
              <Route path="/mission"   element={<MissionControl />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
