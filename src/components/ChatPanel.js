// src/components/ChatPanel.js
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ConfirmModal from './ConfirmModal';
import './ChatPanel.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_INPUT_LENGTH = 2000;
const DEFAULT_MODEL_ID = 'togcode-ai-3-lite';

const MODELS = [
  { id: 'togcode-ai-3-lite', name: 'Togcode AI Lite', desc: 'Balanced Performance and Intelligence', color: '#30D158' },
  { id: 'togcode-ai-2-legacy', name: 'Togcode AI Legacy', desc: 'Stable Foundation', color: '#FF9500' },
];

const SUGGESTED_PROMPTS = [
  {
    label: 'Architecture Analysis',
    hint: 'Dive into system structure',
    text: '@tagcode Explain the core architecture of our current system.',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: 'Workflow Sync',
    hint: 'Improve team collaboration',
    text: "@tagcode Suggest ways to improve our team's collaborative workflow.",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    label: 'Real-time Sync',
    hint: 'Optimize synchronization',
    text: '@tagcode How can we optimize our real-time synchronization strategy?',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    label: 'Decision Review',
    hint: 'Revisit tech decisions',
    text: '@tagcode Review our recent technical decisions and suggest alternatives.',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
  {
    label: 'Sprint Roadmap',
    hint: 'Plan the next sprint',
    text: '@tagcode Help me draft a technical roadmap for the next sprint.',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    label: 'Serverless Benefits',
    hint: 'Evaluate serverless options',
    text: '@tagcode Explain the benefits of moving to a serverless architecture.',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
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
    () => localStorage.getItem('tg_preferred_model') || DEFAULT_MODEL_ID
  );
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(500);
  const [isResizing, setIsResizing] = useState(false);
  const [attachments, setAttachments] = useState([]); // Array of { name, type, size, data }

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const prevMessageCountRef = useRef(chatHistory.length);
  const modelMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  const checkRateLimit = useRateLimit(10, 15000);
  const currentModelObj = MODELS.find(m => m.id === targetModel);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    // Limit to 3 total
    const remainingSlots = 3 - attachments.length;
    const filesToUpload = files.slice(0, remainingSlots);

    filesToUpload.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachments(prev => [
          ...prev.slice(-2), // Ensure we only ever have 3 max (defense in depth)
          {
            name: file.name,
            type: file.type,
            size: file.size,
            data: reader.result,
            preview: file.type.startsWith('image/') ? reader.result : null
          }
        ].slice(0, 3));
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    e.target.value = '';
  };

  // Close model menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target))
        setShowModelMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Update CSS variable for width
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', isCollapsed ? '60px' : `${sidebarWidth}px`);
  }, [sidebarWidth, isCollapsed]);

  // Resizing logic
  const startResizing = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.classList.add('resizing');
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    document.body.classList.remove('resizing');
  }, []);

  const resize = useCallback((e) => {
    if (!isResizing || isCollapsed) return;
    const newWidth = Math.max(440, Math.min(800, e.clientX));
    setSidebarWidth(newWidth);
  }, [isResizing, isCollapsed]);

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

  // Persist model
  useEffect(() => {
    localStorage.setItem('tg_preferred_model', targetModel);
  }, [targetModel]);

  // Auto scroll
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // If called from an event (like onClick), behavior will be an event object.
    // We only want 'smooth', 'auto', or 'instant'.
    const resolvedBehavior = typeof behavior === 'string' ? behavior : 'smooth';

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

    const performScroll = (scrollBehavior) => {
      container.scrollTo({ top: container.scrollHeight, behavior: scrollBehavior });
      setShowScrollButton(false);
    };

    window.requestAnimationFrame(() => {
      performScroll(resolvedBehavior);
      scrollTimeoutRef.current = window.setTimeout(() => performScroll('auto'), 90);
    });
  }, []);

  useEffect(() => {
    const hasNewMessage = chatHistory.length > prevMessageCountRef.current;
    const behavior = aiThinking || hasNewMessage ? 'smooth' : 'auto';
    scrollToBottom(behavior);
    prevMessageCountRef.current = chatHistory.length;
  }, [chatHistory, aiThinking, scrollToBottom]);

  useEffect(() => () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
  }, []);

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = messagesContainerRef.current;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 120);
  };

  // Send handler with rate limit + length guard
  const handleSend = () => {
    const trimmed = input.trim().slice(0, MAX_INPUT_LENGTH);
    if ((!trimmed && attachments.length === 0) || aiThinking) return;

    if (!checkRateLimit()) {
      console.warn('[ChatPanel] Rate limit reached');
      return;
    }

    onSend(trimmed, targetModel, attachments);
    setInput('');
    setAttachments([]);
    setShowMentionMenu(false);
    setMentionSearch('');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    onTyping(false);
  };

  const handleSelectMention = (name) => {
    const cursor = inputRef.current?.selectionStart || 0;
    const textBefore = input.slice(0, cursor);
    const textAfter = input.slice(cursor);
    const lastAtPos = textBefore.lastIndexOf('@');

    if (lastAtPos !== -1) {
      const newText = textBefore.slice(0, lastAtPos) + `@${name} ` + textAfter;
      setInput(newText);
      setShowMentionMenu(false);
      // Refocus textarea
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const newCursorPos = lastAtPos + name.length + 2;
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  };

  const mentionOptions = useMemo(() => {
    const options = [
      { id: 'tagcode', name: 'tagcode', type: 'ai', color: '#007AFF' },
      ...Object.entries(peers)
        .filter(([id, p]) => id !== userId && p && p.online)
        .map(([id, p]) => ({ id, name: p.name || 'Anonymous', type: 'user', color: p.color }))
    ];
    if (!mentionSearch) return options;
    return options.filter(o => o.name.toLowerCase().includes(mentionSearch.toLowerCase()));
  }, [peers, mentionSearch, userId]);

  const handleKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return;

    if (showMentionMenu && mentionOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % mentionOptions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + mentionOptions.length) % mentionOptions.length);
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault();
        if (mentionOptions[mentionIndex]) {
          handleSelectMention(mentionOptions[mentionIndex].name);
        } else {
          setShowMentionMenu(false);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionMenu(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e) => {
    const value = e.target.value.slice(0, MAX_INPUT_LENGTH);
    const cursor = e.target.selectionStart;

    setInput(value);

    // Detect "@" and search string
    const textBeforeCursor = value.slice(0, cursor);
    const lastAtIdx = textBeforeCursor.lastIndexOf('@');

    if (lastAtIdx !== -1 && !textBeforeCursor.slice(lastAtIdx).includes(' ')) {
      const search = textBeforeCursor.slice(lastAtIdx + 1);
      setMentionSearch(search);
      setShowMentionMenu(true);
      setMentionIndex(0);
    } else {
      setShowMentionMenu(false);
    }

    if (!aiThinking) {
      onTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => onTyping(false), 3000);
    }
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => { });
  };

  const messageStats = useMemo(() => ({
    total: chatHistory.length,
    ai: chatHistory.filter(m => m.role === 'assistant').length,
    user: chatHistory.filter(m => m.role === 'user').length,
  }), [chatHistory]);

  const peerCount = Object.values(peers).filter(p => p && p.online).length;

  return (
    <div className={`chat-panel glass-container ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Resize Handle */}
      {!isCollapsed && (
        <div
          className={`resize-handle ${isResizing ? 'active' : ''}`}
          onMouseDown={startResizing}
        />
      )}

      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <button
            className="collapse-toggle-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div className="chat-title-wrapper">
            <span className="suite-flash">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </span>
            <span className="chat-title">Intelligence Suite</span>
          </div>
        </div>

        <div className="chat-header-right">
          <div className="header-status-group">
            <span className="user-count-badge">
              <span className="user-count-dot" />
              {peerCount} Online
            </span>

            <div className="peers-compact-list">
              {Object.entries(peers)
                .filter(([uid, peer]) => peer && peer.online)
                .slice(0, 3)
                .map(([uid, peer]) => (
                  <div key={uid} className="compact-peer-dot" style={{ backgroundColor: peer.color }} title={peer.name}>
                    {peer.photoURL ? (
                      <img src={peer.photoURL} alt="" className="compact-peer-img" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="compact-peer-initial">{(peer.name?.[0] || '?').toUpperCase()}</span>
                    )}
                  </div>
                ))}
              {peerCount > 3 && <span className="more-peers">+{peerCount - 3}</span>}
            </div>
          </div>

          <div className="header-danger-action">
            {isHost ? (
              <button className="stat-badge danger-action-btn" title="Delete Room" onClick={() => setShowDeleteConfirm(true)}>Delete</button>
            ) : (
              <button className="stat-badge danger-action-btn" title="Leave Hub" onClick={() => onLeaveRoom(false)}>Leave</button>
            )}
          </div>
          
          <ConfirmModal
            isOpen={showDeleteConfirm}
            title="Delete Room?"
            message="This will permanently delete the room and all chat history for everyone. This action cannot be undone."
            confirmText="Delete Room"
            cancelText="Cancel"
            variant="danger"
            onConfirm={() => onLeaveRoom(true)}
            onCancel={() => setShowDeleteConfirm(false)}
          />
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
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
                  <div className="prompt-content">
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
            <div className="thinking-bubble">
              <div className="chat-msg-meta">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                Togcode AI
              </div>
              <div className="thinking-dots-row">
                <span /><span /><span />
                <span className="thinking-label">thinking…</span>
              </div>
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
            <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
          </svg>
        </button>
      )}

      {/* Input area */}
      {/* Redesigned Input Suite */}
      <div className="chat-input-wrapper">
        {/* Attached Files Gallery */}
        {attachments.length > 0 && (
          <div className="attached-files">
            {attachments.map((file, i) => (
              <div key={i} className="file-chip">
                <div className="file-icon">
                  {file.type.startsWith('image/') ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2H6m7 0v7h7m-7-7L20 9v11a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2h7z" />
                    </svg>
                  )}
                </div>
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>
                </div>
                <button
                  className="file-remove"
                  onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                  title="Remove file"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Intelligence Toolbar */}
        <div className="toolbar">
          <div className="model-selector" ref={modelMenuRef} onClick={() => setShowModelMenu(!showModelMenu)}>
            <div className="status-dot" style={{ backgroundColor: currentModelObj?.color, boxShadow: `0 0 8px ${currentModelObj?.color}` }} />
            <span className="model-name">{currentModelObj?.name}</span>
            <span className="chevron">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>

            {showModelMenu && (
              <div className="model-dropdown">
                <div className="dropdown-header">Intelligence Tier</div>
                {MODELS.map(m => (
                  <div
                    key={m.id}
                    className={`model-option ${targetModel === m.id ? 'selected' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setTargetModel(m.id); setShowModelMenu(false); }}
                  >
                    <div className="option-info">
                      <div className="option-name" style={{ color: m.color }}>{m.name}</div>
                      <div className="option-desc">{m.desc}</div>
                    </div>
                    {targetModel === m.id && (
                      <span className="option-check">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="token-counts">
            <span>
              <span className="token-label">AI</span>
              <span className="token-value">{messageStats.ai}</span>
            </span>
            <span>
              <span className="token-label">USER</span>
              <span className="token-value">{messageStats.user}</span>
            </span>
          </div>
        </div>

        {/* Mention Menu (Floating) */}
        {showMentionMenu && mentionOptions.length > 0 && (
          <div className="mention-menu">
            {mentionOptions.map((opt, idx) => (
              <div
                key={opt.id}
                className={`mention-item ${idx === mentionIndex ? 'active' : ''}`}
                onClick={() => handleSelectMention(opt.name)}
              >
                {opt.type === 'ai' ? (
                  <div className="mention-icon-ai">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </div>
                ) : (
                  <div className="mention-avatar" style={{ backgroundColor: opt.color }} />
                )}
                <span className="mention-name">{opt.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Input Wrapper */}
        <div className="input-wrapper">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={attachments.length > 0 ? "About files…" : "Chat with @tagcode…"}
            disabled={aiThinking}
            rows={1}
            maxLength={MAX_INPUT_LENGTH}
          />

          <div className="input-actions">
            <div className="left-actions">
              <button
                className="icon-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.length >= 3}
                title="Attach (max 3)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                hidden
                multiple
                accept="image/*,.pdf,.txt,.js,.py,.json"
                onChange={handleFileSelect}
              />
            </div>

            <div className="right-actions">
              <div className="input-meta">
                <span className="hint-mobile"><kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for newline</span>
                <span className="char-count">{input.length}/{MAX_INPUT_LENGTH}</span>
              </div>
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={(!input.trim() && attachments.length === 0) || aiThinking}
              >
                {aiThinking ? (
                  <div className="btn-spinner" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MessageRow ───────────────────────────────────────────────────────────────

function MessageRow({ message, userId, isHovered, onHover, onCopy }) {
  const [copied, setCopied] = useState(false);
  const isAI = message.role === 'assistant';
  const isOwn = !isAI && message.senderId === userId;
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
      <div className="chat-bubble-container">
        <div className="chat-msg-bubble">
          <div className="chat-msg-meta">
            {isAI ? (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                Togcode AI
              </>
            ) : (
              <span className="sender-name" title={message.senderEmail}>{message.senderName}</span>
            )}
            <span className="chat-msg-time">&bull; {formatTime(message.timestamp)}</span>

            <div className="chat-msg-actions-inline">
              <button className="msg-action-btn-mini" onClick={handleCopy} title={copied ? 'Copied!' : 'Copy'}>
                {copied ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <MessageContent content={message.content} />
          {message.attachments && message.attachments.length > 0 && (
            <AttachmentGallery attachments={message.attachments} />
          )}
          {copied && <div className="msg-copied-tag">Copied!</div>}
        </div>
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
  const lines = code.split('\n');
  const langMatch = lines[0].match(/```(\w+)/);
  const lang = langMatch ? langMatch[1] : '';
  const codeContent = lines.slice(1, -1).join('\n');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent).catch(() => { });
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
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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

function AttachmentGallery({ attachments }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="chat-msg-attachments">
      {attachments.map((file, i) => (
        <a
          key={i}
          href={file.data}
          download={file.name}
          className="chat-attachment-item"
          target="_blank"
          rel="noopener noreferrer"
        >
          {file.type?.startsWith('image/') ? (
            <div className="chat-attachment-img-wrapper">
              <img src={file.data} alt={file.name} className="chat-attachment-img" />
            </div>
          ) : (
            <div className="chat-attachment-file-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" />
              </svg>
              <div className="chat-attachment-file-info">
                <span className="file-name" title={file.name}>{file.name}</span>
                <span className="file-size">{((file.size || 0) / 1024).toFixed(1)} KB</span>
              </div>
            </div>
          )}
        </a>
      ))}
    </div>
  );
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
