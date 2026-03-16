// src/components/JoinPage.js
import { useState, useRef, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import './JoinPage.css';

export default function JoinPage({ user, onLogout, onJoin }) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState(null);
  const [animKey, setAnimKey] = useState(0);
  const [ping, setPing] = useState(24);
  const nameRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (mode && nameRef.current) nameRef.current.focus();
  }, [mode]);

  // Fluctuate ping slightly for realism
  useEffect(() => {
    const interval = setInterval(() => {
      setPing(prev => Math.max(12, Math.min(48, prev + (Math.random() > 0.5 ? 2 : -2))));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Interactive Background Nodes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const particles = [];
    const particleCount = 40;
    const mouse = { x: null, y: null, radius: 150 };

    window.onmousemove = (e) => {
      mouse.x = e.x;
      mouse.y = e.y;
    };

    class Particle {
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.size = Math.random() * 2 + 1;
        this.baseX = this.x;
        this.baseY = this.y;
        this.density = (Math.random() * 30) + 1;
      }

      draw() {
        ctx.fillStyle = 'rgba(99, 88, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
      }

      update() {
        let dx = mouse.x - this.x;
        let dy = mouse.y - this.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        let forceDirectionX = dx / distance;
        let forceDirectionY = dy / distance;
        let maxDistance = mouse.radius;
        let force = (maxDistance - distance) / maxDistance;
        let directionX = forceDirectionX * force * this.density;
        let directionY = forceDirectionY * force * this.density;

        if (distance < mouse.radius) {
          this.x -= directionX;
          this.y -= directionY;
        } else {
          if (this.x !== this.baseX) {
            let dx = this.x - this.baseX;
            this.x -= dx / 20;
          }
          if (this.y !== this.baseY) {
            let dy = this.y - this.baseY;
            this.y -= dy / 20;
          }
        }
      }
    }

    function init() {
      particles.length = 0;
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
      }
    }

    function animate() {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
      }
      animationFrameId = requestAnimationFrame(animate);
    }

    init();
    animate();

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      init();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const transition = (next) => {
    setAnimKey(k => k + 1);
    setMode(next);
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    onJoin(uuidv4().slice(0, 8).toUpperCase(), name.trim());
  };

  const handleJoin = () => {
    if (!name.trim() || !roomCode.trim()) return;
    onJoin(roomCode.trim().toUpperCase(), name.trim());
  };

  const canProceed = name.trim() && (mode === 'create' || roomCode.trim());

  return (
    <div className="tc-root">
      <canvas ref={canvasRef} className="tc-canvas" />
      <div className="tc-noise" />
      <div className="tc-glow" />
      <div className="tc-glow2" />

      <header className="tc-dashboard-header">
        <div className="tc-user-chip">
          <div className="tc-user-avatar" style={{ backgroundColor: 'rgba(99, 88, 255, 0.2)', color: '#6358ff' }}>
            {user?.email?.[0]?.toUpperCase()}
          </div>
          <div className="tc-user-info">
            <span className="tc-user-email">{user?.email}</span>
            <span className="tc-user-status">authenticated session</span>
          </div>
        </div>

        <div className="tc-system-health">
          <div className="health-dot pulse" />
          <div className="health-info">
            <span className="health-label">REALTIME ENGINE: OPERATIONAL</span>
            <span className="health-ping">Latency: {ping}ms</span>
          </div>
        </div>

        <button className="tc-logout-btn" onClick={onLogout}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </button>
      </header>

      <div className="tc-card">
        <div className="tc-greeting">
          {getGreeting()}, <span className="user-name">{user?.email?.split('@')[0]}</span>
        </div>
        <div className="tc-wordmark">
          <span className="tog">tog</span>
          <span className="code">code</span>
        </div>
        <p className="tc-tag">// intelligence hub command center</p>
        
        <div className="tc-insights-grid">
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
                Create new suite
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
                onChange={e => setName(e.target.value)}
                autoComplete="off"
              />
              {mode === 'join' && (
                <input
                  className="tc-input"
                  placeholder="ROOM_CODE"
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  autoComplete="off"
                />
              )}
              <div className="tc-form-row">
                <button className="btn-ghost" onClick={() => transition(null)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                  </svg>
                  back
                </button>
                  <button
                    className="btn-primary btn-inline"
                    onClick={mode === 'create' ? handleCreate : handleJoin}
                    disabled={!canProceed}
                  >
                    {mode === 'create' ? (
                      <>
                        Launch suite
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '6px' }}>
                          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                        </svg>
                      </>
                    ) : (
                      <>
                        Enter room
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '6px' }}>
                          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                        </svg>
                      </>
                    )}
                  </button>
              </div>
            </div>
          )}
        </div>

        <div className="tc-ticker">
          <div className="ticker-sparkle">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>
          <div className="ticker-content">Try asking AI to 'Analyze the architecture' of your room's history.</div>
        </div>

        <div className="tc-pills" style={{ marginTop: '1rem' }}>
          <span className="tc-pill">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            dynamic sync
          </span>
          <span className="tc-pill">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
            </svg>
            Intelligence AI
          </span>
          <span className="tc-pill">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            live collab
          </span>
        </div>
      </div>
    </div>
  );
}
