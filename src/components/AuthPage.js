// src/components/AuthPage.js
import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function AuthPage({ onAuthSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        onAuthSuccess(userCredential.user);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        onAuthSuccess(userCredential.user);
      }
    } catch (err) {
      console.error("Auth error:", err);
      setError(err.message.replace('Firebase: ', ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="join-page">
      <div className="join-card auth-card">
        <div className="join-logo">
          <span className="logo-tog">tog</span>
          <span className="logo-code">code</span>
        </div>
        <p className="join-tagline">
          {isLogin ? 'Welcome back! Sign in to continue.' : 'Create an account to start coding.'}
        </p>

        <form className="join-form auth-form" onSubmit={handleSubmit}>
          <input
            className="join-input"
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            className="join-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {error && <div className="auth-error">{error}</div>}

          <div className="join-form-actions auth-actions">
            <button
              type="submit"
              className="btn-primary auth-submit-btn"
              disabled={loading}
            >
              {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Create Account'}
            </button>
            <button
              type="button"
              className="btn-ghost auth-switch-btn"
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
              }}
            >
              {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </button>
          </div>
        </form>

        <div className="join-features">
          <div className="feature-pill">🔒 Secure Auth</div>
          <div className="feature-pill">🛠️ Personal Workspace</div>
          <div className="feature-pill">🌍 Global Access</div>
        </div>
      </div>
    </div>
  );
}
