import React from 'react';
import './Dashboard.css';

export default function Dashboard({ userName, fileCount, onNewFile }) {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-content">
        <div className="dashboard-header-greet">
          <span className="greet-text">{getGreeting()}, {userName}</span>
          <h1>Welcome to your Togcode Studio</h1>
        </div>

        <div className="dashboard-grid">
          <div className="dash-card main">
            <div className="dash-card-icon">🚀</div>
            <h3>Get Started</h3>
            <p>Create a new file or select an existing one from the sidebar to start collaborating.</p>
            <button className="btn-primary" onClick={onNewFile}>Create New File</button>
          </div>

          <div className="dash-card stats">
            <div className="stat-item">
              <span className="stat-value">{fileCount}</span>
              <span className="stat-label">Project Files</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">Realtime</span>
              <span className="stat-label">Sync Active</span>
            </div>
          </div>

          <div className="dash-card info">
            <h3>Did you know?</h3>
            <ul className="info-list">
              <li>⌘K opens the quick search palette</li>
              <li>Hover avatars to see peer emails</li>
              <li>AI can help you refactor via Chat</li>
            </ul>
          </div>
        </div>

        <div className="dashboard-footer">
          <div className="footer-logo">
            <span className="logo-tog">tog</span>
            <span className="logo-code">code</span>
          </div>
          <span className="footer-ver">v1.0.4 Ready</span>
        </div>
      </div>
    </div>
  );
}
