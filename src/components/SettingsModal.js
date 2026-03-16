import React from 'react';
import './SettingsModal.css';
import { getUserColor } from '../hooks/useRoom';

const SettingsModal = ({ isOpen, onClose, user, session, onLogout }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Intelligence Hub Settings</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <section className="settings-section">
            <h3>User Profile</h3>
            <div className="user-profile-info">
              <div className="user-avatar-large" style={{ backgroundColor: getUserColor(user.uid) }}>
                {session?.userName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
              </div>
              <div className="user-details">
                <p className="user-name-display">{session?.userName || 'Anonymous'}</p>
                <p className="user-email-display">{user.email}</p>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3>Hub Information</h3>
            <div className="hub-info-grid">
              <div className="info-item">
                <span className="info-label">Current Room</span>
                <span className="info-value">{session.roomId}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Role</span>
                <span className="info-value">Collaborator</span>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3>Security</h3>
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
          <p className="modal-credits">Togcode v1.0.5 • Intelligence Hub</p>
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
