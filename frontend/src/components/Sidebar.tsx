import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Zap, Mic, Brain, FileSearch,
  LogOut, ChevronRight, Award, User, Sun, Moon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const nav = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/profile',    icon: User,            label: 'Profile' },
  { to: '/priority',   icon: Zap,             label: 'Priority Engine' },
  { to: '/interview',  icon: Mic,             label: 'Mock Interview' },
  { to: '/prep',       icon: Brain,           label: 'Company Prep' },
  { to: '/apply',      icon: FileSearch,      label: 'Auto Apply' },
  { to: '/mission',    icon: Award,           label: 'Mission Control' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);

  const handleLogout = async () => { await logout(); navigate('/'); };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 16 }}>
            SZ
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>WELCOME BACK</div>
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)' }}>Shaikh Zamee</h1>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px 10px' }}>
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
            {({ isActive }) => (
              <div className={`nav-item ${isActive ? 'active' : ''}`}>
                <div className="nav-icon-box">
                  <Icon size={15} color={isActive ? 'var(--accent)' : 'var(--text-3)'} />
                </div>
                <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, flex: 1 }}>{label}</span>
                {isActive && <ChevronRight size={13} color="var(--text-3)" />}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border)' }}>
        {/* User card */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 8 }}>
            {user.photoURL && !imgError
              ? <img src={user.photoURL} alt="" onError={() => setImgError(true)} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>{user.displayName?.[0] || 'U'}</div>
            }
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.displayName}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
            </div>
          </div>
        )}

        {/* Theme toggle + Sign out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={toggleTheme} className="theme-toggle" title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {user && (
            <button onClick={handleLogout} className="btn btn-ghost" style={{ flex: 1, justifyContent: 'flex-start', fontSize: 13, padding: '8px 12px', gap: 8 }}>
              <LogOut size={14} /> Sign out
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
