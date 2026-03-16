// src/components/ChatPanel.js
import { useState, useRef, useEffect, useMemo } from 'react';
import './ChatPanel.css';

export default function ChatPanel({ chatHistory, aiThinking, onSend, peers, userId, typingStatus, onTyping }) {
  const [input, setInput] = useState('');
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const suggestedPrompts = [
    { 
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, 
      label: 'Architecture Analysis', 
      text: 'Explain the core architecture of our current system.' 
    },
    { 
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, 
      label: 'Workflow Sync', 
      text: "Suggest ways to improve our team's collaborative workflow." 
    },
    { 
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>, 
      label: 'Real-time Sync', 
      text: 'How can we optimize our real-time synchronization strategy?' 
    },
    { 
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>, 
      label: 'Decision Review', 
      text: 'Review our recent technical decisions and suggest alternatives.' 
    },
    { 
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, 
      label: 'Roadmap Draft', 
      text: 'Help me draft a technical roadmap for the next sprint.' 
    },
    { 
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>, 
      label: 'Serverless Benefits', 
      text: 'Explain the benefits of moving to a serverless architecture.' 
    }
  ];

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, aiThinking]);

  // Handle manual scroll detection
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = messagesContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || aiThinking) return;
    onSend(trimmed);
    setInput('');
    setSelectedMsg(null);
    onTyping(false); // Stop typing immediately on send
  };

  const handlePromptClick = (text) => {
    onSend(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e) => {
    setInput(e.target.value);
    
    // Handle typing indicator
    if (!aiThinking) {
      onTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 3000);
    }

    // Auto-expand textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const messageStats = useMemo(() => {
    const aiCount = chatHistory.filter(m => m.role === 'assistant').length;
    const userCount = chatHistory.filter(m => m.role === 'user').length;
    return { total: chatHistory.length, ai: aiCount, user: userCount };
  }, [chatHistory]);

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="chat-title-wrapper">
            <span className="hub-flash">⚡</span>
            <span className="chat-title">Intelligence Hub</span>
          </div>
          <div className="model-pill">
            <span className="model-dot" />
            <span className="model-name">Togcode-4.0-Pro</span>
            <span className="model-chevron">▼</span>
          </div>
        </div>

        <div className="peers-list" title="Active collaborators">
          {Object.entries(peers).map(([uid, peer]) => (
            <div
              key={uid}
              className="peer-badge"
              style={{ backgroundColor: peer.color }}
              title={`${peer.name}${peer.email ? ` (${peer.email})` : ''}`}
            >
              {peer.name?.[0]?.toUpperCase() || '?'}
            </div>
          ))}
        </div>
      </div>

      {/* Messages Container */}
      <div
        className="chat-messages"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {chatHistory.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
                <path d="M12 7v5l3 3"/>
                <path d="M12 16h.01"/>
              </svg>
            </div>
            <h3>Ready to Collaborate?</h3>
            <p>I can help you build, debug, and optimize your project in real-time.</p>
            
            <div className="suggested-prompts">
              {suggestedPrompts.map((prompt, i) => (
                <button 
                  key={i} 
                  className="prompt-chip"
                  onClick={() => handlePromptClick(prompt.text)}
                >
                  <span className="prompt-icon">{prompt.icon}</span>
                  <span className="prompt-label">{prompt.label}</span>
                </button>
              ))}
            </div>

            <div className="chat-empty-hints">
              <div className="hint-item">
                <div className="hint-icon">🚀</div>
                <div className="hint-text">Trained on your codebase</div>
              </div>
              <div className="hint-item">
                <div className="hint-icon">🛡️</div>
                <div className="hint-text">Secure & private workspace</div>
              </div>
            </div>
          </div>
        ) : (
          chatHistory.map((msg, idx) => (
            <MessageRow
              key={msg.id || idx}
              message={msg}
              userId={userId}
              isSelected={selectedMsg?.id === msg.id}
              isHovered={hoveredMsg === msg.id}
              onSelect={() => setSelectedMsg(msg)}
              onHover={(id) => setHoveredMsg(id)}
              onCopy={() => copyToClipboard(msg.content)}
            />
          ))
        )}

        {aiThinking && (
          <div className="chat-msg ai thinking-container">
            <div className="chat-msg-meta">✦ Togcode Intelligence</div>
            <div className="chat-msg-bubble thinking">
              <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
            </div>
          </div>
        )}

        {Object.values(typingStatus).length > 0 && (
          <div className="chat-typing-indicator">
            <div className="typing-dots">
              <span /><span /><span />
            </div>
            <span className="typing-text">
              {Object.values(typingStatus).map(s => s.name).join(', ')} typing...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <button
          className="scroll-to-bottom-btn"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 13l5 5 5-5M7 6l5 5 5-5"/>
          </svg>
        </button>
      )}

      {/* Input Row */}
      <div className="chat-input-row">
        <div className="input-wrapper">
          <textarea
            className="chat-input"
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Talk to Togcode Intelligence..."
            disabled={aiThinking}
            rows={1}
            maxLength={2000}
          />
          <div className="input-footer">
            <div className="input-meta">
              <span className="meta-item">⌘ Enter to send</span>
              <span className="meta-divider">|</span>
              <span className="meta-item">{input.length}/2000</span>
            </div>
          </div>
        </div>

        <button
          className="chat-send-btn pulse-button"
          onClick={handleSend}
          disabled={!input.trim() || aiThinking}
        >
          {aiThinking ? (
            <div className="btn-spinner" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

function MessageRow({
  message,
  userId,
  isSelected,
  isHovered,
  onSelect,
  onHover,
  onCopy,
}) {
  const [copied, setCopied] = useState(false);
  const isAI = message.role === 'assistant';
  const isOwn = !isAI && message.senderId === userId;
  const messageClass = isAI ? 'ai' : isOwn ? 'mine' : 'theirs';

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`chat-msg ${messageClass} ${isSelected ? 'selected' : ''}`}
      onMouseEnter={() => onHover(message.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="chat-msg-meta">
        {isAI ? '✦ Togcode AI' : (
          <span className="sender-name" title={message.senderEmail}>
            {message.senderName}
          </span>
        )} 
        <span className="chat-msg-time"> &bull; {formatTime(message.timestamp)}</span>
      </div>
      
      <div className="chat-bubble-container">
        <div className="chat-msg-bubble">
          <MessageContent content={message.content} />
          {copied && <div className="msg-copied-tag">Copied!</div>}
        </div>
        
        {isHovered && (
          <div className="chat-msg-actions">
            <button className="msg-action-btn" onClick={handleCopy} title="Copy">
              {copied ? '✓' : '📋'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageContent({ content }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="message-content">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          return <CodeBlock key={i} code={part} />;
        }
        return (
          <div key={i} className="text-content">
            {parseInlineMarkdown(part)}
          </div>
        );
      })}
    </div>
  );
}

function CodeBlock({ code }) {
  const lines = code.split('\n');
  const langMatch = lines[0].match(/```(\w+)/);
  const lang = langMatch ? langMatch[1] : '';
  const codeContent = lines.slice(1, -1).join('\n');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="chat-code-wrapper">
      <div className="chat-code-header">
        <span className="chat-code-lang">{lang || 'code'}</span>
        <div className="chat-code-actions">
          {copied && <span className="msg-copied-tag code">Copied!</span>}
          <button className="code-copy-btn" onClick={handleCopy}>
            {copied ? '✓' : '📋'}
          </button>
        </div>
      </div>
      <pre className="chat-code-block"><code>{codeContent}</code></pre>
    </div>
  );
}

function parseInlineMarkdown(text) {
  return text
    .split(/(\*\*.*?\*\*|\*.*?\*|\[.*?\]\(.*?\))/g)
    .map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('[') && part.includes('](')) {
        const match = part.match(/\[(.*?)\]\((.*?)\)/);
        if (match) {
          return <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer">{match[1]}</a>;
        }
      }
      return part;
    });
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
