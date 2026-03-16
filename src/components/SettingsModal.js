import React from 'react';
import './SettingsModal.css';

export default function SettingsModal({ isOpen, onClose, user, session, onLogout }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-left">
            <h3>⚙️ Studio Settings</h3>
            <span className="modal-subtitle">Configure your workspace</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <section className="settings-section">
            <h4>Profile</h4>
            <div className="setting-item-group">
              <div className="setting-profile">
                <div className="profile-large-avatar" style={{ backgroundColor: 'var(--accent)' }}>
                  {session?.userName?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="profile-details">
                  <span className="profile-name">{session?.userName}</span>
                  <span className="profile-email">{user?.email}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h4>Workspace</h4>
            <div className="setting-item">
              <div className="setting-info">
                <span className="setting-label">Room ID</span>
                <span className="setting-desc">Current collaboration suite identifier</span>
              </div>
              <div className="setting-value mono">{session?.roomId}</div>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <span className="setting-label">Editor Theme</span>
                <span className="setting-desc">One Dark (Standard)</span>
              </div>
              <div className="setting-value">
                <select className="setting-select" disabled>
                  <option>One Dark Pro</option>
                </select>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h4>Security</h4>
            <div className="setting-item destructive">
              <div className="setting-info">
                <span className="setting-label">Logout</span>
                <span className="setting-desc">Sign out and clear session</span>
              </div>
              <button className="btn-danger-outline" onClick={onLogout}>Logout</button>
            </div>
          </section>
        </div>

        <div className="modal-footer">
          <p className="modal-credits">Togcode v1.0.4 • Powered by Realtime Sync</p>
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
