// src/App.js
import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import JoinPage from './components/JoinPage';
import AuthPage from './components/AuthPage';
import ChatPanel from './components/ChatPanel';
import SettingsModal from './components/SettingsModal';
import { useRoom } from './hooks/useRoom';
import { db, auth } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, set, onValue } from 'firebase/database';
import './App.css';

const TAB_ID = uuidv4();

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState(null); // { roomId, userName } - Removed localStorage to reset on reload
  const [copied, setCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Monitor Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const {
    chatHistory,
    peers,
    aiThinking,
    typingStatus,
    sendAiMessage,
    setTyping
  } = useRoom(session?.roomId, user?.uid, session?.userName || user?.email?.split('@')[0], user?.email);

  const handleJoin = (roomId, userName) => {
    setSession({ roomId, userName });
  };

  const handleLogout = () => {
    auth.signOut();
    setSession(null);
  };

  const copyRoomLink = () => {
    if (!session?.roomId) return;
    navigator.clipboard.writeText(session.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (authLoading) {
    return (
      <div className="splash-screen">
        <div className="splash-content">
          <div className="splash-logo">
            <span className="logo-tog">tog</span>
            <span className="logo-code">code</span>
          </div>
          <div className="thinking-dots">
            <span /><span /><span />
          </div>
        </div>
      </div>
    );
  }

  // Phase 1: Authentication always comes first
  if (!user) return <AuthPage onAuthSuccess={setUser} />;

  // Phase 2: Join/Dashboard always comes after login or on reload
  if (!session) return <JoinPage user={user} onLogout={handleLogout} onJoin={handleJoin} />;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="splash-logo">
            <span className="logo-tog">tog</span>
            <span className="logo-code">code</span>
          </div>
        </div>

        <div className="header-center">
          <div className="room-info-pill">
            <span className="room-name">Intelligence Hub</span>
            <span className="room-divider">/</span>
            <span className="room-id-hash" onClick={copyRoomLink} title="Click to copy ID">
              {session.roomId}
              {copied && <span className="copy-notif">Copied!</span>}
            </span>
          </div>
        </div>

        <div className="header-right">
          <div className="status-section">
            <div className={`status-badge ${peers[user.uid]?.online ? 'active' : ''}`}>
              <span className="status-pulse" />
              Live
            </div>
          </div>

          <div className="header-actions">
            <button className="icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button className="icon-btn logout" onClick={handleLogout} title="Logout">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>

          <div className="peers-avatars">
            {Object.entries(peers).slice(0, 3).map(([uid, peer]) => (
              <div 
                key={uid} 
                className="peer-avatar-circle" 
                style={{ backgroundColor: peer.color }}
                title={`${peer.name}${peer.email ? ` (${peer.email})` : ''}`}
              >
                {peer.name?.[0]?.toUpperCase()}
              </div>
            ))}
            {Object.keys(peers).length > 3 && (
              <div className="peer-avatar-circle more">+{Object.keys(peers).length - 3}</div>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        <ChatPanel
          chatHistory={chatHistory}
          aiThinking={aiThinking}
          onSend={sendAiMessage}
          peers={peers}
          userId={user?.uid}
          typingStatus={typingStatus}
          onTyping={setTyping}
        />
      </main>

      <SettingsModal 
        isOpen={settingsOpen} 
        onClose={() => setSettingsOpen(false)} 
        user={user}
        session={session}
        onLogout={handleLogout}
      />
    </div>
  );
}
