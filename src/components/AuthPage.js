// src/components/AuthPage.js
import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import './AuthPage.css';

export default function AuthPage({ onAuthSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const fn = isLogin ? signInWithEmailAndPassword : createUserWithEmailAndPassword;
      const { user } = await fn(auth, email, password);
      onAuthSuccess(user);
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsLogin(v => !v);
    setError(null);
  };

  return (
    <div className="tc-root">
      <div className="tc-noise" />
      <div className="tc-glow" />
      <div className="tc-glow2" />

      <div className="tc-card">
        <div className="tc-wordmark">
          <span className="tog">tog</span>
          <span className="code">code</span>
        </div>
        <p className="tc-tag">
          {isLogin ? '// welcome back — sign in to continue' : '// create an account to start coding'}
        </p>
        <div className="tc-divider" />

        <div className="tc-toggle-row">
          <button className={`tc-toggle-btn ${isLogin ? 'active' : ''}`} onClick={() => { setIsLogin(true); setError(null); }}>Sign In</button>
          <button className={`tc-toggle-btn ${!isLogin ? 'active' : ''}`} onClick={() => { setIsLogin(false); setError(null); }}>Create Account</button>
        </div>

        <div className="tc-form">
          <input
            className={`tc-input ${error ? 'error' : ''}`}
            type="email" placeholder="email@address.com"
            value={email} onChange={e => { setEmail(e.target.value); setError(null); }}
            autoComplete="email" autoFocus
          />
          <input
            className={`tc-input ${error ? 'error' : ''}`}
            type="password" placeholder="••••••••"
            value={password} onChange={e => { setPassword(e.target.value); setError(null); }}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            minLength={6}
          />

          {error && <div className="tc-error">// {error}</div>}

          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={loading || !email || !password}
          >
            {loading
              ? <><span className="spinner" /> Processing...</>
              : isLogin ? 'Sign In' : 'Create Account'}
          </button>

          <button className="btn-ghost" onClick={switchMode}>
            {isLogin ? (
              <>
                Don't have an account? Sign up
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '6px' }}>
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </>
            ) : (
              <>
                Already have an account? Sign in
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '6px' }}>
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </>
            )}
          </button>
        </div>

        <div className="tc-pills">
          <span className="tc-pill">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            secure auth
          </span>
          <span className="tc-pill">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a2 2 0 0 1-2.14-.32 2 2 0 0 1-.32-2.14z"/>
              <path d="M10.2 3.7a2 2 0 0 1 2.14.32 2 2 0 0 1 .32 2.14L9 10l-2.12 2.12a2 2 0 0 0 0 2.83l.05.05a2 2 0 0 1 0 2.83l-1.41 1.42a2 2 0 0 1-2.83 0L1.27 18a2 2 0 0 1 0-2.83l1.42-1.41a2 2 0 0 1 2.83 0l.05.05a2 2 0 0 0 2.83 0L10.5 11l3.77-3.77z"/>
            </svg>
            personal workspace
          </span>
          <span className="tc-pill">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            global access
          </span>
        </div>
      </div>
    </div>
  );
}