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
          <span className="chat-title">⚡ Intelligence Hub</span>
          {messageStats.total > 0 && (
            <div className="chat-stats">
              <span className="stat-badge">{messageStats.user} Q</span>
              <span className="stat-badge">{messageStats.ai} A</span>
            </div>
          )}
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
            <div className="chat-empty-icon">✨</div>
            <h3>Ready to assist</h3>
            <p>Ask questions about your project and get instant AI-powered insights.</p>
            <div className="chat-empty-hints">
              <div className="hint-item">💡 Context syncs automatically</div>
              <div className="hint-item">🤝 Collaborate in real-time</div>
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
          <div className="chat-msg ai">
            <div className="chat-msg-meta">✦ Togcode AI</div>
            <div className="chat-msg-bubble thinking">
              <span /><span /><span />
            </div>
          </div>
        )}

        {Object.values(typingStatus).length > 0 && (
          <div className="chat-typing-indicator">
            <div className="typing-dots">
              <span /><span /><span />
            </div>
            <span className="typing-text">
              {Object.values(typingStatus).map(s => s.name).join(', ')} {Object.values(typingStatus).length === 1 ? 'is' : 'are'} typing...
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
          ↓
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
            placeholder="Ask anything..."
            disabled={aiThinking}
            rows={1}
            maxLength={2000}
          />
          <div className="input-footer">
            <span className="char-count">{input.length}/2000</span>
            <span className="input-hints">Enter to send</span>
          </div>
        </div>

        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || aiThinking}
        >
          {aiThinking ? '...' : '↑'}
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
  const isAI = message.role === 'assistant';
  const isOwn = !isAI && message.senderId === userId;
  const messageClass = isAI ? 'ai' : isOwn ? 'mine' : 'theirs';

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
        </div>
        
        {isHovered && (
          <div className="chat-msg-actions">
            <button className="msg-action-btn" onClick={onCopy} title="Copy">📋</button>
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
        <button className="code-copy-btn" onClick={handleCopy}>
          {copied ? '✓' : '📋'}
        </button>
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
