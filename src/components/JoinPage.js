import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ref, get } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { db } from '../lib/firebase';
import { auth } from '../lib/firebase';
import { useThemeContext } from '../hooks/useTheme';
import './JoinPage.css';

const sanitizeRoomCode = (val) => val.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);
const sanitizeDisplayName = (val) => val.replace(/[<>"'&]/g, '').slice(0, 64);

const stackItems = [
  { label: 'Platform', value: 'React 19 + Firebase' },
  { label: 'System Stack', value: 'Intelligence Core' },
  { label: 'Inference', value: 'Cerebras Inference' },
];

const statusItems = [
  { label: 'Realtime DB', value: 'OPERATIONAL', accent: true },
  { label: 'AI Backend', value: 'STABLE', accent: true },
  { label: 'Uptime', value: '99.98%', accent: true },
];

const contactItems = [
  { label: 'Email', value: 'musabimp.0@gmail.com', href: 'mailto:musabimp.0@gmail.com' },
  { label: 'GitHub', value: '03musab', href: 'https://github.com/03musab' },
  { label: 'Discord', value: 'Status: Coming Soon', disabled: true },
];

export default function JoinPage({ user, onJoin, onLogout, initialMode = null }) {
  const [mode, setMode] = useState(initialMode || 'create');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasAuthenticatedSession, setHasAuthenticatedSession] = useState(!!user?.email);
  const [pingMs, setPingMs] = useState(16);
  const { theme, toggleTheme } = useThemeContext();

  const sessionEmail = user?.email || 'test@gmail.com';
  const displayName = user?.email?.split('@')[0] || 'test';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setHasAuthenticatedSession(!!authUser?.email);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const measurePing = async () => {
      const start = performance.now();

      try {
        // Measure real network round-trip instead of a local Firebase cached variable
        await fetch(window.location.origin + '/?ping=' + Date.now(), { 
          method: 'HEAD', 
          cache: 'no-store' 
        });
        if (!cancelled) {
          setPingMs(Math.max(1, Math.round(performance.now() - start)));
        }
      } catch (err) {
        if (!cancelled) {
          setPingMs(0);
        }
      }
    };

    measurePing();
    const id = setInterval(measurePing, 10000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const handleCreate = () => {
    const safeName = sanitizeDisplayName(name.trim());
    if (!safeName) {
      setError('Display name is required');
      return;
    }

    setLoading(true);
    setError('');
    setTimeout(() => {
      onJoin(uuidv4().slice(0, 8).toUpperCase(), safeName, true);
    }, 250);
  };

  const handleJoin = async () => {
    const safeName = sanitizeDisplayName(name.trim());
    const safeCode = sanitizeRoomCode(roomCode);

    if (!safeName) {
      setError('Display name is required');
      return;
    }
    if (!safeCode) {
      setError('Room code is required');
      return;
    }
    if (safeCode.length < 6) {
      setError('Invalid room code format');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const roomRef = ref(db, `rooms/${safeCode}`);
      const snapshot = await get(roomRef);

      if (!snapshot.exists()) {
        setError('Session code not found');
        setLoading(false);
        return;
      }

      onJoin(safeCode, safeName, false);
    } catch (err) {
      console.error('Room validation error:', err);
      if (err?.code === 'PERMISSION_DENIED') {
        setError('Permission denied for this room');
      } else {
        setError('Error connecting to servers');
      }
      setLoading(false);
    }
  };

  const submitAction = mode === 'join' ? handleJoin : handleCreate;

  return (
    <div className="command-shell">
      <div className="command-main command-main-full">
        <header className="command-topbar" id="top">
          <div className="command-brand">
            <img src="/logotg.png" alt="Togcode Logo" style={{ height: '26px' }} />
          </div>

          <div className="command-topbar-actions">
            <button className="command-icon-btn" onClick={toggleTheme} type="button" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
            <button className="command-icon-btn" onClick={onLogout} type="button" title="Logout">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </header>

        <main className="command-content">
          <section className="command-grid command-grid-hero" id="room-access">
            <article className="command-card command-card-large command-card-access">
              <h1 className="command-title">Togcode Ai, welcome back {displayName}</h1>
              <p className="command-copy">
                Create a new collaborative room or join an active session from
                Togcode Ai. This is your main launch surface for live engineering.
              </p>

              <div className="command-mode-toggle">
                <button
                  className={`command-mode-button ${mode === 'create' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMode('create');
                    setError('');
                  }}
                  type="button"
                >
                  Create Room
                </button>
                <button
                  className={`command-mode-button ${mode === 'join' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMode('join');
                    setError('');
                  }}
                  type="button"
                >
                  Join Room
                </button>
              </div>

              <div className="command-form">
                <label className="command-field">
                  <span className="command-field-label">Display Name</span>
                  <input
                    className="command-input"
                    value={name}
                    onChange={(e) => {
                      setName(sanitizeDisplayName(e.target.value));
                      setError('');
                    }}
                    placeholder="Enter your display name"
                    disabled={loading}
                  />
                </label>

                {mode === 'join' && (
                  <label className="command-field">
                    <span className="command-field-label">Room Code</span>
                    <input
                      className="command-input"
                      value={roomCode}
                      onChange={(e) => {
                        setRoomCode(sanitizeRoomCode(e.target.value));
                        setError('');
                      }}
                      placeholder="ROOMCODE"
                      disabled={loading}
                    />
                  </label>
                )}

                {error && <div className="command-error">{error}</div>}

                <button className="command-submit" onClick={submitAction} disabled={loading} type="button">
                  {loading ? 'Connecting...' : mode === 'join' ? 'Join Active Room' : 'Create New Room'}
                </button>
              </div>
            </article>

            <article className="command-card command-card-feature" id="documentation">
              <p className="command-kicker">Togcode Ai</p>
              <h2 className="command-card-title">Togcode Ai</h2>
              <p className="command-copy">
                Built to meet the demands of modern, distributed engineering, Togcode AI integrates real-time presence and adaptive orchestration into its core DNA.
                <br />
                <br />

                It collapses the distance between development and operations by centralizing system health, collaborative blueprints, and deployment awareness within a premium, grid-stabilized command center.
                <br />
                <br />
                The result is a frictionless ecosystem where teams can orchestrate complex logic and monitor system vitals simultaneously, all while maintaining a state of deep, uninterrupted flow.
              </p>
            </article>

            <article className="command-card command-card-native-ad">
              <div className="native-ad-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                Sponsored
              </div>
              <div className="native-ad-image">
                <img src="https://picsum.photos/seed/cerebras/1200/300" alt="Cerebras Cloud" />
                <div className="native-ad-image-overlay">
                  <div className="native-ad-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                      <polyline points="2 17 12 22 22 17"/>
                      <polyline points="2 12 12 17 22 12"/>
                    </svg>
                  </div>
                  <div className="native-ad-text">
                    <h3 className="native-ad-title">Cerebras Cloud</h3>
                    <p className="native-ad-description">Unlock the world's fastest AI inference. Powered by the largest wafer-scale processor for enterprise-scale workloads.</p>
                  </div>
                </div>
              </div>
              <div className="native-ad-actions">
                <a href="https://cerebras.net" target="_blank" rel="noopener noreferrer" className="native-ad-cta">
                  Learn More
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </a>
              </div>
            </article>
          </section>

          <section className="command-grid command-grid-two">
            <article className="command-card command-card-feature" id="realtime-sync">
              <p className="command-kicker">Realtime Sync</p>
              <h2 className="command-card-title">Signal Routing</h2>
              <p className="command-copy">
                Event streams remain synchronized across active rooms with low-latency state
                propagation and resilient session recovery.
              </p>
            </article>

            <article className="command-card command-card-feature" id="workflow-engine">
              <div className="command-section-head">
                <p className="command-kicker">Workflow Engine</p>
                <h2 className="command-section-title">Execution Layer</h2>
              </div>
              <p className="command-copy">
                Natural-language prompts, architecture analysis, and live collaboration are
                coordinated through a shared workflow plane designed for engineering teams.
              </p>
            </article>
          </section>

          <section className="command-section command-stack-section" id="ai-architecture">
            <div className="command-section-head command-stack-head">
              <p className="command-kicker">System Stack</p>
              <h2 className="command-section-title">Core Platform</h2>
            </div>
            <div className="command-grid command-grid-three command-stack-grid">
              {stackItems.map((item) => (
                <article key={item.label} className="command-card command-card-stat command-stack-card">
                  <p className="command-stat-label">{item.label}</p>
                  <p className="command-stat-value command-stack-value">{item.value}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="command-grid command-grid-two" id="live-collab">
            <article className="command-card command-contact-card">
              <div className="command-section-head">
                <p className="command-kicker">Contact Section</p>
                <h2 className="command-section-title">Team Access</h2>
              </div>
              <div className="command-list">
                {contactItems.map((item) => (
                  item.href ? (
                    <a
                      key={item.label}
                      className="command-list-item command-list-link"
                      href={item.href}
                      target={item.label === 'GitHub' ? '_blank' : undefined}
                      rel={item.label === 'GitHub' ? 'noopener noreferrer' : undefined}
                    >
                      <span className="command-list-label">{item.label}</span>
                      <span className="command-list-value">{item.value}</span>
                    </a>
                  ) : (
                    <div
                      key={item.label}
                      className={`command-list-item ${item.disabled ? 'is-disabled' : ''}`}
                    >
                      <span className="command-list-label">{item.label}</span>
                      <span className="command-list-value">{item.value}</span>
                    </div>
                  )
                ))}
              </div>
            </article>

            <article className="command-card">
              <div className="command-section-head">
                <p className="command-kicker">Live Collab</p>
                <h2 className="command-section-title">Shared Engineering Surface</h2>
              </div>
              <p className="command-copy">
                The platform serves as a multi-dimensional logic layer where engineering teams can collaboratively audit conceptual blueprints, orchestrate room-specific metadata, and ensure that every facet of system telemetry remains perfectly calibrated.
                <br />
                <br />
                By grounding all activity within a unified Universal Logic Schema, the command surface provides a 'single source of truth' that allows for instantaneous transpilation and real-time synchronization without ever breaking the user's operational focus.
              </p>
            </article>
          </section>

          <section className="command-grid command-grid-two">
            <article className="command-card">
              <div className="command-section-head">
                <p className="command-kicker">Policies Section</p>
                <h2 className="command-section-title">Privacy</h2>
              </div>
              <p className="command-copy">
                Session data is protected through scoped access controls, encrypted storage,
                and workspace-aware rules that limit visibility to authorized collaborators.
              </p>
            </article>

            <article className="command-card">
              <div className="command-section-head">
                <p className="command-kicker">Policies Section</p>
                <h2 className="command-section-title">Terms of Use</h2>
              </div>
              <p className="command-copy">
                Shared command spaces are designed for approved teams. Use room credentials
                responsibly and keep operational data inside trusted collaboration flows.
              </p>
            </article>
          </section>

          <section className="command-section">
            <div className="command-section-head">
              <p className="command-kicker">System Status Section</p>
              <h2 className="command-section-title">Operational Readout</h2>
            </div>
            <div className="command-grid command-grid-three">
              {statusItems.map((item) => (
                <article key={item.label} className="command-card command-card-status">
                  <p className="command-stat-label">{item.label}</p>
                  <p className={`command-status-value ${item.accent ? 'is-accent' : ''}`}>
                    {item.value}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
