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
            {isLogin ? "Don't have an account? Sign up →" : 'Already have an account? Sign in →'}
          </button>
        </div>

        <div className="tc-pills">
          <span className="tc-pill">🔒 secure auth</span>
          <span className="tc-pill">🛠️ personal workspace</span>
          <span className="tc-pill">🌍 global access</span>
        </div>
      </div>
    </div>
  );
}