// src/hooks/useRoom.js
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ref, onValue, set, push, update,
  serverTimestamp, off, onDisconnect,
  query, orderByChild, limitToLast,
} from 'firebase/database';
import { db } from '../lib/firebase';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Configuration
// ============================================================================

const DEBOUNCE_DELAY = 300;
const TYPING_TIMEOUT = 2000;
const MAX_CHAT_HISTORY = 50;
const IDLE_THRESHOLD = 60000;
const IDLE_POLL_INTERVAL = 15000;

const MAX_MSG_LENGTH = 2000;
const MAX_NAME_LENGTH = 64;

const AI_CONFIG = {
  model: 'togcode-ai-3-lite',
  temperature: 0.6,
  max_tokens: 1500,
};

const AI_CONTEXT_WINDOW = 10;

// ✅ Use env variable — no more hardcoded localhost
const API_BASE_URL = process.env.REACT_APP_API_URL || '';

// ============================================================================
// Security helpers
// ============================================================================

/** Strip XSS chars, enforce max length */
function sanitizeString(str, maxLen = MAX_NAME_LENGTH) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'&]/g, '').slice(0, maxLen);
}

/** Room IDs must be alphanumeric 4-32 chars */
function isValidRoomId(id) {
  return typeof id === 'string' && /^[A-Z0-9]{4,32}$/i.test(id);
}

/** Validate photo URL — allow http(s) or data URLs */
function sanitizePhotoURL(url) {
  if (typeof url !== 'string') return null;
  if (/^https?:\/\/.+/.test(url)) return url;
  if (/^data:image\/[a-zA-Z0-9]+;base64,/.test(url)) return url;
  return null;
}

// ============================================================================
// Client-side rate limiter
// ============================================================================

class RateLimiter {
  constructor(maxMessages = 10, windowMs = 15000) {
    this.maxMessages = maxMessages;
    this.windowMs = windowMs;
    this.timestamps = [];
  }
  isAllowed() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxMessages) return false;
    this.timestamps.push(now);
    return true;
  }
}

// ============================================================================
// useRoom Hook
// ============================================================================

