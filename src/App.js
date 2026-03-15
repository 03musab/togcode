// src/App.js
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';
import JoinPage from './components/JoinPage';
import ChatPanel from './components/ChatPanel';
import { useRoom } from './hooks/useRoom';
import './App.css';

const USER_ID = uuidv4();

const LANG_MAP = {
  javascript: javascript(),
  python: python(),
  html: html(),
  css: css(),
};

export default function App() {
  const [session, setSession] = useState(null); // { roomId, userName }
  const [lang, setLang] = useState('javascript');
  const [copied, setCopied] = useState(false);

  const { code, cursors, chatHistory, peers, aiThinking, updateCode, updateCursor, sendAiMessage } =
    useRoom(session?.roomId, USER_ID, session?.userName);

  const handleJoin = (roomId, userName) => {
    setSession({ roomId, userName });
  };

  const handleCodeChange = useCallback((value, viewUpdate) => {
    updateCode(value);
    // Update cursor position
    const head = viewUpdate?.state?.selection?.main?.head;
    if (head !== undefined) updateCursor(head);
  }, [updateCode, updateCursor]);

  const copyRoomLink = () => {
    navigator.clipboard.writeText(`Room Code: ${session.roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!session) return <JoinPage onJoin={handleJoin} />;

  const peerCount = Object.keys(peers).length;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <span className="logo-vibe">vibe</span>
          <span className="logo-code">code</span>
        </div>
        <div className="header-center">
          <div className="room-info">
            <span className="room-label">Room</span>
            <span className="room-id">{session.roomId}</span>
            <button className="copy-btn" onClick={copyRoomLink}>
              {copied ? '✓ Copied' : 'Copy Code'}
            </button>
          </div>
        </div>
        <div className="header-right">
          <div className="lang-selector">
            {['javascript', 'python', 'html', 'css'].map(l => (
              <button
                key={l}
                className={`lang-btn ${lang === l ? 'active' : ''}`}
                onClick={() => setLang(l)}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="user-info">
            <span className="user-dot" />
            <span>{session.userName}</span>
            <span className="peer-count">{peerCount} online</span>
          </div>
        </div>
      </header>

      <div className="app-body">
        <div className="editor-container">
          {Object.values(cursors).length > 0 && (
            <div className="cursor-indicators">
              {Object.entries(cursors).map(([uid, cur]) => (
                <div key={uid} className="cursor-indicator" style={{ color: cur.color }}>
                  ● {cur.name}
                </div>
              ))}
            </div>
          )}
          <CodeMirror
            value={code}
            height="100%"
            theme={oneDark}
            extensions={[LANG_MAP[lang]]}
            onChange={handleCodeChange}
            className="codemirror-wrapper"
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
            }}
          />
        </div>

        <ChatPanel
          chatHistory={chatHistory}
          aiThinking={aiThinking}
          onSend={sendAiMessage}
          peers={peers}
          userId={USER_ID}
        />
      </div>
    </div>
  );
}
