// src/components/ChatPanel.js
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { formatLastSeen } from '../hooks/useRoom';
import './ChatPanel.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_INPUT_LENGTH = 2000;

const MODELS = [
  { id: 'gpt-oss-120b',     name: 'Togcode AI 120B', desc: 'Ultimate Intelligence • Principal Tier', color: '#007AFF' },
  { id: 'togcode-ai-3-lite',name: 'Togcode AI Lite', desc: 'Balanced Performance',                   color: '#30D158' },
  { id: 'togcode-ai-2-legacy',name:'Togcode AI Legacy',desc:'Stable Foundation',                     color: '#FF9500' },
];

const SUGGESTED_PROMPTS = [
  {
    label: 'Architecture Analysis',
    hint: 'Deep-dive into system structure',
    text: 'Explain the core architecture of our current system.',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    label: 'Workflow Sync',
    hint: 'Improve team collaboration',
    text: "Suggest ways to improve our team's collaborative workflow.",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
  {
    label: 'Real-time Sync',
    hint: 'Optimize synchronization',
    text: 'How can we optimize our real-time synchronization strategy?',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    ),
  },
  {
    label: 'Decision Review',
    hint: 'Revisit tech decisions',
    text: 'Review our recent technical decisions and suggest alternatives.',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
    ),
  },
  {
    label: 'Sprint Roadmap',
    hint: 'Plan the next sprint',
    text: 'Help me draft a technical roadmap for the next sprint.',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    label: 'Serverless Benefits',
    hint: 'Evaluate serverless options',
    text: 'Explain the benefits of moving to a serverless architecture.',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
      </svg>
    ),
  },
];

// ─── Rate limiter hook ────────────────────────────────────────────────────────

