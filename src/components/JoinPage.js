// src/components/JoinPage.js
import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ref, get } from 'firebase/database';
import { db } from '../lib/firebase';
import './JoinPage.css';

// ─── Security helpers ─────────────────────────────────────────────────────────

/** Strip non-alphanumeric, force uppercase, cap at 8 */
const sanitizeRoomCode = (val) =>
  val.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);

/** Strip XSS chars, cap at 64 */
const sanitizeDisplayName = (val) =>
  val.replace(/[<>"'&]/g, '').slice(0, 64);

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const ArrowRight = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);

const ArrowLeft = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);

const LogoutIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const StarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const SidebarIcons = {
  Chat: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  Book: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  ),
  Info: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  ),
  Phone: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.26 12 19.79 19.79 0 0 1 1.19 3.4 2 2 0 0 1 3.16 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  Shield: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  Activity: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  Settings: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
};

export default function JoinPage({ user, onLogout, onJoin, initialMode = null }) {
  const [name,     setName]     = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode,     setMode]     = useState(initialMode);
  const [currentView, setCurrentView] = useState('home');
  const [animKey,  setAnimKey]  = useState(0);
  const [ping,     setPing]     = useState(24);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const nameRef   = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (mode && nameRef.current) nameRef.current.focus();
  }, [mode]);

  // Fluctuate ping for realism
  useEffect(() => {
    const id = setInterval(() => {
      setPing(prev => Math.max(12, Math.min(48, prev + (Math.random() > 0.5 ? 2 : -2))));
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // Interactive background nodes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let width  = canvas.width  = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const mouse = { x: null, y: null, radius: 150 };
    const count = 40;
    const particles = [];

    class Particle {
      constructor() {
        this.x = this.baseX = Math.random() * width;
        this.y = this.baseY = Math.random() * height;
        this.size = Math.random() * 2 + 1;
        this.density = Math.random() * 30 + 1;
      }
      draw() {
        ctx.fillStyle = 'rgba(0,122,255,0.35)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
      update() {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius) {
          const force = (mouse.radius - dist) / mouse.radius;
          this.x -= (dx / dist) * force * this.density;
          this.y -= (dy / dist) * force * this.density;
        } else {
          if (this.x !== this.baseX) this.x -= (this.x - this.baseX) / 20;
          if (this.y !== this.baseY) this.y -= (this.y - this.baseY) / 20;
        }
      }
    }

    const init = () => {
      particles.length = 0;
      for (let i = 0; i < count; i++) particles.push(new Particle());
    };

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      particles.forEach(p => { p.update(); p.draw(); });
      animId = requestAnimationFrame(animate);
    };

    init();
    animate();

    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onResize = () => {
      width  = canvas.width  = window.innerWidth;
      height = canvas.height = window.innerHeight;
      init();
    };

    // Use passive listeners
    window.addEventListener('mousemove', onMove,   { passive: true });
    window.addEventListener('resize',    onResize, { passive: true });
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize',    onResize);
    };
  }, []);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const transition = (next) => { setAnimKey(k => k + 1); setMode(next); };

  const handleCreate = () => {
    const safeName = sanitizeDisplayName(name.trim());
    if (!safeName) return;
    onJoin(uuidv4().slice(0, 8).toUpperCase(), safeName, true);
  };

  const handleJoin = async () => {
    const safeName = sanitizeDisplayName(name.trim());
    const safeCode = sanitizeRoomCode(roomCode);
    if (!safeName || !safeCode) return;

    setLoading(true);
    setError('');

    try {
      const roomRef = ref(db, `rooms/${safeCode}`);
      const snapshot = await get(roomRef);
      if (!snapshot.exists()) {
        setError('Invalid session code');
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error('Room validation error:', err);
      setError('Error verifying code');
      setLoading(false);
      return;
    }

    onJoin(safeCode, safeName, false);
  };

  const canProceed = sanitizeDisplayName(name.trim()) &&
    (mode === 'create' || sanitizeRoomCode(roomCode)) && !loading;

  return (
    <div className="tc-root">
      <canvas ref={canvasRef} className="tc-canvas" aria-hidden="true" />
      <div className="tc-noise" />
      <div className="tc-glow" />
      <div className="tc-glow2" />

      <header className="tc-dashboard-header">
        <div className="tc-user-chip">
          <div
            className="tc-user-avatar"
            style={{ backgroundColor: 'rgba(0,122,255,0.18)', color: '#007AFF' }}
            aria-hidden="true"
          >
            {user?.email?.[0]?.toUpperCase()}
          </div>
          <div className="tc-user-info">
            <span className="tc-user-email">{user?.email}</span>
            <span className="tc-user-status">authenticated session</span>
          </div>
        </div>

        <div className="tc-system-health" aria-label="System status">
          <div className="health-dot pulse" />
          <div className="health-info">
            <span className="health-label">REALTIME ENGINE: OPERATIONAL</span>
            <span className="health-ping">Latency: {ping}ms</span>
          </div>
        </div>

        <button className="tc-logout-btn" onClick={onLogout} aria-label="Logout">
          <LogoutIcon />
          Logout
        </button>
      </header>

      <div className="tc-layout-wrapper">
        <div className="sidebar tc-join-sidebar">
          <div className="sidebar-group">
            <span className="sidebar-label">Intelligence</span>
            <button className={`sidebar-item ${currentView === 'home' ? 'active' : ''}`} onClick={() => setCurrentView('home')}>
              <SidebarIcons.Chat /> Join / Create Suite
            </button>
          </div>

          <div className="sidebar-group">
            <span className="sidebar-label">Product</span>
            <button className={`sidebar-item ${currentView === 'docs' ? 'active' : ''}`} onClick={() => setCurrentView('docs')}>
              <SidebarIcons.Book /> Documentation
            </button>
            <button className={`sidebar-item ${currentView === 'about' ? 'active' : ''}`} onClick={() => setCurrentView('about')}>
              <SidebarIcons.Info /> Learn more
            </button>
          </div>

          <div className="sidebar-group">
            <span className="sidebar-label">Support</span>
            <button className={`sidebar-item ${currentView === 'support' ? 'active' : ''}`} onClick={() => setCurrentView('support')}>
              <SidebarIcons.Phone /> Chat with us
            </button>
            <button className={`sidebar-item ${currentView === 'policies' ? 'active' : ''}`} onClick={() => setCurrentView('policies')}>
              <SidebarIcons.Shield /> Policies
            </button>
            <button className={`sidebar-item ${currentView === 'status' ? 'active' : ''}`} onClick={() => setCurrentView('status')}>
              <SidebarIcons.Activity /> Status
            </button>
          </div>

          <div className="sidebar-group">
            <span className="sidebar-label">System</span>
            <button className={`sidebar-item ${currentView === 'settings' ? 'active' : ''}`} onClick={() => setCurrentView('settings')}>
              <SidebarIcons.Settings /> Settings
            </button>
          </div>
        </div>

        <div className="tc-card" style={currentView !== 'home' ? { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', justifyContent: 'center' } : {}}>
          {currentView === 'home' ? (
            <>
              <div className="tc-greeting">
                {getGreeting()}, <span className="user-name">{user?.email?.split('@')[0]}</span>
              </div>
              <div className="tc-wordmark">
          <span className="tog">tog</span>
          <span className="code">code</span>
          <span className="ai">AI</span>
        </div>
              <p className="tc-tag">{'// '}intelligence suite command center</p>

              <div className="tc-insights-grid" aria-label="Stats">
                <div className="insight-card">
                  <span className="insight-val">128</span>
                  <span className="insight-lbl">Intelligence IQ</span>
                </div>
                <div className="insight-card">
                  <span className="insight-val">2.4k</span>
                  <span className="insight-lbl">Global Messages</span>
                </div>
              </div>

              <div className="tc-divider" />

              <div key={animKey} className="tc-view">
                {!mode && (
                  <div className="tc-actions">
                    <button className="btn-primary" onClick={() => transition('create')}>
                      Create new suite <ArrowRight />
                    </button>
                    <button className="btn-secondary" onClick={() => transition('join')}>
                      Join existing room
                    </button>
                  </div>
                )}

                {mode && (
                  <div className="tc-form">
                    <input
                      ref={nameRef}
                      className="tc-input"
                      placeholder="display_name"
                      value={name}
                      onChange={e => setName(sanitizeDisplayName(e.target.value))}
                      autoComplete="off"
                      aria-label="Display name"
                      maxLength={64}
                      disabled={loading}
                    />
                    {mode === 'join' && (
                      <input
                        className={`tc-input ${error ? 'error-border' : ''}`}
                        placeholder="ROOM_CODE"
                        value={roomCode}
                        onChange={e => {
                          setRoomCode(sanitizeRoomCode(e.target.value));
                          setError('');
                        }}
                        maxLength={8}
                        autoComplete="off"
                        aria-label="Room code"
                        disabled={loading}
                      />
                    )}
                    {error && mode === 'join' && (
                      <div className="tc-error-msg">{error}</div>
                    )}
                    <div className="tc-form-row">
                      <button className="btn-ghost" onClick={() => { transition(null); setError(''); }} aria-label="Go back">
                        <ArrowLeft /> back
                      </button>
                      <button
                        className="btn-primary btn-inline"
                        onClick={mode === 'create' ? handleCreate : handleJoin}
                        disabled={!canProceed}
                      >
                        {loading ? 'Verifying...' : (mode === 'create' ? <>Launch suite <ArrowRight /></> : <>Enter room <ArrowRight /></>)}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="tc-ticker">
                <div className="ticker-sparkle"><StarIcon /></div>
                <div className="ticker-content">Try asking AI to 'Analyze the architecture' of your room's history.</div>
              </div>

              <div className="tc-pills" style={{ marginTop: '1rem' }}>
                <span className="tc-pill">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  dynamic sync
                </span>
                <span className="tc-pill">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                    <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>
                    <path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
                  </svg>
                  Intelligence AI
                </span>
                <span className="tc-pill">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  live collab
                </span>
              </div>
            </>
          ) : (
            <div className="placeholder-view" style={{ background: 'transparent', boxShadow: 'none', border: 'none', padding: '20px' }}>
              {currentView === 'docs' && (
                <>
                  <h2>Documentation</h2>
                  <p>Intelligence Suite technical specifications and guides are coming soon.</p>
                </>
              )}
              {currentView === 'about' && (
                <div className="tc-card" onClick={e => e.stopPropagation()}>
                  <h2>About Togcode AI</h2>
                  <p>Togcode AI is a real-time collaborative coding platform with AI-powered assistance built by Musab.</p>
                </div>
              )}
              {currentView === 'support' && (
                <>
                  <h2>Contact & Support</h2>
                  <p>For support or inquiries, contact musabimp.0@gmail.com</p>
                </>
              )}
              {currentView === 'policies' && (
                <>
                  <h2>Policies</h2>
                  <p>Terms of service and privacy policies.</p>
                </>
              )}
              {currentView === 'status' && (
                <>
                  <h2>System Status</h2>
                  <p>All core systems operational. Realtime engine is connected.</p>
                </>
              )}
              {currentView === 'settings' && (
                <>
                  <h2>Settings</h2>
                  <p>Please launch or join a suite to access advanced settings.</p>
                </>
              )}
              <button className="btn-secondary" onClick={() => setCurrentView('home')} style={{ marginTop: '30px', maxWidth: '200px' }}>
                <ArrowLeft /> Return to Suite
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}