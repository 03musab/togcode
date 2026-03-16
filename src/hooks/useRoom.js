// src/hooks/useRoom.js
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ref, onValue, set, push, update, serverTimestamp, off, onDisconnect, query, orderByChild, limitToLast } from 'firebase/database';
import { db } from '../lib/firebase';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Configuration
// ============================================================================

const DEBOUNCE_DELAY = 300;
const TYPING_TIMEOUT = 2000;
const MAX_CHAT_HISTORY = 50;
const IDLE_THRESHOLD = 60000;

const AI_CONFIG = {
  model: 'togcode-3-lite',
  temperature: 0.6,
  max_tokens: 1500,
};

// How many chat turns to send as context
const AI_CONTEXT_WINDOW = 10;

// ============================================================================
// useRoom Hook
// ============================================================================

export function useRoom(roomId, userId, userName, userEmail) {
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
  const chatHistoryRef = useRef(chatHistory); // stable ref for callbacks

  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);

  const activePeers = useMemo(() =>
    Object.entries(peers)
      .filter(([uid, peer]) => uid !== userId && peer?.online)
      .map(([uid, peer]) => ({ ...peer, id: uid })),
    [peers, userId]
  );

  // ========== Error Handler ==========

  const handleSyncError = useCallback((source, error) => {
    console.error(`[useRoom] ${source}:`, error);
    setSyncErrors(prev => [...prev.slice(-9), `${source}: ${error.message}`]);
  }, []);

  // ========== Presence ==========

  useEffect(() => {
    if (!roomId || !userId) return;
    const presenceRef = ref(db, `rooms/${roomId}/peers/${userId}`);

    set(presenceRef, {
      name: userName, email: userEmail,
      lastSeen: serverTimestamp(),
      color: getUserColor(userId),
      online: true, status: 'active',
    }).catch(err => handleSyncError('presence', err));

    onDisconnect(presenceRef).remove();

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
  }, [roomId, userId, userName, userEmail, handleSyncError]);

  // ========== Chat Sync ==========

  useEffect(() => {
    if (!roomId) return;
    const chatRef = ref(db, `rooms/${roomId}/chat`);
    const chatQuery = query(chatRef, limitToLast(MAX_CHAT_HISTORY));

    const unsub = onValue(chatQuery, snap => {
      const val = snap.val();
      if (!val) return;
      const msgs = Object.entries(val)
        .map(([id, msg]) => ({ id, ...msg }))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setChatHistory(msgs);
    }, err => handleSyncError('chat', err));

    return () => { off(chatRef); unsub(); };
  }, [roomId, handleSyncError]);

  // ========== Typing Status ==========

  useEffect(() => {
    if (!roomId) return;
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

  // ========== Idle Polling ==========

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setIdlePeers(new Set(
        Object.entries(peers)
          .filter(([uid, p]) => uid !== userId && p?.lastSeen && now - p.lastSeen > IDLE_THRESHOLD)
          .map(([uid]) => uid)
      ));
    }, 10000);
    return () => clearInterval(id);
  }, [peers, userId]);

  // ========== Typing ==========

  const setTyping = useCallback((isTyping) => {
    if (!roomId || !userId) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    update(ref(db, `rooms/${roomId}/typing/${userId}`), {
      isTyping, name: userName, timestamp: Date.now()
    }).catch(err => handleSyncError('setTyping', err));
    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => setTyping(false), TYPING_TIMEOUT);
    }
  }, [roomId, userId, userName, handleSyncError]);

  // ========== AI Chat ==========

  const buildSystemPrompt = useCallback(() => {
    const collaborators = activePeers.length > 0
      ? activePeers.map(p => p.name).join(', ')
      : 'none';

    return `You are Togcode — an elite senior software engineer. 
Collaborative Room Context:
- Active User: ${userName}
- Team Online: ${collaborators}

DIRECTIVES:
- Provide senior-staff level technical advice.
- Be concise, accurate, and direct.
- Use clean Markdown and code blocks.`;
  }, [userName, activePeers]);

  const sendAiMessage = useCallback(async (message, modelOverride = null) => {
    if (!roomId || !message.trim()) return;
    
    const targetModel = modelOverride || AI_CONFIG.model;

    // Cancel any in-flight request
    aiAbortControllerRef.current?.abort();
    aiAbortControllerRef.current = new AbortController();

    const chatRef = ref(db, `rooms/${roomId}/chat`);

    // 1. Push user message
    await push(chatRef, {
      role: 'user',
      content: message,
      senderName: userName,
      senderEmail: userEmail,
      senderId: userId,
      timestamp: Date.now(),
    }).catch(err => { throw new Error(`Failed to send message: ${err.message}`); });

    setAiThinking(true);
    setStats(prev => ({ ...prev, messagesSent: prev.messagesSent + 1 }));

    try {
      // 2. Build conversation context
      const history = chatHistoryRef.current
        .slice(-AI_CONTEXT_WINDOW)
        .map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.role === 'user'
            ? `[${m.senderName || 'User'}]: ${m.content}`
            : m.content,
        }));

      // Append the current message
      history.push({ role: 'user', content: `[${userName}]: ${message}` });

      // 3. Call Backend Proxy
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel,
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            ...history
          ],
          temperature: AI_CONFIG.temperature,
          max_tokens: AI_CONFIG.max_tokens,
        }),
        signal: aiAbortControllerRef.current.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Intelligence Hub Backend ${response.status}: ${err.error || response.statusText}`);
      }

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content?.trim()
        || '_Encountered a processing error. Please try again._';

      // 4. Push AI response
      await push(chatRef, {
        role: 'assistant',
        content: aiResponse,
        senderName: 'Togcode',
        senderId: 'ai',
        timestamp: Date.now(),
        model: targetModel,
      }).catch(err => { throw new Error(`Failed to save AI response: ${err.message}`); });

    } catch (err) {
      if (err.name === 'AbortError') return;
      handleSyncError('sendAiMessage', err);

      // Push a visible error message into chat so users see what went wrong
      await push(chatRef, {
        role: 'assistant',
        content: `_⚠️ Error: ${err.message}_`,
        senderName: 'Togcode',
        senderId: 'ai',
        timestamp: Date.now(),
        isError: true,
      }).catch(() => { });
    } finally {
      setAiThinking(false);
      aiAbortControllerRef.current = null;
    }
  }, [roomId, userName, userId, userEmail, buildSystemPrompt, handleSyncError]);

  // ========== Cleanup ==========

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
    '#5F27CD', '#00D2D3', '#FF9FF3', '#54A0FF'
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