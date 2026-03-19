// src/components/AuthPage.js
import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import './AuthPage.css';

// ─── Security helpers ─────────────────────────────────────────────────────────

/** Minimal client-side email sanity check (not a full validator) */
function looksLikeEmail(str) {
  return typeof str === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
}

/** Strip Firebase error codes and "Firebase: " prefix from messages */
function sanitizeAuthError(msg) {
  let cleanedMsg = msg
    .replace(/^Firebase:\s*/i, '') // Remove "Firebase: " prefix
    .replace(/\s*\(auth\/[^)]*\)/g, '') // Remove "(auth/...)" code
    .trim();

  // If the cleaned message is just "Error", "Error.", or empty, provide a more generic message.
  if (cleanedMsg === 'Error' || cleanedMsg === 'Error.' || cleanedMsg === '') {
    return 'Authentication failed. Please try again.';
  }

  return cleanedMsg;
}

export default function AuthPage({ onAuthSuccess }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [isLogin,  setIsLogin]  = useState(true);
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async () => {
    setError(null);

    // Client-side pre-checks (saves a round-trip)
    if (!looksLikeEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const fn = isLogin ? signInWithEmailAndPassword : createUserWithEmailAndPassword;
      const { user } = await fn(auth, email.trim(), password);
      onAuthSuccess(user);
    } catch (err) {
      console.error('[AuthPage] Auth error details:', err);
      setError(sanitizeAuthError(err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const switchMode = () => { setIsLogin(v => !v); setError(null); };

  const ArrowRight = () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );

  return (
    <div className="tc-root">
      <div className="tc-noise" />
      <div className="tc-glow" />
      <div className="tc-glow2" />

      <div className="tc-card">
        <div className="tc-wordmark">
          <span className="tog">tog</span>
          <span className="code">code</span>
          <span className="ai">AI</span>
        </div>
        <p className="tc-tag">
          {isLogin ? '// welcome back — sign in to continue' : '// create an account to start coding'}
        </p>
        <div className="tc-divider" />

        <div className="tc-toggle-row" role="tablist" aria-label="Authentication mode">
          <button
            className={`tc-toggle-btn ${isLogin ? 'active' : ''}`}
            role="tab"
            aria-selected={isLogin}
            onClick={() => { setIsLogin(true); setError(null); }}
          >
            Sign In
          </button>
          <button
            className={`tc-toggle-btn ${!isLogin ? 'active' : ''}`}
            role="tab"
            aria-selected={!isLogin}
            onClick={() => { setIsLogin(false); setError(null); }}
          >
            Create Account
          </button>
        </div>

        <div className="tc-form">
          <input
            className={`tc-input ${error ? 'error' : ''}`}
            type="email"
            placeholder="email@address.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            autoComplete="email"
            autoFocus
            aria-invalid={!!error}
            aria-label="Email address"
            disabled={loading}
          />
          <input
            className={`tc-input ${error ? 'error' : ''}`}
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            minLength={6}
            aria-invalid={!!error}
            aria-label="Password"
            disabled={loading}
          />

          {error && (
            <div className="tc-error" role="alert" aria-live="assertive">
              // {error}
            </div>
          )}

          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={loading || !email || !password}
            aria-busy={loading}
          >
            {loading
              ? <><span className="spinner" /> Processing…</>
              : isLogin ? 'Sign In' : 'Create Account'
            }
          </button>

          <button className="btn-ghost" onClick={switchMode}>
            {isLogin
              ? <>Don't have an account? Sign up<ArrowRight /></>
              : <>Already have an account? Sign in<ArrowRight /></>
            }
          </button>
        </div>

        <div className="tc-pills">
          <span className="tc-pill">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            secure auth
          </span>
          <span className="tc-pill">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
            personal workspace
          </span>
          <span className="tc-pill">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            global access
          </span>
        </div>
      </div>
    </div>
  );
}