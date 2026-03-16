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
          <span className="logo-tog">tog</span>
          <span className="logo-code">code</span>
        </div>
        <p className="join-tagline">The premium collaborative coding playground.</p>

        {!mode && (
          <div className="join-actions">
            <button className="btn-primary" onClick={() => setMode('create')}>
              Create New Suite
            </button>
            <button className="btn-secondary" onClick={() => setMode('join')}>
              Join Existing Room
            </button>
          </div>
        )}

        {mode && (
          <div className="join-form">
            <input
              className="join-input"
              placeholder="Display Name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
            {mode === 'join' && (
              <input
                className="join-input"
                placeholder="Room Code (e.g. A1B2C3D4)"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                maxLength={8}
              />
            )}
            <div className="join-form-actions">
              <button className="btn-ghost" onClick={() => setMode(null)}>← Go Back</button>
              <button
                className="btn-primary"
                onClick={mode === 'create' ? handleCreate : handleJoin}
                disabled={!name.trim() || (mode === 'join' && !roomCode.trim())}
              >
                {mode === 'create' ? 'Launch Suite' : 'Enter Room'}
              </button>
            </div>
          </div>
        )}

        <div className="join-features">
          <div className="feature-pill">⚡ Dynamic Sync</div>
          <div className="feature-pill">🤖 Project AI</div>
          <div className="feature-pill">👥 Live Collab</div>
        </div>
      </div>
    </div>
  );
}
