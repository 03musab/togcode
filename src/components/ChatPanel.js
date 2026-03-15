// src/components/ChatPanel.js
import { useState, useRef, useEffect } from 'react';

export default function ChatPanel({ chatHistory, aiThinking, onSend, peers, userId }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, aiThinking]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput('');
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-title">⚡ AI Chat</span>
        <div className="peers-list">
          {Object.entries(peers).map(([uid, peer]) => (
            <div key={uid} className="peer-badge" style={{ backgroundColor: peer.color }}>
              {peer.name?.[0]?.toUpperCase() || '?'}
            </div>
          ))}
        </div>
      </div>

      <div className="chat-messages">
        {chatHistory.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">🤖</div>
            <p>Ask Claude anything about your code.</p>
            <p className="chat-empty-sub">Both of you can see this chat.</p>
          </div>
        )}
        {chatHistory.map((msg) => (
          <div key={msg.id} className={`chat-msg ${msg.role === 'assistant' ? 'ai' : msg.senderId === userId ? 'mine' : 'theirs'}`}>
            <div className="chat-msg-meta">
              {msg.role === 'assistant' ? '✦ Claude' : msg.senderName}
            </div>
            <div className="chat-msg-bubble">
              <MessageContent content={msg.content} />
            </div>
          </div>
        ))}
        {aiThinking && (
          <div className="chat-msg ai">
            <div className="chat-msg-meta">✦ Claude</div>
            <div className="chat-msg-bubble thinking">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Ask Claude... (Enter to send)"
          rows={2}
        />
        <button className="chat-send-btn" onClick={handleSend} disabled={aiThinking}>
          {aiThinking ? '...' : '↑'}
        </button>
      </div>
    </div>
  );
}

function MessageContent({ content }) {
  // Simple code block rendering
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <div>
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const lines = part.split('\n');
          const code = lines.slice(1, -1).join('\n');
          return <pre key={i} className="chat-code-block"><code>{code}</code></pre>;
        }
        return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>;
      })}
    </div>
  );
}
