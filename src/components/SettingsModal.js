// src/components/SettingsModal.js
import React, { useState, useEffect, useRef } from 'react';

import { useThemeContext } from '../hooks/useTheme';
import { getUserColor } from '../hooks/useRoom';
import './SettingsModal.css';

// ─── Allowed MIME types ───────────────────────────────────────────────────────
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateImageFile(file) {
  if (!ALLOWED_TYPES.has(file.type))
    return 'File type not supported. Please use JPEG, PNG, WebP, or GIF.';
  if (file.size > MAX_FILE_BYTES)
    return 'File is too large. Maximum size is 5 MB.';
  return null;
}

/** Compress image using OffscreenCanvas (off main thread) with canvas fallback */
async function compressImage(file, previewURL) {
  const MAX_SIZE = 256;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = previewURL;
    img.onload = () => {
      let { width, height } = img;
      if (width > height) {
        if (width > MAX_SIZE) { height = Math.round(height * MAX_SIZE / width); width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width = Math.round(width * MAX_SIZE / height); height = MAX_SIZE; }
      }

      // Try OffscreenCanvas first (faster, off-thread)
      if (typeof OffscreenCanvas !== 'undefined') {
        try {
          const oc = new OffscreenCanvas(width, height);
          oc.getContext('2d').drawImage(img, 0, 0, width, height);
          oc.convertToBlob({ type: 'image/webp', quality: 0.72 }).then(resolve).catch(() => fallback());
          return;
        } catch { /* fallback */ }
      }

      function fallback() {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('Compression failed')),
          'image/webp', 0.72
        );
      }
      fallback();
    };
    img.onerror = reject;
  });
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const Icons = {
  User: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Suite: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  Sliders: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
      <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
      <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
      <line x1="17" y1="16" x2="23" y2="16"/>
    </svg>
  ),
  Lock: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  Info: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  ),
  Camera: () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  ),
  Save: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
    </svg>
  ),
  Bell: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  BellOff: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      <path d="M18.63 13A17.89 17.89 0 0 1 18 8"/>
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/>
      <path d="M18 8a6 6 0 0 0-9.33-5"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ),
  Sun: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  ),
  Moon: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  Trash: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  ),
  Logout: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
};

// ─── Component ────────────────────────────────────────────────────────────────

const PRESET_AVATARS = [
  'https://api.dicebear.com/9.x/avataaars/svg?seed=Oliver&backgroundColor=b6e3f4',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=Amaya&backgroundColor=ffdfbf',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=Mason&backgroundColor=c0aede',
  'https://api.dicebear.com/9.x/bottts/svg?seed=Ryker&backgroundColor=d1d4f9',
  'https://api.dicebear.com/9.x/bottts/svg?seed=Eliza&backgroundColor=ffd5dc',
  'https://api.dicebear.com/9.x/bottts/svg?seed=Nova&backgroundColor=b6e3f4',
  'https://api.dicebear.com/9.x/micah/svg?seed=Felix&backgroundColor=d1d4f9',
  'https://api.dicebear.com/9.x/micah/svg?seed=Luna&backgroundColor=c0aede',
  'https://api.dicebear.com/9.x/micah/svg?seed=Sam&backgroundColor=ffdfbf',
  'https://api.dicebear.com/9.x/notionists/svg?seed=Techie&backgroundColor=fbebc8',
  'https://api.dicebear.com/9.x/notionists/svg?seed=Dev&backgroundColor=d1d4f9',
  'https://api.dicebear.com/9.x/notionists/svg?seed=Code&backgroundColor=ffd5dc',
];

