// src/App.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import JoinPage from './components/JoinPage';
import AuthPage from './components/AuthPage';
import ChatPanel from './components/ChatPanel';
import SettingsModal from './components/SettingsModal';
import { useRoom } from './hooks/useRoom';
import { useThemeContext } from './hooks/useTheme';
import { db, auth } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { remove, ref as dbRef } from 'firebase/database';
import './App.css';

// ─── Security helpers ───────────────────────────────────────────────────────

/** Strip XSS-prone chars, cap length */
function sanitizeText(str, max = 256) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'&]/g, '').slice(0, max);
}

/** Safe session parse with shape validation */
function loadSession() {
  try {
    const raw = localStorage.getItem('tg_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      roomId: sanitizeText(parsed.roomId || '', 32),
      userName: sanitizeText(parsed.userName || '', 64),
      userColor: /^#[0-9A-Fa-f]{6}$/.test(parsed.userColor || '') ? parsed.userColor : '#8b7b9f',
      userPhotoURL: typeof parsed.userPhotoURL === 'string' && (/^https?:\/\//.test(parsed.userPhotoURL) || /^data:image\//.test(parsed.userPhotoURL))
        ? parsed.userPhotoURL : '',
      isHost: !!parsed.isHost,
    };
  } catch {
    return null;
  }
}

// ─── SVG Icon Library ────────────────────────────────────────────────────────

const Icons = {
  Sun: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  Moon: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  Settings: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Logout: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Chat: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Book: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  Info: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  Phone: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.26 12 19.79 19.79 0 0 1 1.19 3.4 2 2 0 0 1 3.16 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  Shield: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Activity: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  // Toast icons
  UserPlus: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  ),
  UserMinus: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  ),
  Clock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Zap: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const { theme, toggleTheme } = useThemeContext();
  const [session, setSession] = useState(loadSession);
  const [notificationsMuted, setNotificationsMuted] = useState(
    () => localStorage.getItem('tg_notifications_muted') === 'true'
  );
  const [copied, setCopied] = useState(false);
  const [currentView, setCurrentView] = useState('chat');
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [joinPageMode, setJoinPageMode] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    localStorage.setItem('tg_notifications_muted', notificationsMuted);
  }, [notificationsMuted]);

  const {
    chatHistory, peers, aiThinking, typingStatus, idlePeers,
    sendAiMessage, setTyping,
  } = useRoom(
    session?.roomId,
    user?.uid,
    session?.userName || user?.email?.split('@')[0],
    user?.email,
    session?.userColor,
    session?.userPhotoURL
  );

  // ─── Toast system ───────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);
  const prevPeersRef = useRef({});
  const prevIdlePeersRef = useRef(new Set());
  const isInitialSync = useRef(true);

  const playNotificationSound = useCallback(() => {
    if (notificationsMuted) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch { /* blocked by browser policy */ }
  }, [notificationsMuted]);

  const addToast = useCallback((message, type) => {
    const id = uuidv4();
    playNotificationSound();
    setToasts(prev => [...prev, { id, message, type }].slice(-4));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, [playNotificationSound]);

  useEffect(() => {
    if (!user || !session || Object.keys(peers).length === 0) return;
    if (isInitialSync.current) {
      prevPeersRef.current = peers;
      prevIdlePeersRef.current = new Set(idlePeers);
      isInitialSync.current = false;
      return;
    }
    const current = Object.keys(peers);
    const prev = Object.keys(prevPeersRef.current);

    current.forEach(uid => {
      if (!prev.includes(uid) && uid !== user?.uid)
        addToast(`${peers[uid].name || 'Collaborator'} joined the suite`, 'join');
    });
    prev.forEach(uid => {
      if (!current.includes(uid) && uid !== user?.uid)
        addToast(`${prevPeersRef.current[uid]?.name || 'Collaborator'} left the suite`, 'leave');
    });
    idlePeers.forEach(uid => {
      if (!prevIdlePeersRef.current.has(uid) && uid !== user?.uid && peers[uid])
        addToast(`${peers[uid].name} is now idle`, 'idle');
    });
    prevIdlePeersRef.current.forEach(uid => {
      if (!idlePeers.has(uid) && current.includes(uid) && uid !== user?.uid)
        addToast(`${peers[uid].name} is back online`, 'active');
    });

    prevPeersRef.current = peers;
    prevIdlePeersRef.current = new Set(idlePeers);
  }, [peers, idlePeers, session, user?.uid, addToast]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleJoin = (roomId, userName, isHost = false) => {
    const newSession = {
      roomId: sanitizeText(roomId, 32),
      userName: sanitizeText(userName, 64),
      isHost: isHost,
    };
    setSession(newSession);
    localStorage.setItem('tg_session', JSON.stringify(newSession));
  };

  const handleUpdateProfile = (userName, userColor, userPhotoURL) => {
    const safeColor = /^#[0-9A-Fa-f]{6}$/.test(userColor) ? userColor : '#8b7b9f';
    const safePhoto = typeof userPhotoURL === 'string' && (/^https?:\/\//.test(userPhotoURL) || /^data:image\//.test(userPhotoURL))
      ? userPhotoURL : '';
    const newSession = {
      ...session,
      userName: sanitizeText(userName, 64),
      userColor: safeColor,
      userPhotoURL: safePhoto,
    };
    setSession(newSession);
    localStorage.setItem('tg_session', JSON.stringify(newSession));
  };

  const handleLeaveRoom = async (isDelete = false) => {
    if (isDelete && session?.isHost && session?.roomId) {
      setIsDeletingRoom(true);
      try {
        await remove(dbRef(db, `rooms/${session.roomId}`));
      } catch (err) {
        console.error('Failed to delete hosted room:', err);
      }
      setTimeout(() => {
        setIsDeletingRoom(false);
        setSession(null);
        setJoinPageMode('create');
        localStorage.removeItem('tg_session');
        localStorage.removeItem('tg_preferred_model');
      }, 600);
      return;
    }
    setSession(null);
    localStorage.removeItem('tg_session');
    localStorage.removeItem('tg_preferred_model');
  };

  const handleLogout = async () => {
    if (session?.isHost && session?.roomId) {
      try {
        await remove(dbRef(db, `rooms/${session.roomId}`));
      } catch (err) {
        console.error('Failed to delete hosted room:', err);
      }
    }

    auth.signOut();
    setSession(null);
    localStorage.removeItem('tg_session');
    localStorage.removeItem('tg_preferred_model');
  };

  const copyRoomLink = () => {
    if (!session?.roomId) return;
    navigator.clipboard.writeText(session.roomId).catch(() => { });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Toast icon map ───────────────────────────────────────────────────────
  const toastIconClass = { join: 'join', leave: 'leave', idle: 'idle', active: 'active' };
  const toastIconNode = {
    join: <Icons.UserPlus />,
    leave: <Icons.UserMinus />,
    idle: <Icons.Clock />,
    active: <Icons.Zap />,
  };

  // ─── View renderer ────────────────────────────────────────────────────────
  const renderContent = () => {
    switch (currentView) {
      case 'chat':
        return (
          <ChatPanel
            chatHistory={chatHistory}
            aiThinking={aiThinking}
            onSend={sendAiMessage}
            peers={peers}
            userId={user?.uid}
            typingStatus={typingStatus}
            onTyping={setTyping}
            idlePeers={idlePeers}
            isHost={session?.isHost}
            onLeaveRoom={handleLeaveRoom}
          />
        );
      case 'settings':
        return (
          <SettingsModal
            user={user}
            session={session}
            onLogout={handleLogout}
            onLeaveRoom={handleLeaveRoom}
            notificationsMuted={notificationsMuted}
            setNotificationsMuted={setNotificationsMuted}
            onUpdateProfile={handleUpdateProfile}
            onClose={() => setCurrentView('chat')}
          />
        );
      case 'docs':
        return (
          <div className="placeholder-view">
            <h2>Documentation</h2>
            <p>Intelligence Suite technical specifications and guides are coming soon.</p>
          </div>
        );
      case 'about':
        return (
          <div className="placeholder-view">
            <h2>About Togcode AI</h2>
            <p>Togcode AI is a real-time collaborative coding platform with AI-powered assistance built by Musab.</p>
          </div>
        );
      case 'support':
        return (
          <div className="placeholder-view">
            <h2>Contact & Support</h2>
            <p>For support or inquiries, contact musabimp.0@gmail.com</p>
          </div>
        );
      case 'policies':
        return (
          <div className="placeholder-view">
            <h2>System Policies</h2>
            <p>Privacy and security protocols for Togcode AI Intelligence are being finalized.</p>
          </div>
        );
      case 'status':
        return (
          <div className="placeholder-view">
            <h2>System Status</h2>
            <p>All Intelligence Engines are currently operational.</p>
          </div>
        );
      default:
        return null;
    }
  };

  // ─── Loading / Auth gates ─────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="splash-screen">
        <div className="splash-content">
          <div className="splash-logo">
            <span className="logo-tog">tog</span>
            <span className="logo-code">code</span>
          </div>
          <div className="thinking-dots"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage onAuthSuccess={setUser} />;
  if (!session) return <JoinPage user={user} onLogout={handleLogout} onJoin={handleJoin} initialMode={joinPageMode} />;

  // ─── Main App ─────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <header className="app-header">
        {/* Left */}
        <div className="header-left">
          <div className="header-logo" onClick={() => setCurrentView('chat')} title="Return to Intelligence Suite">
            <span className="logo-tog">tog</span>
            <span className="logo-code">code</span>
            <span className="logo-ai">AI</span>
          </div>
        </div>

        {/* Center */}
        <div className="header-center">
          <div className="room-info-pill">
            <span className="room-label">Suite AI</span>
            <span className="room-divider">/</span>
            <code className="room-id-hash" onClick={copyRoomLink} title="Click to copy room ID">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {session.roomId}
            </code>
            {copied && <span className="copy-notif">Copied!</span>}
          </div>
        </div>

        {/* Right */}
        <div className="header-right">
          <div className="status-badge">
            <span className="status-pulse" />
            Live
          </div>

          <div className="action-group">
            <button
              className="icon-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
            </button>

            <button
              className={`icon-btn ${currentView === 'settings' ? 'active' : ''}`}
              onClick={() => setCurrentView('settings')}
              title="Settings"
              aria-label="Open settings"
            >
              <Icons.Settings />
            </button>

            <button
              className="icon-btn"
              onClick={handleLogout}
              title="Logout"
              aria-label="Logout"
            >
              <Icons.Logout />
            </button>
          </div>

          <div
            className="user-avatar-circle"
            style={{ backgroundColor: peers[user.uid]?.color || '#8b7b9f' }}
            title={user.email}
          >
            {session.userPhotoURL ? (
              <img
                src={session.userPhotoURL}
                alt=""
                className="user-avatar-img"
                referrerPolicy="no-referrer"
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              (session.userName?.[0] || user.email?.[0])?.toUpperCase()
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="sidebar">
          <div className="sidebar-group">
            <span className="sidebar-label">Intelligence</span>
            <button className={`sidebar-item ${currentView === 'chat' ? 'active' : ''}`} onClick={() => setCurrentView('chat')}>
              <Icons.Chat /> Intelligence Suite
            </button>
          </div>

          <div className="sidebar-group">
            <span className="sidebar-label">Product</span>
            <button className={`sidebar-item ${currentView === 'docs' ? 'active' : ''}`} onClick={() => setCurrentView('docs')}>
              <Icons.Book /> Documentation
            </button>
            <button className={`sidebar-item ${currentView === 'about' ? 'active' : ''}`} onClick={() => setCurrentView('about')}>
              <Icons.Info /> Learn more
            </button>
          </div>

          <div className="sidebar-group">
            <span className="sidebar-label">Support</span>
            <button className={`sidebar-item ${currentView === 'support' ? 'active' : ''}`} onClick={() => setCurrentView('support')}>
              <Icons.Phone /> Chat with us
            </button>
            <button className={`sidebar-item ${currentView === 'policies' ? 'active' : ''}`} onClick={() => setCurrentView('policies')}>
              <Icons.Shield /> Policies
            </button>
            <button className={`sidebar-item ${currentView === 'status' ? 'active' : ''}`} onClick={() => setCurrentView('status')}>
              <Icons.Activity /> Status
            </button>
          </div>

          <div className="sidebar-group">
            <span className="sidebar-label">System</span>
            <button className={`sidebar-item ${currentView === 'settings' ? 'active' : ''}`} onClick={() => setCurrentView('settings')}>
              <Icons.Settings /> Settings
            </button>
          </div>
        </div>

        <div className="main-content-flow">
          {renderContent()}
        </div>
      </main>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <div className={`toast-icon toast-icon-${toastIconClass[toast.type]}`}>
              {toastIconNode[toast.type]}
            </div>
            <span className="toast-msg">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Deletion Animation Overlay */}
      {isDeletingRoom && (
        <div className="room-deletion-overlay">
          <div className="spinner-ring" />
          <div className="deletion-subtext">Closing Suite...</div>
        </div>
      )}

    </div>
  );
}