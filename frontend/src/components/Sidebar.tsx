import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Mic,
  LayoutDashboard,
  Layers,
  LogOut,
  LogIn,
  Activity,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/interview', icon: Mic, label: 'Voice Studio', badge: 'LiveKit' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Candidate Dashboard' },
  { to: '/', icon: Layers, label: 'System Architecture' },
];

export default function Sidebar() {
  const { user, signInWithGoogle, logout } = useAuth();
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const initials = user?.displayName
    ? user.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'RC'; // Recruiter / Candidate

  return (
    <aside
      style={{
        width: 260,
        height: '100vh',
        background: '#0a0d14',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div>
        {/* Brand Header */}
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 0 16px rgba(79, 70, 229, 0.4)',
              }}
            >
              <Mic size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 800,
                    fontSize: 16,
                    color: '#f8fafc',
                    letterSpacing: '-0.02em',
                  }}
                >
                  DAAZLING
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#818cf8',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 600,
                  }}
                >
                  v2.2
                </span>
              </div>
              <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>
                Evidence-Grounded Voice AI
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '6px 10px',
            }}
          >
            Engineering Suite
          </span>
          {NAV_ITEMS.map(({ to, icon: Icon, label, badge }) => (
            <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: isActive ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                    border: isActive ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                    color: isActive ? '#f8fafc' : '#94a3b8',
                    transition: 'all 0.15s ease',
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={16} color={isActive ? '#818cf8' : '#64748b'} />
                  <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 500, flex: 1 }}>
                    {label}
                  </span>
                  {badge && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 99,
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#10b981',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {badge}
                    </span>
                  )}
                  {isActive && <ChevronRight size={14} color="#818cf8" />}
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Telemetry Status Box */}
        <div style={{ padding: '0 12px', marginTop: 12 }}>
          <div
            style={{
              padding: 12,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#10b981',
                    boxShadow: '0 0 8px #10b981',
                  }}
                />
                LiveKit Cloud
              </span>
              <span style={{ color: '#10b981', fontWeight: 600 }}>Active</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={12} color="#818cf8" />
                Turn Ledger
              </span>
              <span style={{ color: '#818cf8', fontWeight: 600 }}>0-Phantom</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={12} color="#38bdf8" />
                LangGraph
              </span>
              <span style={{ color: '#38bdf8', fontWeight: 600 }}>Cyclical</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Profile / Auth / Guest Status */}
      <div style={{ padding: 14, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            {user.photoURL && !imgError ? (
              <img
                src={user.photoURL}
                alt=""
                onError={() => setImgError(true)}
                style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#fff',
                }}
              >
                {initials}
              </div>
            )}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#f8fafc',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.displayName || 'Engineer'}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: '#64748b',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.email}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Session Mode</span>
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.25)', fontFamily: "'JetBrains Mono', monospace" }}>
                Guest Recruiter
              </span>
            </div>
            <button
              onClick={signInWithGoogle}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f1f5f9',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <LogIn size={13} color="#818cf8" />
              Sign in with Google
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
