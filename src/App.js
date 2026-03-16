// src/App.js
import { useState, useCallback, useMemo, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';
import { php } from '@codemirror/lang-php';
import { json } from '@codemirror/lang-json';
import JoinPage from './components/JoinPage';
import AuthPage from './components/AuthPage';
import ChatPanel from './components/ChatPanel';
import FileExplorer from './components/FileExplorer';
import SettingsModal from './components/SettingsModal';
import Dashboard from './components/Dashboard';
import Console from './components/Console';
import { useRoom } from './hooks/useRoom';
import { db, auth } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, set, onValue } from 'firebase/database';
import './App.css';

const TAB_ID = uuidv4();

const LANG_MAP = {
  js: javascript(),
  py: python(),
  html: html(),
  css: css(),
  php: php(),
  json: json(),
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState(() => {
    const saved = localStorage.getItem('togcode_session');
    return saved ? JSON.parse(saved) : null;
  }); // { roomId, userName }
  const [copied, setCopied] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileView, setMobileView] = useState('editor'); // 'files' | 'editor' | 'chat'
  const [isTerminated, setIsTerminated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);

  // Monitor Session Exclusivity
  useEffect(() => {
    if (!user || !session?.roomId) return;

    const sessionRef = ref(db, `users/${user.uid}/activeSession`);
    
    // Register this tab
    set(sessionRef, {
      roomId: session.roomId,
      tabId: TAB_ID,
      timestamp: Date.now()
    });

    // Listen for takeovers
    const unsubscribe = onValue(sessionRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.tabId !== TAB_ID) {
        setIsTerminated(true);
      }
    });

    return () => unsubscribe();
  }, [user, session?.roomId]);

  // Monitor Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const {
    files,
    activeFileId,
    setActiveFileId,
    createFile,
    deleteFile,
    renameFile,
    cursors,
    chatHistory,
    peers,
    aiThinking,
    typingStatus,
    updateCode,
    updateCursor,
    sendAiMessage,
    setTyping,
    lastEditTime,
    formatLastSeen
  } = useRoom(session?.roomId, user?.uid, session?.userName || user?.email?.split('@')[0], user?.email);

  const activeFile = useMemo(() => files[activeFileId] || null, [files, activeFileId]);

  // Command Palette Keyboard Shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleJoin = (roomId, userName) => {
    const newSession = { roomId, userName };
    setSession(newSession);
    localStorage.setItem('togcode_session', JSON.stringify(newSession));
  };

  const handleLogout = () => {
    auth.signOut();
    localStorage.removeItem('togcode_session');
    setSession(null);
  };

  const handleCodeChange = useCallback((value, viewUpdate) => {
    if (activeFileId) {
      updateCode(activeFileId, value);
      const head = viewUpdate?.state?.selection?.main?.head;
      if (head !== undefined) updateCursor(head);
    }
  }, [activeFileId, updateCode, updateCursor]);

  const copyRoomLink = () => {
    navigator.clipboard.writeText(session.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredFiles = useMemo(() => {
    if (!searchQuery) return Object.entries(files);
    return Object.entries(files).filter(([, f]) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [files, searchQuery]);

  const [chatWidth, setChatWidth] = useState(550);
  const [isResizing, setIsResizing] = useState(false);

  // Resize handler
  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e) => {
    if (isResizing) {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 200 && newWidth < 800) {
        setChatWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

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

  if (!user) return <AuthPage onAuthSuccess={setUser} />;
  if (!session) return <JoinPage onJoin={handleJoin} />;

  const handleReconnect = () => {
    const sessionRef = ref(db, `users/${user.uid}/activeSession`);
    set(sessionRef, {
      roomId: session.roomId,
      tabId: TAB_ID,
      timestamp: Date.now()
    });
    setIsTerminated(false);
  };

  return (
    <div className={`app ${isResizing ? 'is-resizing' : ''}`}>
      <header className="app-header">
        <div className="header-left">
          <div className="splash-logo" style={{ fontSize: '1.4rem' }}>
            <span className="logo-tog">tog</span>
            <span className="logo-code">code</span>
          </div>
        </div>

        <div className="header-center">
          <div className="room-info-pill">
            <span className="room-name">Togcode Studio</span>
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
            {lastEditTime > 0 && (
              <div className="last-edit">
                Edited {formatLastSeen(lastEditTime)}
              </div>
            )}
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

      <div className={`app-body view-${mobileView}`}>
        <div className="mobile-only-overlay" onClick={() => setMobileView('editor')} />
        <FileExplorer
          files={files}
          activeFileId={activeFileId}
          onFileSelect={setActiveFileId}
          onFileCreate={createFile}
          onFileDelete={deleteFile}
          onFileRename={renameFile}
          peers={peers}
        />

        <div className="editor-container">
          <div className="editor-tab-bar">
            {activeFile && (
              <div className="active-tab">
                <span className="tab-name">{activeFile.name}</span>
              </div>
            )}
            <div className="editor-controls">
              <button 
                className={`terminal-toggle-btn ${consoleOpen ? 'active' : ''}`}
                onClick={() => setConsoleOpen(!consoleOpen)}
              >
                Output Console
              </button>
              <span className="kbd-hint">⌘K to search | ctrl + F to search</span>
            </div>
            {Object.values(cursors).length > 0 && (
              <div className="cursor-indicators">
                {Object.entries(cursors).map(([uid, cur]) => (
                  <div key={uid} className="cursor-indicator" style={{ color: cur.color }}>
                    <span className="cursor-dot" /> {cur.name}
                  </div>
                ))}
              </div>
            )}
          </div>
          {activeFile ? (
            <div className="editor-main-area">
              <CodeMirror
                value={activeFile?.content || ''}
                height="100%"
                theme={oneDark}
                extensions={[LANG_MAP[activeFile?.name?.split('.').pop()] || javascript()]}
                onChange={handleCodeChange}
                className="codemirror-wrapper"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  closeBrackets: true,
                  autocompletion: true,
                }}
              />
              <Console 
                isOpen={consoleOpen} 
                onClose={() => setConsoleOpen(false)}
                code={activeFile?.content}
                language={activeFile?.name?.split('.').pop()}
              />
            </div>
          ) : (
            <Dashboard 
              userName={session?.userName} 
              fileCount={Object.keys(files).length}
              onNewFile={() => createFile('main.js', '// Welcome to Togcode!\nconsole.log("Hello World!");')}
            />
          )}
        </div>

        <div 
          className="chat-resizer" 
          onMouseDown={startResizing}
        >
          <div className="resizer-knob" />
        </div>

        <div className="chat-panel-wrapper" style={{ width: chatWidth }}>
          <ChatPanel
            chatHistory={chatHistory}
            aiThinking={aiThinking}
            onSend={sendAiMessage}
            peers={peers}
            userId={user?.uid}
            typingStatus={typingStatus}
            onTyping={setTyping}
          />
        </div>
      </div>

      <nav className="mobile-nav">
        <button
          className={`nav-item ${mobileView === 'files' ? 'active' : ''}`}
          onClick={() => setMobileView('files')}
        >
          <span className="nav-icon">📁</span>
          <span className="nav-label">Files</span>
        </button>
        <button
          className={`nav-item ${mobileView === 'editor' ? 'active' : ''}`}
          onClick={() => setMobileView('editor')}
        >
          <span className="nav-icon">📝</span>
          <span className="nav-label">Editor</span>
        </button>
        <button
          className={`nav-item ${mobileView === 'chat' ? 'active' : ''}`}
          onClick={() => setMobileView('chat')}
        >
          <span className="nav-icon">💬</span>
          <span className="nav-label">Chat</span>
          {chatHistory.length > 0 && <span className="nav-badge" />}
        </button>
      </nav>

      {searchOpen && (
        <div className="command-palette-overlay" onClick={() => setSearchOpen(false)}>
          <div className="command-palette" onClick={e => e.stopPropagation()}>
            <input
              className="cp-input"
              placeholder="Search files..."
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <div className="cp-results">
              {filteredFiles.map(([id, file]) => (
                <div
                  key={id}
                  className={`cp-item ${activeFileId === id ? 'active' : ''}`}
                  onClick={() => { setActiveFileId(id); setSearchOpen(false); }}
                >
                  <span className="cp-icon">📄</span>
                  <span className="cp-name">{file.name}</span>
                </div>
              ))}
              {filteredFiles.length === 0 && <div className="cp-node">No matches found</div>}
            </div>
          </div>
        </div>
      )}
      {isTerminated && (
        <div className="termination-overlay">
          <div className="termination-card">
            <div className="termination-icon">⚠️</div>
            <h2>Session Terminated</h2>
            <p>You have joined a suite from another tab or device. To maintain security and sync performance, only one session is allowed at a time.</p>
            <div className="termination-actions">
              <button className="btn-primary" onClick={handleReconnect}>Take Over Session</button>
              <button className="btn-ghost" onClick={handleLogout}>Logout</button>
            </div>
          </div>
        </div>
      )}

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