const SettingsModal = ({
  onClose, user, session, onLogout, onLeaveRoom,
  notificationsMuted, setNotificationsMuted, onUpdateProfile,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editedName,     setEditedName]     = useState(session?.userName     || '');
  const [editedColor,    setEditedColor]    = useState(session?.userColor    || getUserColor(user?.uid || ''));
  const [editedPhotoURL, setEditedPhotoURL] = useState(session?.userPhotoURL || '');
  const [isUploading,    setIsUploading]    = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError,    setUploadError]    = useState('');
  const uploadTaskRef = useRef(null);

  const { theme, toggleTheme } = useThemeContext();

  useEffect(() => {
    setEditedName(session?.userName     || '');
    setEditedColor(session?.userColor   || getUserColor(user?.uid || ''));
    setEditedPhotoURL(session?.userPhotoURL || '');
  }, [session, user?.uid]);

  // Cancel upload on unmount
  useEffect(() => () => { uploadTaskRef.current?.cancel(); }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = '';

    const validationError = validateImageFile(file);
    if (validationError) { setUploadError(validationError); return; }

    setUploadError('');
    const previewURL = URL.createObjectURL(file);
    setEditedPhotoURL(previewURL);

    try {
      setIsUploading(true);
      setUploadProgress(0);

      // Compress off-main-thread
      const blob = await compressImage(file, previewURL);
      URL.revokeObjectURL(previewURL);

      // Convert the compressed blob to a base64 Data URL to save directly in Realtime Database!
      const resultDataURL = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      setEditedPhotoURL(resultDataURL);
      setUploadProgress(100);
      
      // Simulate brief loading for UI polish
      await new Promise(r => setTimeout(r, 400));
      
    } catch (err) {
      console.error('Image processing failed:', err);
      setUploadError('Image processing failed. Please try again.');
      setEditedPhotoURL(session?.userPhotoURL || '');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      uploadTaskRef.current = null;
    }
  };

  const handleSave = () => {
    if (isUploading) return;
    onUpdateProfile(editedName, editedColor, editedPhotoURL);
    onClose();
  };

  return (
    <div className="settings-page-wrapper">
      <div className="settings-header">
        <h2>Intelligence Suite Settings</h2>
        <button className="close-btn" onClick={onClose} aria-label="Close settings">&times;</button>
      </div>

      <div className="settings-body">

        {/* ── Profile ──────────────────────────────────────────────── */}
        <section className="settings-section">
          <div className="section-heading">
            <Icons.User /> User Profile
          </div>
          <div className="profile-edit-container">
            <div className="user-profile-info">
              <div className="avatar-upload-wrapper">
                <div className="user-avatar-large" style={{ backgroundColor: editedColor }}>
                  {editedPhotoURL ? (
                    <img
                      src={editedPhotoURL}
                      alt="Avatar"
                      className="user-avatar-img"
                      referrerPolicy="no-referrer"
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    (editedName?.[0] || user?.email?.[0])?.toUpperCase()
                  )}
                  {isUploading && (
                    <div className="avatar-loading-overlay">
                      <div className="upload-progress-bar-wrap">
                        <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }} />
                      </div>
                      <div className="upload-progress-pct">{uploadProgress}%</div>
                    </div>
                  )}
                </div>
                <label className="avatar-edit-label" title="Upload photo">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleFileChange}
                    hidden
                    disabled={isUploading}
                  />
                  <Icons.Camera />
                </label>
              </div>

              <div className="user-details">
                <input
                  className="settings-input"
                  value={editedName}
                  onChange={e => setEditedName(e.target.value)}
                  placeholder="Display Name"
                  maxLength={64}
                />
                <p className="user-email-display">{user?.email}</p>
                {uploadError && (
                  <p style={{ fontSize:'0.75rem', color:'var(--clr-red)', margin:0 }}>
                    {uploadError}
                  </p>
                )}
              </div>
            </div>

            <div className="color-picker-section">
              <label className="color-picker-label">Choose your Tech Persona</label>
              <div className="avatar-picker-grid">
                {PRESET_AVATARS.map(url => (
                  <button
                    key={url}
                    className={`avatar-preset-btn ${editedPhotoURL === url ? 'active' : ''}`}
                    onClick={() => setEditedPhotoURL(url)}
                    aria-label="Select tech persona"
                  >
                    <img src={url} alt="Preset Persona" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Suite Info ─────────────────────────────────────────────── */}
        <section className="settings-section">
          <div className="section-heading">
            <Icons.Suite /> Suite Information
          </div>
          <div className="suite-info-grid">
            <div className="info-item">
              <span className="info-label">Current Room</span>
              <span className="info-value">{session?.roomId}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Role</span>
              <span className="info-value">{session?.isHost ? 'Host / Owner' : 'Collaborator'}</span>
            </div>
          </div>
        </section>

        {/* ── Preferences ──────────────────────────────────────────── */}
        <section className="settings-section">
          <div className="section-heading">
            <Icons.Sliders /> Preferences
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Theme</span>
              <span className="setting-desc">Switch between dark and light theme</span>
            </div>
            <button
              className="theme-preference-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <><Icons.Sun /> Light</> : <><Icons.Moon /> Dark</>}
            </button>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Notification Sounds</span>
              <span className="setting-desc">Silence sound effects for presence events</span>
            </div>
            <button
              className={`notification-toggle-btn ${notificationsMuted ? 'muted' : 'enabled'}`}
              onClick={() => setNotificationsMuted(!notificationsMuted)}
            >
              {notificationsMuted ? <><Icons.BellOff /> Muted</> : <><Icons.Bell /> Enabled</>}
            </button>
          </div>
        </section>

        {/* ── Security ─────────────────────────────────────────────── */}
        <section className="settings-section">
          <div className="section-heading">
            <Icons.Lock /> Security
          </div>
          <div className="setting-item destructive">
            <div className="setting-info">
              <span className="setting-label">Logout</span>
              <span className="setting-desc">Sign out and clear session</span>
            </div>
            <button className="btn-danger-outline" onClick={onLogout}>
              <Icons.Logout /> Logout
            </button>
          </div>
          <div className="setting-item destructive" style={{ marginTop: '10px' }}>
            <div className="setting-info">
              <span className="setting-label">{session?.isHost ? 'Delete Room' : 'Leave Room'}</span>
              <span className="setting-desc">{session?.isHost ? 'Permanently delete this room and chat history' : 'Leave this room and return to join screen'}</span>
            </div>
            {session?.isHost ? (
              showDeleteConfirm ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-danger-solid" type="button" onClick={() => onLeaveRoom(true)}>Confirm Delete</button>
                  <button className="btn-secondary" type="button" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn-danger-outline" type="button" onClick={() => setShowDeleteConfirm(true)}>
                  <Icons.Trash /> Delete Room
                </button>
              )
            ) : (
              <button className="btn-danger-outline" type="button" onClick={() => onLeaveRoom(false)}>
                <Icons.Logout /> Leave Room
              </button>
            )}
          </div>
        </section>

        {/* ── About ────────────────────────────────────────────────── */}
        <section className="settings-section about-section">
          <div className="section-heading">
            <Icons.Info /> About
          </div>
          <div className="settings-footer">
            <p><strong>Togcode AI Intelligence Suite</strong> v1.0.5</p>
            <p>Real-time collaborative coding with AI-powered assistance</p>
            <p className="about-features">
              Live Collaboration · AI Intelligence · Real-time Sync
            </p>
          </div>
        </section>

      </div>

      <div className="settings-footer">
        <p className="settings-credits">© 2026 Togcode AI · Built with care</p>
        <div className="footer-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={isUploading}
          >
            {isUploading
              ? <><div className="spinner" style={{width:12,height:12}} /> Uploading…</>
              : <><Icons.Save /> Save Changes</>
            }
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;