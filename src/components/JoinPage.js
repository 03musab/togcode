// src/components/JoinPage.js
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

export default function JoinPage({ onJoin }) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState(null); // 'create' | 'join'

  const handleCreate = () => {
    if (!name.trim()) return;
    const newRoom = uuidv4().slice(0, 8).toUpperCase();
    onJoin(newRoom, name.trim());
  };

  const handleJoin = () => {
    if (!name.trim() || !roomCode.trim()) return;
    onJoin(roomCode.trim().toUpperCase(), name.trim());
  };

  return (
    <div className="join-page">
      <div className="join-card">
        <div className="join-logo">
          <span className="logo-vibe">vibe</span>
          <span className="logo-code">code</span>
        </div>
        <p className="join-tagline">Pair program with AI in the room.</p>

        {!mode && (
          <div className="join-actions">
            <button className="btn-primary" onClick={() => setMode('create')}>
              Create Room
            </button>
            <button className="btn-secondary" onClick={() => setMode('join')}>
              Join Room
            </button>
          </div>
        )}

        {mode && (
          <div className="join-form">
            <input
              className="join-input"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
            {mode === 'join' && (
              <input
                className="join-input"
                placeholder="Room code"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                maxLength={8}
              />
            )}
            <div className="join-form-actions">
              <button className="btn-ghost" onClick={() => setMode(null)}>← Back</button>
              <button
                className="btn-primary"
                onClick={mode === 'create' ? handleCreate : handleJoin}
                disabled={!name.trim() || (mode === 'join' && !roomCode.trim())}
              >
                {mode === 'create' ? 'Create & Enter' : 'Join Room'}
              </button>
            </div>
          </div>
        )}

        <div className="join-features">
          <span>⚡ Real-time sync</span>
          <span>🤖 Shared AI chat</span>
          <span>👥 Live cursors</span>
        </div>
      </div>
    </div>
  );
}