export function useRoom(roomId, userId, userName, userEmail, userColor, userPhotoURL) {
  const [chatHistory, setChatHistory] = useState([]);
  const [peers, setPeers] = useState({});
  const [aiThinking, setAiThinking] = useState(false);
  const [typingStatus, setTypingStatus] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [syncErrors, setSyncErrors] = useState([]);
  const [idlePeers, setIdlePeers] = useState(new Set());
  const [stats, setStats] = useState({ messagesSent: 0 });

  const typingTimeoutRef = useRef(null);
  const aiAbortControllerRef = useRef(null);
  const chatHistoryRef = useRef(chatHistory);
  const rateLimiterRef = useRef(new RateLimiter(10, 15000));

  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);

  const activePeers = useMemo(() =>
    Object.entries(peers)
      .filter(([uid, peer]) => uid !== userId && peer?.online)
      .map(([uid, peer]) => ({ ...peer, id: uid })),
    [peers, userId]
  );

  // ─── Error handler ──────────────────────────────────────────────────────

  const handleSyncError = useCallback((source, error) => {
    console.error(`[useRoom] ${source}:`, error);
    setSyncErrors(prev => [...prev.slice(-9), `${source}: ${error.message}`]);
  }, []);

  // ─── Presence ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !userId) return;
    if (!isValidRoomId(roomId)) {
      console.warn('[useRoom] Invalid roomId, skipping presence:', roomId);
      return;
    }

    const presenceRef = ref(db, `rooms/${roomId}/peers/${userId}`);
    const safePhoto = sanitizePhotoURL(userPhotoURL);

    set(presenceRef, {
      name: sanitizeString(userName, MAX_NAME_LENGTH),
      email: sanitizeString(userEmail, 128),
      lastSeen: serverTimestamp(),
      color: /^#[0-9A-Fa-f]{6}$/.test(userColor || '') ? userColor : getUserColor(userId),
      photoURL: safePhoto,
      online: true,
      status: 'active',
    }).catch(err => handleSyncError('presence', err));

    onDisconnect(presenceRef).update({
      online: false,
      status: 'offline',
      lastSeen: serverTimestamp(),
    });

    const peersRef = ref(db, `rooms/${roomId}/peers`);
    const unsub = onValue(peersRef, snap => {
      const data = snap.val() || {};
      setPeers(data);
      setConnectionStatus('connected');
      const now = Date.now();
      const idle = new Set(
        Object.entries(data)
          .filter(([uid, p]) => uid !== userId && p?.lastSeen && now - p.lastSeen > IDLE_THRESHOLD)
          .map(([uid]) => uid)
      );
      setIdlePeers(idle);
    }, err => { handleSyncError('peers', err); setConnectionStatus('offline'); });

    return () => { set(presenceRef, null); off(peersRef); unsub(); };
  }, [roomId, userId, userName, userEmail, userColor, userPhotoURL, handleSyncError]);

  // ─── Chat sync ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !userId || !isValidRoomId(roomId)) return;
    const chatRef = ref(db, `rooms/${roomId}/chat`);
    const chatQuery = query(chatRef, limitToLast(MAX_CHAT_HISTORY));

    const unsub = onValue(chatQuery, snap => {
      const val = snap.val();
      if (!val) { setChatHistory([]); return; }
      const msgs = Object.entries(val)
        .map(([id, msg]) => ({ id, ...msg }))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setChatHistory(msgs);
    }, err => handleSyncError('chat', err));

    return () => { off(chatRef); unsub(); };
  }, [roomId, userId, handleSyncError]);

  // ─── Typing status ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !userId) return;
    const typingRef = ref(db, `rooms/${roomId}/typing`);
    const myTypingRef = ref(db, `rooms/${roomId}/typing/${userId}`);
    onDisconnect(myTypingRef).remove();

    const unsub = onValue(typingRef, snap => {
      const val = snap.val() || {};
      const now = Date.now();
      const others = Object.fromEntries(
        Object.entries(val).filter(([uid, d]) =>
          uid !== userId && d?.isTyping && now - (d.timestamp || 0) < TYPING_TIMEOUT
        )
      );
      setTypingStatus(others);
    }, err => handleSyncError('typing', err));

    return () => { off(typingRef); unsub(); };
  }, [roomId, userId, handleSyncError]);

  // ─── Idle polling ───────────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setIdlePeers(new Set(
        Object.entries(peers)
          .filter(([uid, p]) => uid !== userId && p?.lastSeen && now - p.lastSeen > IDLE_THRESHOLD)
          .map(([uid]) => uid)
      ));
    }, IDLE_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [peers, userId]);

  // ─── Presence update ────────────────────────────────────────────────────

  const updatePresence = useCallback(() => {
    if (!roomId || !userId) return;
    update(ref(db, `rooms/${roomId}/peers/${userId}`), { lastSeen: serverTimestamp() })
      .catch(err => handleSyncError('updatePresence', err));
  }, [roomId, userId, handleSyncError]);

  // ─── Typing ─────────────────────────────────────────────────────────────

  const setTyping = useCallback((isTyping) => {
    if (!roomId || !userId) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTyping) updatePresence();
    update(ref(db, `rooms/${roomId}/typing/${userId}`), {
      isTyping,
      name: sanitizeString(userName, MAX_NAME_LENGTH),
      timestamp: Date.now(),
    }).catch(err => handleSyncError('setTyping', err));
    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => setTyping(false), TYPING_TIMEOUT);
    }
  }, [roomId, userId, userName, handleSyncError, updatePresence]);

  // ─── AI chat ────────────────────────────────────────────────────────────

  const buildSystemPrompt = useCallback(() => {
    const collaborators = activePeers.length > 0
      ? activePeers.map(p => sanitizeString(p.name, MAX_NAME_LENGTH)).join(', ')
      : 'none';
    return `You are Togcode AI — an elite senior software engineer.

You participate with Musab's peers. You only speak via chat constraints. User: ${sanitizeString(userName, MAX_NAME_LENGTH)}
- Team Online: ${collaborators}

DIRECTIVES:
- Provide senior-staff level technical advice.
- Be concise, accurate, and direct.`;
  }, [userName, activePeers]);

  const sendAiMessage = useCallback(async (message, modelOverride = null) => {
    if (!roomId || !isValidRoomId(roomId)) return;

    const safeMsg = sanitizeString(message, MAX_MSG_LENGTH);
    if (!safeMsg.trim()) return;

    if (!rateLimiterRef.current.isAllowed()) {
      console.warn('[useRoom] Rate limit: too many messages');
      return;
    }

    updatePresence();
    const targetModel = modelOverride || AI_CONFIG.model;

    aiAbortControllerRef.current?.abort();
    aiAbortControllerRef.current = new AbortController();

    const chatRef = ref(db, `rooms/${roomId}/chat`);

    await push(chatRef, {
      role: 'user',
      content: safeMsg,
      senderName: sanitizeString(userName, MAX_NAME_LENGTH),
      senderEmail: sanitizeString(userEmail, 128),
      senderId: userId,
      timestamp: Date.now(),
    }).catch(err => { throw new Error(`Failed to send message: ${err.message}`); });

    setAiThinking(true);
    setStats(prev => ({ ...prev, messagesSent: prev.messagesSent + 1 }));

    try {
      const history = chatHistoryRef.current
        .slice(-AI_CONTEXT_WINDOW)
        .map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.role === 'user'
            ? `[${sanitizeString(m.senderName, MAX_NAME_LENGTH) || 'User'}]: ${m.content}`
            : m.content,
        }));

      history.push({ role: 'user', content: `[${sanitizeString(userName, MAX_NAME_LENGTH)}]: ${safeMsg}` });

      // ✅ Uses env variable instead of hardcoded localhost
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: 'system', content: buildSystemPrompt() }, ...history],
          temperature: AI_CONFIG.temperature,
          max_tokens: AI_CONFIG.max_tokens,
        }),
        signal: aiAbortControllerRef.current.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Backend ${response.status}: ${err.error || response.statusText}`);
      }

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content?.trim()
        || '_Encountered a processing error. Please try again._';

      await push(chatRef, {
        role: 'assistant',
        content: aiResponse,
        senderName: 'Togcode AI',
        senderId: 'ai',
        timestamp: Date.now(),
        model: targetModel,
      }).catch(err => { throw new Error(`Failed to save AI response: ${err.message}`); });

    } catch (err) {
      if (err.name === 'AbortError') return;
      handleSyncError('sendAiMessage', err);

      await push(chatRef, {
        role: 'assistant',
        content: `_Error: ${err.message}_`,
        senderName: 'Togcode AI',
        senderId: 'ai',
        timestamp: Date.now(),
        isError: true,
      }).catch(() => { });
    } finally {
      setAiThinking(false);
      aiAbortControllerRef.current = null;
    }
  }, [roomId, userName, userId, userEmail, buildSystemPrompt, handleSyncError, updatePresence]);

  // ─── Cleanup ────────────────────────────────────────────────────────────

  useEffect(() => () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    aiAbortControllerRef.current?.abort();
  }, []);

  return {
    chatHistory, peers, aiThinking, typingStatus,
    connectionStatus, syncErrors, idlePeers, stats, activePeers,
    setTyping, sendAiMessage,
    formatLastSeen, clearSyncErrors: () => setSyncErrors([]),
  };
}

// ============================================================================
// Utilities
// ============================================================================

export function getUserColor(userId) {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7B731',
    '#5F27CD', '#00D2D3', '#FF9FF3', '#54A0FF',
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function formatLastSeen(timestamp) {
  const s = Math.floor((Date.now() - timestamp) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function getConnectionStatusColor(status) {
  return { connected: '#10b981', connecting: '#f59e0b', offline: '#ef4444' }[status] ?? '#9ca3af';
}