function useRateLimit(maxMessages = 10, windowMs = 15000) {
  const timestamps = useRef([]);
  const isAllowed = useCallback(() => {
    const now = Date.now();
    timestamps.current = timestamps.current.filter(t => now - t < windowMs);
    if (timestamps.current.length >= maxMessages) return false;
    timestamps.current.push(now);
    return true;
  }, [maxMessages, windowMs]);
  return isAllowed;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatPanel({
  chatHistory, aiThinking, onSend, peers, userId, typingStatus, onTyping, idlePeers,
  isHost, onLeaveRoom
}) {
  const [input, setInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [targetModel, setTargetModel] = useState(
    () => localStorage.getItem('tg_preferred_model') || 'togcode-ai-3-lite'
  );
  const [showModelMenu, setShowModelMenu] = useState(false);

  const messagesEndRef       = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef     = useRef(null);
  const modelMenuRef         = useRef(null);

  const checkRateLimit = useRateLimit(10, 15000);
  const currentModelObj = MODELS.find(m => m.id === targetModel);

  // Close model menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target))
        setShowModelMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Persist model
  useEffect(() => {
    localStorage.setItem('tg_preferred_model', targetModel);
  }, [targetModel]);

  // Auto scroll
  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => { scrollToBottom(); }, [chatHistory, aiThinking]);

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = messagesContainerRef.current;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 120);
  };

  // Send handler with rate limit + length guard
  const handleSend = () => {
    const trimmed = input.trim().slice(0, MAX_INPUT_LENGTH);
    if (!trimmed || aiThinking) return;
    if (!checkRateLimit()) {
      console.warn('[ChatPanel] Rate limit reached');
      return;
    }
    onSend(trimmed, targetModel);
    setInput('');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    onTyping(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e) => {
    const value = e.target.value.slice(0, MAX_INPUT_LENGTH);
    setInput(value);
    if (!aiThinking) {
      onTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => onTyping(false), 3000);
    }
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const messageStats = useMemo(() => ({
    total: chatHistory.length,
    ai:    chatHistory.filter(m => m.role === 'assistant').length,
    user:  chatHistory.filter(m => m.role === 'user').length,
  }), [chatHistory]);

  const peerCount = Object.keys(peers).length;

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="chat-title-wrapper">
            <span className="suite-flash">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </span>
            <span className="chat-title">Intelligence Suite</span>
            <span className="user-count-badge">
              <span className="user-count-dot" />
              {peerCount} Users
            </span>

            <div className="header-danger-action" style={{ marginLeft: '6px', display: 'flex', alignItems: 'center' }}>
              {isHost ? (
                showDeleteConfirm ? (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      className="stat-badge" 
                      style={{ cursor: 'pointer', background: 'var(--clr-red)', color: '#fff', border: 'none' }} 
                      onClick={() => onLeaveRoom(true)}
                    >
                      Confirm
                    </button>
                    <button 
                      className="stat-badge" 
                      style={{ cursor: 'pointer' }} 
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button 
                    className="stat-badge danger-hover" 
                    title="Delete Room" 
                    onClick={() => setShowDeleteConfirm(true)}
                    style={{ cursor: 'pointer', color: 'var(--clr-red)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  >
                    Delete Room
                  </button>
                )
              ) : (
                <button 
                  className="stat-badge danger-hover" 
                  title="Leave Hub" 
                  onClick={() => onLeaveRoom(false)}
                  style={{ cursor: 'pointer' }}
                >
                  Leave Hub
                </button>
              )}
            </div>
          </div>

          {/* Model selector */}
          <div className="model-selector-container" ref={modelMenuRef}>
            <div
              className={`model-pill ${showModelMenu ? 'active' : ''}`}
              onClick={() => setShowModelMenu(!showModelMenu)}
              style={{ '--tier-color': currentModelObj?.color }}
            >
              <span className="model-dot" />
              <span className="model-name">{currentModelObj?.name}</span>
              <span className="model-chevron">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </span>
            </div>

            {showModelMenu && (
              <div className="model-dropdown">
                <div className="dropdown-header">Select Intelligence Tier</div>
                {MODELS.map(m => (
                  <div
                    key={m.id}
                    className={`model-option ${targetModel === m.id ? 'selected' : ''}`}
                    onClick={() => { setTargetModel(m.id); setShowModelMenu(false); }}
                  >
                    <div className="option-info">
                      <div className="option-name" style={{ color: m.color }}>{m.name}</div>
                      <div className="option-desc">{m.desc}</div>
                    </div>
                    {targetModel === m.id && (
                      <span className="option-check">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="chat-header-right">
          {/* Peers */}
          <div className="peers-container">
            <span className="peers-label">Online</span>
            <div className="peers-list">
              {Object.entries(peers).map(([uid, peer]) => (
                <div
                  key={uid}
                  className={`peer-badge ${idlePeers?.has(uid) ? 'is-idle' : ''}`}
                  style={{ backgroundColor: peer.color }}
                  title={`${peer.name}${idlePeers?.has(uid) ? ` · Idle ${formatLastSeen(peer.lastSeen)}` : ''}`}
                >
                  {peer.photoURL ? (
                    <img
                      src={peer.photoURL}
                      alt=""
                      className="peer-avatar-img"
                      referrerPolicy="no-referrer"
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    peer.name?.[0]?.toUpperCase() || '?'
                  )}
                  <span className="peer-status" />
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="chat-stats">
            <span className="stat-badge">{messageStats.ai} AI</span>
            <span className="stat-badge">{messageStats.user} User</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        className="chat-messages"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {chatHistory.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <h3>Ready to Collaborate?</h3>
            <p>I can help you build, debug, and optimize your project in real-time.</p>

            <div className="suggested-prompts">
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  className="prompt-card"
                  onClick={() => onSend(prompt.text, targetModel)}
                >
                  <div className="prompt-icon-box">{prompt.icon}</div>
                  <div>
                    <div className="prompt-label">{prompt.label}</div>
                    <div className="prompt-hint">{prompt.hint}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatHistory.map((msg, idx) => (
            <MessageRow
              key={msg.id || idx}
              message={msg}
              userId={userId}
              isHovered={hoveredMsg === (msg.id || idx)}
              onHover={(id) => setHoveredMsg(id)}
              onCopy={() => copyToClipboard(msg.content)}
            />
          ))
        )}

        {/* AI Thinking */}
        {aiThinking && (
          <div className="chat-thinking">
            <div className="chat-msg-meta">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              Togcode AI
            </div>
            <div className="thinking-bubble">
              <div className="thinking-dots-row">
                <span /><span /><span />
              </div>
              <span className="thinking-label">thinking…</span>
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {Object.values(typingStatus).length > 0 && (
          <div className="chat-typing-indicator">
            <div className="typing-dots"><span /><span /><span /></div>
            <span className="typing-text">
              {Object.values(typingStatus).map(s => s.name).join(', ')} typing…
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll-to-bottom */}
      {showScrollButton && (
        <button className="scroll-to-bottom-btn" onClick={scrollToBottom} aria-label="Scroll to bottom">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 13l5 5 5-5M7 6l5 5 5-5"/>
          </svg>
        </button>
      )}

      {/* Input */}
      <div className="chat-input-row">
        <div className="input-wrapper">
          <textarea
            className="chat-input"
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Talk to Togcode AI Intelligence…"
            disabled={aiThinking}
            aria-label="Message input"
            rows={1}
            maxLength={MAX_INPUT_LENGTH}
          />
          <div className="input-footer">
            <span>Enter to send · Shift+Enter for newline</span>
            <span className="char-count">{input.length}/{MAX_INPUT_LENGTH}</span>
          </div>
        </div>

        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || aiThinking}
          aria-label="Send message"
        >
          {aiThinking ? (
            <div className="btn-spinner" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── MessageRow ───────────────────────────────────────────────────────────────

function MessageRow({ message, userId, isHovered, onHover, onCopy }) {
  const [copied, setCopied] = useState(false);
  const isAI   = message.role === 'assistant';
  const isOwn  = !isAI && message.senderId === userId;
  const msgCls = isAI ? 'ai' : isOwn ? 'mine' : 'theirs';

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`chat-msg ${msgCls}`}
      onMouseEnter={() => onHover(message.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="chat-msg-meta">
        {isAI ? (
          <>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Togcode AI
          </>
        ) : (
          <span className="sender-name" title={message.senderEmail}>{message.senderName}</span>
        )}
        <span className="chat-msg-time">&bull; {formatTime(message.timestamp)}</span>
      </div>

      <div className="chat-bubble-container">
        <div className="chat-msg-bubble">
          <MessageContent content={message.content} />
          {copied && <div className="msg-copied-tag">Copied!</div>}
        </div>

        {isHovered && (
          <div className="chat-msg-actions">
            <button className="msg-action-btn" onClick={handleCopy} title={copied ? 'Copied!' : 'Copy'}>
              {copied ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MessageContent ───────────────────────────────────────────────────────────

function MessageContent({ content }) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <div className="message-content">
      {parts.map((part, i) =>
        part.startsWith('```') ? (
          <CodeBlock key={i} code={part} />
        ) : (
          <div key={i} className="text-content">{parseInlineMarkdown(part)}</div>
        )
      )}
    </div>
  );
}

// ─── CodeBlock ────────────────────────────────────────────────────────────────

function CodeBlock({ code }) {
  const lines      = code.split('\n');
  const langMatch  = lines[0].match(/```(\w+)/);
  const lang       = langMatch ? langMatch[1] : '';
  const codeContent = lines.slice(1, -1).join('\n');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="chat-code-wrapper">
      <div className="chat-code-header">
        <span className="chat-code-lang">{lang || 'code'}</span>
        <div className="chat-code-actions">
          {copied && <span className="msg-copied-tag code">Copied!</span>}
          <button className="code-copy-btn" onClick={handleCopy} title={copied ? 'Copied!' : 'Copy code'}>
            {copied ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            )}
          </button>
        </div>
      </div>
      <pre className="chat-code-block"><code>{codeContent}</code></pre>
    </div>
  );
}

// ─── Inline markdown ──────────────────────────────────────────────────────────

function parseInlineMarkdown(text) {
  return text
    .split(/(\*\*.*?\*\*|\*.*?\*|`[^`]+`|\[.*?\]\(.*?\))/g)
    .map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
        return <em key={i}>{part.slice(1, -1)}</em>;
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
        return <code key={i}>{part.slice(1, -1)}</code>;
      if (part.startsWith('[') && part.includes('](')) {
        const match = part.match(/\[(.*?)\]\((.*?)\)/);
        if (match) {
          // Only allow safe URLs
          const safeHref = /^https?:\/\//i.test(match[2]) ? match[2] : '#';
          return <a key={i} href={safeHref} target="_blank" rel="noopener noreferrer">{match[1]}</a>;
        }
      }
      return part;
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}