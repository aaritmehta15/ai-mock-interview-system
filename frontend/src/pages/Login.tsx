import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mic, ShieldCheck, Zap, ArrowRight, Sparkles, Terminal, CheckCircle2 } from 'lucide-react';

export default function Login() {
  const { user, signInWithGoogle, fastPassLogin } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user) {
      navigate('/tour');
    }
  }, [user, navigate]);

  const handleFastPass = (role: string) => {
    fastPassLogin(role);
    navigate('/tour');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at 50% 10%, #151928 0%, #08090d 70%)',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient background blur */}
      <div
        style={{
          position: 'absolute',
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 500,
          height: 350,
          background: 'rgba(99, 102, 241, 0.12)',
          filter: 'blur(120px)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />

      <div style={{ maxWidth: 480, width: '100%', zIndex: 10 }}>
        {/* Brand Icon & Title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 0 32px rgba(79, 70, 229, 0.5)',
              marginBottom: 16,
            }}
          >
            <Mic size={28} />
          </div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 800,
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: '-0.03em',
              marginBottom: 8,
            }}
          >
            APEX INTERVIEW OS
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>
            Autonomous Real-Time Technical Voice Assessment for Senior & Staff Engineers
          </p>
        </div>

        {/* Access Gateway Card */}
        <div
          className="studio-card"
          style={{
            padding: 32,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(14, 17, 24, 0.85)',
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <span
              className="status-pill status-pill-cyan"
              style={{ marginBottom: 12, display: 'inline-flex' }}
            >
              <Sparkles size={12} />
              PROGRESSIVE ONBOARDING GATEWAY
            </span>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
              Welcome to the Assessment Suite
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
              Choose your authentication pathway. For instant evaluation and portfolio inspection, use the 0-Friction Fast-Pass.
            </p>
          </div>

          {/* 1-Click Fast Pass Demo Section */}
          <div
            style={{
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Zap size={16} color="#818cf8" />
              <span style={{ fontWeight: 600, fontSize: 13, color: '#c7d2fe' }}>
                Recruiter & Evaluator Fast-Pass
              </span>
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14, lineHeight: 1.4 }}>
              Enter immediately with a pre-configured Staff Candidate profile to tour the site and test the live voice engine.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => handleFastPass('Staff Systems Candidate')}
                className="btn-primary"
                style={{ flex: 1, fontSize: 12, padding: '8px 12px' }}
              >
                <span>Staff Systems Fast-Pass</span>
                <ArrowRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleFastPass('Senior ML Candidate')}
                className="btn-secondary"
                style={{ flex: 1, fontSize: 12, padding: '8px 12px' }}
              >
                <span>ML Fast-Pass</span>
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              margin: '20px 0',
              color: '#475569',
              fontSize: 12,
            }}
          >
            <div style={{ flex: 1, height: 1, background: 'rgba(255, 255, 255, 0.08)' }} />
            <span>OR AUTHENTICATE VIA GOOGLE</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255, 255, 255, 0.08)' }} />
          </div>

          {/* Google Sign-in Button */}
          <button
            type="button"
            onClick={signInWithGoogle}
            className="btn-secondary"
            style={{
              width: '100%',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google Workspace
          </button>

          {/* System Guarantees Footer */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#64748b' }}>
              <ShieldCheck size={14} color="#10b981" />
              <span>Zero-Hallucination Append-Only SQLite Ledger</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#64748b' }}>
              <Terminal size={14} color="#38bdf8" />
              <span>Full-Duplex WebRTC LiveKit Agents & Gemini Live</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#64748b' }}>
              <CheckCircle2 size={14} color="#a78bfa" />
              <span>Staff Hiring Committee Binary Assertion Grading</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
