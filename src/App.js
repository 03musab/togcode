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
  
  // Initialize session from localStorage if it exists
  const [session, setSession] = useState(() => {
    const saved = localStorage.getItem('tg_session');
    return saved ? JSON.parse(saved) : null;
  });

  const [copied, setCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentView, setCurrentView] = useState('chat'); // 'chat' | 'docs' | 'support' | 'policies' | 'status'

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
    const newSession = { roomId, userName };
    setSession(newSession);
    localStorage.setItem('tg_session', JSON.stringify(newSession));
  };

  const handleLogout = () => {
    auth.signOut();
    setSession(null);
    localStorage.removeItem('tg_session');
  };

  const copyRoomLink = () => {
    if (!session?.roomId) return;
    navigator.clipboard.writeText(session.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderContent = () => {
    switch(currentView) {
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
          />
        );
      case 'docs':
        return (
          <div className="placeholder-view glass-lg">
            <h2>Documentation</h2>
            <p>Intelligence Hub technical specifications and guides are coming soon.</p>
          </div>
        );
      case 'about':
        return (
          <div className="placeholder-view glass-lg">
            <h2>About Togcode</h2>
            <p>Togcode is a project by Musab, a software developer passionate about building innovative solutions.</p>
            <p>This application demonstrates real-time collaboration and AI-powered features.</p>
          </div>
        );
      case 'support':
        return (
          <div className="placeholder-view glass-lg">
            <h2>Contact & Support</h2>
            <p>For support or inquiries, please contact Musab:</p>
            <ul>
              <li>Email: musabimp.0@gmail.com</li>
              <li>GitHub: github.com/03musab</li>
              <li>LinkedIn: www.linkedin.com/in/devmusab</li>
            </ul>
          </div>
        );
      case 'policies':
        return (
          <div className="placeholder-view glass-lg">
            <h2>System Policies</h2>
            <p>Privacy and security protocols for Togcode Intelligence are being finalized.</p>
          </div>
        );
      case 'status':
        return (
          <div className="placeholder-view glass-lg">
            <h2>System Status</h2>
            <p>All Intelligence Engines (Togcode 120B, Lite) are currently operational.</p>
          </div>
        );
      default:
        return null;
    }
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
            {Object.entries(peers).slice(0, 1).map(([uid, peer]) => (
              <div 
                key={uid} 
                className="peer-avatar-circle" 
                style={{ backgroundColor: peer.color }}
                title={`${peer.name}${peer.email ? ` (${peer.email})` : ''}`}
              >
                {peer.name?.[0]?.toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="sidebar">
          <div className="sidebar-group">
            <span className="sidebar-label">Intelligence</span>
            <button 
              className={`sidebar-item ${currentView === 'chat' ? 'active' : ''}`}
              onClick={() => setCurrentView('chat')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Intelligence Hub
            </button>
          </div>

          <div className="sidebar-group">
            <span className="sidebar-label">Product</span>
            <button 
              className={`sidebar-item ${currentView === 'docs' ? 'active' : ''}`}
              onClick={() => setCurrentView('docs')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              Documentation
            </button>
            <button 
              className={`sidebar-item ${currentView === 'about' ? 'active' : ''}`}
              onClick={() => setCurrentView('about')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              Learn more
            </button>
          </div>

          <div className="sidebar-group">
            <span className="sidebar-label">Support</span>
            <button 
              className={`sidebar-item ${currentView === 'support' ? 'active' : ''}`}
              onClick={() => setCurrentView('support')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Chat with us
            </button>
            <button 
              className={`sidebar-item ${currentView === 'policies' ? 'active' : ''}`}
              onClick={() => setCurrentView('policies')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Policies
            </button>
            <button 
              className={`sidebar-item ${currentView === 'status' ? 'active' : ''}`}
              onClick={() => setCurrentView('status')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Status
            </button>
          </div>
        </div>

        <div className="main-content-flow">
          {renderContent()}
        </div>
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
