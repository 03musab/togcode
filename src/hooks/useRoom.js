// src/hooks/useRoom.js
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ref, onValue, set, push, update, serverTimestamp, off, onDisconnect, query, orderByChild, limitToLast } from 'firebase/database';
import { db } from '../lib/firebase';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Advanced Configuration
// ============================================================================

const DEBOUNCE_DELAY = 300;
const CURSOR_UPDATE_THROTTLE = 100;
const TYPING_TIMEOUT = 2000;
const MAX_CHAT_HISTORY = 50;
const MAX_FILE_PREVIEW = 3000;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const IDLE_THRESHOLD = 60000; // 1 minute

// ============================================================================
// Smart AI Configuration
// ============================================================================

const AI_CONFIG = {
  model: 'llama3.1-8b',
  temperature: 0.6,
  max_tokens: 1500,
};

// ============================================================================
// useRoom Hook
// ============================================================================

export function useRoom(roomId, userId, userName, userEmail) {
  // ========== Core State ==========
  const [chatHistory, setChatHistory] = useState([]);
  const [peers, setPeers] = useState({});
  const [aiThinking, setAiThinking] = useState(false);
  const [typingStatus, setTypingStatus] = useState({});

  // ========== Enhanced State ==========
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting', 'connected', 'offline'
  const [syncErrors, setSyncErrors] = useState([]);
  const [lastSync, setLastSync] = useState(Date.now());
  const [idlePeers, setIdlePeers] = useState(new Set());
  const [stats, setStats] = useState({ messagesSent: 0 });

  // ========== Refs ==========
  const typingTimeoutRef = useRef(null);
  const aiAbortControllerRef = useRef(null);

  // ========== Derived State ==========
  const activePeers = useMemo(() => {
    return Object.entries(peers)
      .filter(([uid, peer]) => uid !== userId && peer?.online)
      .map(([uid, peer]) => ({ ...peer, id: uid }));
  }, [peers, userId]);

  // ========== Presence Sync ==========
  useEffect(() => {
    if (!roomId || !userId) return;

    const presenceRef = ref(db, `rooms/${roomId}/peers/${userId}`);
    const userPresence = {
      name: userName,
      email: userEmail,
      lastSeen: serverTimestamp(),
      color: getUserColor(userId),
      online: true,
      status: 'active',
      stats: stats
    };

    try {
      set(presenceRef, userPresence).catch(err => {
        handleSyncError('presence', err);
      });
      onDisconnect(presenceRef).remove();
    } catch (err) {
      handleSyncError('presence', err);
    }

    const peersRef = ref(db, `rooms/${roomId}/peers`);
    const unsubscribe = onValue(peersRef, snap => {
      try {
        const peersData = snap.val() || {};
        setPeers(peersData);
        setConnectionStatus('connected');
        updateIdlePeers(peersData);
      } catch (err) {
        handleSyncError('peers', err);
      }
    }, err => {
      handleSyncError('peers', err);
      setConnectionStatus('offline');
    });

    return () => {
      set(presenceRef, null);
      off(peersRef);
      unsubscribe();
    };
  }, [roomId, userId, userName, stats]);

  // ========== Chat History Sync ==========
  useEffect(() => {
    if (!roomId) return;

    const chatRef = ref(db, `rooms/${roomId}/chat`);
    const limitedChatQuery = query(chatRef, limitToLast(MAX_CHAT_HISTORY));

    const unsubscribe = onValue(limitedChatQuery, snap => {
      try {
        const val = snap.val();
        if (val) {
          const msgs = Object.entries(val)
            .map(([id, msg]) => ({ id, ...msg }))
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          setChatHistory(msgs);
        }
      } catch (err) {
        handleSyncError('chat', err);
      }
    }, err => {
      handleSyncError('chat', err);
    });

    return () => {
      off(chatRef);
      unsubscribe();
    };
  }, [roomId]);

  // ========== Typing Status Sync ==========
  useEffect(() => {
    if (!roomId) return;

    const typingRef = ref(db, `rooms/${roomId}/typing`);
    const myTypingRef = ref(db, `rooms/${roomId}/typing/${userId}`);
    onDisconnect(myTypingRef).remove();

    const unsubscribe = onValue(typingRef, snap => {
      try {
        const val = snap.val() || {};
        const othersTyping = {};
        const now = Date.now();

        Object.entries(val).forEach(([uid, data]) => {
          if (uid !== userId && data?.isTyping && (now - (data.timestamp || 0)) < TYPING_TIMEOUT) {
            othersTyping[uid] = data;
          }
        });
        setTypingStatus(othersTyping);
      } catch (err) {
        handleSyncError('typing', err);
      }
    }, err => {
      handleSyncError('typing', err);
    });

    return () => {
      off(typingRef);
      unsubscribe();
    };
  }, [roomId, userId]);

  // ========== Idle Detection ==========
  useEffect(() => {
    const interval = setInterval(() => {
      setIdlePeers(prev => {
        const now = Date.now();
        const idle = new Set();
        Object.entries(peers).forEach(([uid, peer]) => {
          if (uid !== userId && peer?.lastSeen) {
            const timeSinceActivity = now - (peer.lastSeen || 0);
            if (timeSinceActivity > IDLE_THRESHOLD) {
              idle.add(uid);
            }
          }
        });
        return idle;
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [peers, userId]);

  // ========== Helper Functions ==========

  const handleSyncError = useCallback((source, error) => {
    const errorMsg = `${source}: ${error.message}`;
    setSyncErrors(prev => [...prev.slice(-9), errorMsg]);
    console.error(`[useRoom] Sync error in ${source}:`, error);
  }, []);

  const updateIdlePeers = useCallback((peersData) => {
    const now = Date.now();
    const idle = new Set();
    Object.entries(peersData).forEach(([uid, peer]) => {
      if (uid !== userId && peer?.lastSeen) {
        if (now - peer.lastSeen > IDLE_THRESHOLD) {
          idle.add(uid);
        }
      }
    });
    setIdlePeers(idle);
  }, [userId]);

  const setTyping = useCallback((isTyping) => {
    if (!roomId || !userId) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      update(ref(db, `rooms/${roomId}/typing/${userId}`), {
        isTyping,
        name: userName,
        timestamp: Date.now()
      }).catch(err => {
        handleSyncError('setTyping', err);
      });

      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          setTyping(false);
        }, TYPING_TIMEOUT);
      }
    } catch (err) {
      handleSyncError('setTyping', err);
    }
  }, [roomId, userId, userName, handleSyncError]);

  // ========== AI Chat ==========

  const sendAiMessage = useCallback(async (message) => {
    if (!roomId || !message.trim()) return;

    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
    }
    aiAbortControllerRef.current = new AbortController();

    const messageId = uuidv4();
    const chatRef = ref(db, `rooms/${roomId}/chat`);

    try {
      await push(chatRef, {
        id: messageId,
        role: 'user',
        content: message,
        senderName: userName,
        senderEmail: userEmail,
        senderId: userId,
        timestamp: Date.now()
      }).catch(err => {
        throw new Error(`Failed to send message: ${err.message}`);
      });

      setAiThinking(true);
      setStats(prev => ({ ...prev, messagesSent: prev.messagesSent + 1 }));

      const history = chatHistory.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.role === 'user' ? `[${m.senderName}]: ${m.content}` : m.content
      }));

      history.push({ role: 'user', content: `[${userName}]: ${message}` });

      const systemPrompt = `You are Togcode AI, an elite software hub assistant. You collaborate with engineers in real-time.
      
      CORE DIRECTIVES:
      1. Provide accurate, senior-level technical advice.
      2. Keep responses concise and actionable.
      3. Active user: ${userName}
      4. Collaborators: ${activePeers.length > 0 ? activePeers.map(p => p.name).join(', ') : 'None'}`;

      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: AI_CONFIG.model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.slice(-10)
          ],
          temperature: AI_CONFIG.temperature,
          max_tokens: AI_CONFIG.max_tokens,
        }),
        signal: aiAbortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Backend Error ${response.status}: ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content || 'I encountered an error processing your request.';

      await push(chatRef, {
        role: 'assistant',
        content: aiResponse,
        senderName: 'Togcode AI',
        senderId: 'ai',
        timestamp: Date.now()
      }).catch(err => {
        throw new Error(`Failed to save AI response: ${err.message}`);
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      handleSyncError('sendAiMessage', err);
    } finally {
      setAiThinking(false);
      aiAbortControllerRef.current = null;
    }
  }, [roomId, userName, userId, chatHistory, activePeers, handleSyncError, userEmail]);

  // ========== Cleanup ==========
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (aiAbortControllerRef.current) aiAbortControllerRef.current.abort();
    };
  }, []);

  return {
    chatHistory,
    peers,
    aiThinking,
    typingStatus,
    connectionStatus,
    syncErrors,
    lastSync,
    idlePeers,
    stats,
    activePeers,
    setTyping,
    sendAiMessage,
    formatLastSeen,
    clearSyncErrors: () => setSyncErrors([]),
  };
}

// ============================================================================
// Utility Functions
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
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function getConnectionStatusColor(status) {
  return {
    'connected': '#10b981',
    'connecting': '#f59e0b',
    'offline': '#ef4444'
  }[status] || '#9ca3af';
}