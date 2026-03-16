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
  const [files, setFiles] = useState({});
  const [activeFileId, setActiveFileId] = useState(null);
  const [cursors, setCursors] = useState({});
  const [chatHistory, setChatHistory] = useState([]);
  const [peers, setPeers] = useState({});
  const [aiThinking, setAiThinking] = useState(false);
  const [typingStatus, setTypingStatus] = useState({});

  // ========== Enhanced State ==========
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting', 'connected', 'offline'
  const [syncErrors, setSyncErrors] = useState([]);
  const [lastSync, setLastSync] = useState(Date.now());
  const [idlePeers, setIdlePeers] = useState(new Set());
  const [conflictMarkers, setConflictMarkers] = useState({}); // Track merge conflicts
  const [fileVersions, setFileVersions] = useState({}); // Track file versions
  const [suggestions, setSuggestions] = useState(null); // AI suggestions
  const [stats, setStats] = useState({ messagesSent: 0, codesChanged: 0, filesCreated: 0 });

  // ========== Refs ==========
  const suppressRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const cursorThrottleRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const cacheRef = useRef({});
  const lastCursorUpdateRef = useRef(Date.now());
  const aiAbortControllerRef = useRef(null);

  // ========== Derived State ==========
  const activePeers = useMemo(() => {
    return Object.entries(peers)
      .filter(([uid, peer]) => uid !== userId && peer?.online)
      .map(([uid, peer]) => ({ ...peer, id: uid }));
  }, [peers, userId]);

  const activeCollaborators = useMemo(() => {
    return activePeers.filter(p => p.activeFileId === activeFileId);
  }, [activePeers, activeFileId]);

  const projectStats = useMemo(() => {
    const fileCount = Object.keys(files).length;
    const totalSize = Object.values(files).reduce((sum, f) => sum + (f.content?.length || 0), 0);
    const languages = new Set(Object.values(files).map(f => detectLanguage(f.name)));
    const lastEdit = Object.values(files).reduce((max, f) => Math.max(max, f.lastModified || 0), 0);
    return { fileCount, totalSize, languages: Array.from(languages), lastEdit };
  }, [files]);

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
      activeFileId,
      status: 'active', // 'active', 'idle', 'away'
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
  }, [roomId, userId, userName, activeFileId, stats]);

  // ========== Files Sync ==========
  useEffect(() => {
    if (!roomId) return;

    const filesRef = ref(db, `rooms/${roomId}/files`);
    const unsubscribe = onValue(filesRef, snap => {
      try {
        const val = snap.val() || {};
        if (!suppressRef.current) {
          setFiles(val);
          setFileVersions(prev => ({
            ...prev,
            ...Object.keys(val).reduce((acc, id) => ({
              ...acc,
              [id]: (prev[id] || 0) + 1
            }), {})
          }));

          // Auto-selection of first file disabled to ensure dashboard visibility on reload
        }
        setLastSync(Date.now());
        setConnectionStatus('connected');
      } catch (err) {
        handleSyncError('files', err);
      }
    }, err => {
      handleSyncError('files', err);
      setConnectionStatus('offline');
    });

    return () => {
      off(filesRef);
      unsubscribe();
    };
  }, [roomId, activeFileId]);

  // ========== Cursors Sync (Optimized) ==========
  useEffect(() => {
    if (!roomId) return;

    const cursorsRef = ref(db, `rooms/${roomId}/cursors`);
    const myCursorRef = ref(db, `rooms/${roomId}/cursors/${userId}`);
    onDisconnect(myCursorRef).remove();

    const unsubscribe = onValue(cursorsRef, snap => {
      try {
        const val = snap.val() || {};
        const others = {};
        Object.entries(val).forEach(([uid, data]) => {
          if (uid !== userId && data) others[uid] = data;
        });
        setCursors(others);
      } catch (err) {
        handleSyncError('cursors', err);
      }
    }, err => {
      handleSyncError('cursors', err);
    });

    return () => {
      off(cursorsRef);
      unsubscribe();
    };
  }, [roomId, userId]);

  // ========== Chat History Sync ==========
  useEffect(() => {
    if (!roomId) return;

    const chatRef = ref(db, `rooms/${roomId}/chat`);
    // Only fetch last N messages for performance
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
          // Only show typing status if recently updated
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


  // ========== File Operations ==========

  const updateCode = useCallback((fileId, newContent) => {
    if (!fileId) return;

    // Validate content
    if (typeof newContent !== 'string') {
      handleSyncError('updateCode', new Error('Content must be a string'));
      return;
    }

    // Local optimistic update
    suppressRef.current = true;
    setFiles(prev => ({
      ...prev,
      [fileId]: {
        ...prev[fileId],
        content: newContent,
        lastModified: Date.now(),
        lastModifiedBy: userId
      }
    }));

    // Update stats
    setStats(prev => ({ ...prev, codesChanged: prev.codesChanged + 1 }));

    // Debounced Firebase update
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      try {
        update(ref(db, `rooms/${roomId}/files/${fileId}`), {
          content: newContent,
          lastModified: Date.now(),
          lastModifiedBy: userId
        }).catch(err => {
          handleSyncError('updateCode', err);
          suppressRef.current = false;
        });
        suppressRef.current = false;
      } catch (err) {
        handleSyncError('updateCode', err);
        suppressRef.current = false;
      }
    }, DEBOUNCE_DELAY);
  }, [roomId, userId, handleSyncError]);

  const createFile = useCallback((name, initialContent = '// New file\n') => {
    if (!name || !roomId) return null;

    const fileId = uuidv4();
    const newFile = {
      name,
      content: initialContent,
      createdAt: Date.now(),
      createdBy: userId,
      language: detectLanguage(name),
      size: initialContent.length,
      version: 1
    };

    try {
      set(ref(db, `rooms/${roomId}/files/${fileId}`), newFile).catch(err => {
        handleSyncError('createFile', err);
      });
      setActiveFileId(fileId);
      setStats(prev => ({ ...prev, filesCreated: prev.filesCreated + 1 }));
      return fileId;
    } catch (err) {
      handleSyncError('createFile', err);
      return null;
    }
  }, [roomId, userId, detectLanguage, handleSyncError]);

  const deleteFile = useCallback((fileId) => {
    if (!fileId || !roomId) return;

    const remainingIds = Object.keys(files).filter(id => id !== fileId);
    if (remainingIds.length === 0) {
      handleSyncError('deleteFile', new Error('Cannot delete the last file'));
      return;
    }

    try {
      set(ref(db, `rooms/${roomId}/files/${fileId}`), null).catch(err => {
        handleSyncError('deleteFile', err);
      });

      if (activeFileId === fileId) {
        setActiveFileId(remainingIds[0]);
      }
    } catch (err) {
      handleSyncError('deleteFile', err);
    }
  }, [roomId, files, activeFileId, handleSyncError]);

  const renameFile = useCallback((fileId, newName) => {
    if (!fileId || !newName || !roomId) return;

    if (files[fileId]?.name === newName) return; // No change

    try {
      update(ref(db, `rooms/${roomId}/files/${fileId}`), {
        name: newName,
        language: detectLanguage(newName),
        lastModified: Date.now()
      }).catch(err => {
        handleSyncError('renameFile', err);
      });
    } catch (err) {
      handleSyncError('renameFile', err);
    }
  }, [roomId, files, detectLanguage, handleSyncError]);

  // ========== Cursor & Presence ==========

  const updateCursor = useCallback((position) => {
    const now = Date.now();
    // Throttle cursor updates
    if (now - lastCursorUpdateRef.current < CURSOR_UPDATE_THROTTLE) return;

    lastCursorUpdateRef.current = now;

    try {
      update(ref(db, `rooms/${roomId}/cursors/${userId}`), {
        position,
        activeFileId,
        name: userName,
        color: getUserColor(userId),
        updatedAt: now
      }).catch(err => {
        handleSyncError('updateCursor', err);
      });
    } catch (err) {
      handleSyncError('updateCursor', err);
    }
  }, [roomId, userId, userName, activeFileId, handleSyncError]);

  const setTyping = useCallback((isTyping) => {
    if (!roomId || !userId) return;

    // Clear previous timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      update(ref(db, `rooms/${roomId}/typing/${userId}`), {
        isTyping,
        name: userName,
        timestamp: Date.now()
      }).catch(err => {
        handleSyncError('setTyping', err);
      });

      // Auto-clear typing status after timeout
      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          setTyping(false);
        }, TYPING_TIMEOUT);
      }
    } catch (err) {
      handleSyncError('setTyping', err);
    }
  }, [roomId, userId, userName, handleSyncError]);

  // ========== AI Chat with Smart Context ==========

  const buildSmartContext = useCallback(() => {
    const hasFiles = Object.keys(files).length > 0;

    if (!hasFiles) {
      return "The project is currently empty. No files have been created yet.";
    }

    const sortedFiles = Object.values(files).sort((a, b) => {
      if (a.id === activeFileId) return -1;
      if (b.id === activeFileId) return 1;
      return (b.lastModified || 0) - (a.lastModified || 0);
    });

    let context = `Project Overview:
- Files: ${Object.keys(files).length}
- Total Size: ${(projectStats.totalSize / 1024).toFixed(2)} KB
- Languages: ${projectStats.languages.join(', ')}
- Active File: ${files[activeFileId]?.name || 'None'}

Project Files:\n`;

    sortedFiles.forEach((f, idx) => {
      const isActive = f.id === activeFileId ? ' (ACTIVE)' : '';
      const lang = f.language || 'Unknown';
      context += `\n${idx + 1}. ${f.name}${isActive} [${lang}]`;

      if (f.content) {
        const preview = f.content.length > MAX_FILE_PREVIEW
          ? f.content.substring(0, MAX_FILE_PREVIEW) + '\n... (truncated)'
          : f.content;
        context += `\n\`\`\`${lang.toLowerCase()}\n${preview}\n\`\`\``;
      }
    });

    return context;
  }, [files, activeFileId, projectStats]);

  const sendAiMessage = useCallback(async (message) => {
    if (!roomId || !message.trim()) return;

    // Cancel previous request if still pending
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
    }
    aiAbortControllerRef.current = new AbortController();

    const messageId = uuidv4();
    const chatRef = ref(db, `rooms/${roomId}/chat`);

    try {
      // Add user message
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

      // Build conversation history
      const history = chatHistory.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.role === 'user'
          ? `[${m.senderName}]: ${m.content}`
          : m.content
      }));

      history.push({ role: 'user', content: `[${userName}]: ${message}` });

      // Get smart context
      const projectContext = buildSmartContext();

      const systemPrompt = `You are Togcode AI, an elite senior software engineer and pair programmer.

CORE DIRECTIVES:
1. ONLY discuss and reference files that are actually present in the provided project context
2. If project is empty, acknowledge and offer to help create initial files
3. NEVER hallucinate files, folders, or project structures not shown in context
4. Keep responses concise, professional, and actionable
5. Provide code examples from actual project files when relevant
6. Ask clarifying questions if context is ambiguous

CONTEXT AWARENESS:
- Active user: ${userName}
- Current file: ${files[activeFileId]?.name || 'None selected'}
- Project statistics: ${projectStats.fileCount} files, ${projectStats.languages.join(', ')}
- Active collaborators: ${activeCollaborators.length > 0 ? activeCollaborators.map(p => p.name).join(', ') : 'None'}

PROJECT CONTEXT:
${projectContext}`;

      const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer csk-yjmhny5wcyh5dmt4wf9f5mp3k6w4cvkerw2vrh4ceyxh46vr`
        },
        body: JSON.stringify({
          model: AI_CONFIG.model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.slice(-10) // Keep conversation focused
          ],
          temperature: AI_CONFIG.temperature,
          max_tokens: AI_CONFIG.max_tokens,
        }),
        signal: aiAbortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`API Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content || 'I encountered an error processing your request.';

      // Add AI response to chat
      await push(chatRef, {
        role: 'assistant',
        content: aiResponse,
        senderName: 'Togcode AI',
        senderId: 'ai',
        timestamp: Date.now()
      }).catch(err => {
        throw new Error(`Failed to save AI response: ${err.message}`);
      });

      // Extract and suggest improvements if applicable
      if (aiResponse.includes('suggest') || aiResponse.includes('improve')) {
        setSuggestions(aiResponse);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('AI request cancelled');
        return;
      }

      const errorMessage = `Service Error: ${err.message}`;

      try {
        await push(chatRef, {
          role: 'assistant',
          content: errorMessage,
          senderName: 'Togcode AI',
          senderId: 'ai',
          timestamp: Date.now(),
          isError: true
        }).catch(() => {
          // Fail silently if can't save error message
        });
      } catch (pushErr) {
        handleSyncError('sendAiMessage', pushErr);
      }

      handleSyncError('sendAiMessage', err);
    } finally {
      setAiThinking(false);
      aiAbortControllerRef.current = null;
    }
  }, [
    roomId,
    userName,
    userId,
    chatHistory,
    activeFileId,
    files,
    buildSmartContext,
    activeCollaborators,
    handleSyncError,
    projectStats
  ]);

  // ========== Cleanup ==========

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (aiAbortControllerRef.current) aiAbortControllerRef.current.abort();
    };
  }, []);

  // ========== Return Object ==========

  return {
    // Core state
    files,
    activeFileId,
    setActiveFileId,
    cursors,
    chatHistory,
    peers,
    aiThinking,
    typingStatus,

    // Enhanced state
    connectionStatus,
    syncErrors,
    lastSync,
    idlePeers,
    suggestions,
    stats,
    projectStats,
    lastEditTime: projectStats.lastEdit,

    // Active data
    activePeers,
    activeCollaborators,

    // File operations
    createFile,
    deleteFile,
    renameFile,
    updateCode,

    // Presence & Interaction
    updateCursor,
    setTyping,

    // AI
    sendAiMessage,
    buildSmartContext,

    // Utilities
    detectLanguage,
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

export function detectLanguage(fileName) {
  if (!fileName) return 'Unknown';
  const ext = fileName.split('.').pop().toLowerCase();
  const languageMap = {
    js: 'JavaScript',
    jsx: 'JSX',
    ts: 'TypeScript',
    tsx: 'TSX',
    py: 'Python',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    rb: 'Ruby',
    php: 'PHP',
    go: 'Go',
    rs: 'Rust',
    swift: 'Swift',
    kt: 'Kotlin',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    less: 'LESS',
    json: 'JSON',
    xml: 'XML',
    yaml: 'YAML',
    sql: 'SQL',
    sh: 'Shell',
    bash: 'Bash',
  };
  return languageMap[ext] || ext.toUpperCase();
}

// ============================================================================
// Utilities for Components
// ============================================================================

export function formatFileSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
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