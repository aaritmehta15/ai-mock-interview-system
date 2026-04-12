import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Zap, Mic, Brain, FileSearch,
  LogOut, ChevronRight, Sparkles, User
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const nav = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard',       color: '#7c3aed' },
  { to: '/profile',    icon: User,            label: 'Profile',         color: '#3b82f6' },
  { to: '/priority',   icon: Zap,             label: 'Priority Engine', color: '#06b6d4' },
  { to: '/interview',  icon: Mic,             label: 'Mock Interview',  color: '#a855f7' },
  { to: '/prep',       icon: Brain,           label: 'Company Prep',    color: '#10b981' },
  { to: '/apply',      icon: FileSearch,      label: 'Auto Apply',      color: '#f59e0b' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => { await logout(); navigate('/'); };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg,#7c3aed,#06b6d4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(124,58,237,0.4)',
          }}>
            <Sparkles size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 16, color: 'var(--text)', letterSpacing: '-0.02em' }}>DAAZLING</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em' }}>AI PLACEMENT OS</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px' }}>
        {nav.map(({ to, icon: Icon, label, color }) => (
          <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
            {({ isActive }) => (
              <motion.div
                whileHover={{ x: 3 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10, marginBottom: 2,
                  background: isActive ? 'rgba(124,58,237,0.15)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(124,58,237,0.3)' : 'transparent'}`,
                  color: isActive ? 'var(--text)' : 'var(--text-2)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: isActive ? `${color}22` : 'var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={15} color={isActive ? color : 'var(--text-3)'} />
                </div>
                <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, flex: 1 }}>{label}</span>
                {isActive && <ChevronRight size={13} color="var(--text-3)" />}
              </motion.div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      {user && (
        <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 6 }}>
            {user.photoURL
              ? <img src={user.photoURL} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--violet)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>{user.displayName?.[0] || 'U'}</div>
            }
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.displayName}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
            </div>
          </div>
          <motion.button whileHover={{ x: 2 }} onClick={handleLogout} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 13, padding: '8px 12px', gap: 8 }}>
            <LogOut size={14} /> Sign out
          </motion.button>
        </div>
      )}
    </aside>
  );
}
