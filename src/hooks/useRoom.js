// src/hooks/useRoom.js
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  ref, onValue, set, push, update,
  serverTimestamp, off, onDisconnect,
  query, limitToLast, get,
} from 'firebase/database';
import { db } from '../lib/firebase';


// ============================================================================
// Configuration
// ============================================================================

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

// ✅ Use env variable — supports both full URLs and bare hostnames (Render's fromService host)
const rawApiUrl = process.env.REACT_APP_API_URL || '';
const normalizedUrl = rawApiUrl && !rawApiUrl.startsWith('http') ? `https://${rawApiUrl}` : rawApiUrl;
const API_BASE_URL = normalizedUrl.endsWith('/') ? normalizedUrl.slice(0, -1) : normalizedUrl;

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

export function useRoom(roomId, userId, userName, userEmail, userColor, userPhotoURL, onSyncError) {
  const [chatHistory, setChatHistory] = useState([]);
  const [peers, setPeers] = useState({});
  const [aiThinking, setAiThinking] = useState(false);
  const [typingStatus, setTypingStatus] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [syncErrors, setSyncErrors] = useState([]);
  const [idlePeers, setIdlePeers] = useState(new Set());
  const [nodes, setNodes] = useState({});
  const [connections, setConnections] = useState({});
  const [workflowNodes, setWorkflowNodes] = useState({});
  const [workflowConnections, setWorkflowConnections] = useState({});
  const [stats, setStats] = useState({ messagesSent: 0 });
  const [syncStats, setSyncStats] = useState({ latency: 0, p95: 0 });

  const typingTimeoutRef = useRef(null);
  const aiAbortControllerRef = useRef(null);
  const chatHistoryRef = useRef(chatHistory);
  const rateLimiterRef = useRef(new RateLimiter(10, 15000));
  const lastWriteTimestamps = useRef({}); // { [nodeId/msgId]: startTime }
  const latencyHistory = useRef([]); // [delta, delta, ...]
  const processedCommands = useRef(new Set()); // Keep track of executed workflow commands

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
    if (onSyncError) onSyncError(`${source}: ${error.message}`, 'error');
  }, [onSyncError]);

  const trackLatency = useCallback((id, serverTimestamp) => {
    if (!serverTimestamp) return;
    const startTime = lastWriteTimestamps.current[id];
    if (startTime) {
      const delta = Date.now() - startTime;
      latencyHistory.current = [...latencyHistory.current.slice(-19), delta];
      const p95 = [...latencyHistory.current].sort((a, b) => a - b)[Math.floor(latencyHistory.current.length * 0.95)] || delta;
      setSyncStats({ latency: delta, p95 });
      delete lastWriteTimestamps.current[id];
    }
  }, []);

  // ─── Presence update ────────────────────────────────────────────────────

  const updatePresence = useCallback(() => {
    if (!roomId || !userId) return;
    update(ref(db, `rooms/${roomId}/peers/${userId}`), { lastSeen: serverTimestamp() })
      .catch(err => handleSyncError('updatePresence', err));
  }, [roomId, userId, handleSyncError]);

  // ─── Presence Hook ───────────────────────────────────────────────────────

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
    }).catch(err => handleSyncError('presenceOnDisconnect', err));

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
      
      const entries = Object.entries(val);
      // Track latency for the latest message if it was ours
      const latest = entries[entries.length - 1];
      if (latest) trackLatency(latest[0], latest[1].timestamp);

      const msgs = entries
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
    onDisconnect(myTypingRef).remove()
      .catch(err => handleSyncError('typingOnDisconnect', err));

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

  // ─── Logic sync ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !userId || !isValidRoomId(roomId)) return;
    const nodesRef = ref(db, `rooms/${roomId}/nodes`);

    const unsub = onValue(nodesRef, snap => {
      const val = snap.val() || {};
      // Track latency for the most recently updated node
      const entries = Object.entries(val);
      if (entries.length > 0) {
        const latest = entries.reduce((prev, curr) => (curr[1].timestamp > prev[1].timestamp) ? curr : prev);
        trackLatency(latest[0], latest[1].timestamp);
      }
      setNodes(val);
    }, err => handleSyncError('nodes', err));

    return () => { off(nodesRef); unsub(); };
  }, [roomId, userId, handleSyncError]);

  // ─── Connections sync ────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !userId || !isValidRoomId(roomId)) return;
    const connRef = ref(db, `rooms/${roomId}/connections`);

    const unsub = onValue(connRef, snap => {
      const val = snap.val() || {};
      const entries = Object.entries(val);
      if (entries.length > 0) {
        const latest = entries.reduce((prev, curr) => (curr[1].timestamp > prev[1].timestamp) ? curr : prev);
        trackLatency(latest[0], latest[1].timestamp);
      }
      setConnections(val);
    }, err => handleSyncError('connections', err));

    return () => { off(connRef); unsub(); };
  }, [roomId, userId, handleSyncError]);

  // ─── Workflow sync handlers ─────────────────────────────────────────────

  const updateWorkflowNode = useCallback((nodeId, data) => {
    if (!roomId || !nodeId) return;
    const nodeRef = ref(db, `rooms/${roomId}/workflow/nodes/${nodeId}`);
    return update(nodeRef, { ...data, timestamp: Date.now(), updatedBy: userId })
      .catch(err => handleSyncError('updateWorkflowNode', err));
  }, [roomId, userId, handleSyncError]);

  const deleteWorkflowNode = useCallback((nodeId) => {
    if (!roomId || !nodeId) return;
    const nodeRef = ref(db, `rooms/${roomId}/workflow/nodes/${nodeId}`);
    return set(nodeRef, null)
      .catch(err => handleSyncError('deleteWorkflowNode', err));
  }, [roomId, handleSyncError]);

  const updateWorkflowConnection = useCallback((connId, data) => {
    if (!roomId || !connId) return;
    const connRef = ref(db, `rooms/${roomId}/workflow/connections/${connId}`);
    return set(connRef, { ...data, timestamp: Date.now(), createdBy: userId })
      .catch(err => handleSyncError('updateWorkflowConnection', err));
  }, [roomId, userId, handleSyncError]);

  const deleteWorkflowConnection = useCallback((connId) => {
    if (!roomId || !connId) return;
    const connRef = ref(db, `rooms/${roomId}/workflow/connections/${connId}`);
    return set(connRef, null)
      .catch(err => handleSyncError('deleteWorkflowConnection', err));
  }, [roomId, handleSyncError]);

  const clearWorkflow = useCallback(async () => {
    if (!roomId) return;
    try {
      const nodesRef = ref(db, `rooms/${roomId}/workflow/nodes`);
      const connsRef = ref(db, `rooms/${roomId}/workflow/connections`);
      
      const [nodesSnap, connsSnap] = await Promise.all([
        get(nodesRef),
        get(connsRef)
      ]);
      
      const updates = {};
      
      if (nodesSnap.exists()) {
        Object.keys(nodesSnap.val()).forEach(id => {
          updates[`rooms/${roomId}/workflow/nodes/${id}`] = null;
        });
      }
      
      if (connsSnap.exists()) {
        Object.keys(connsSnap.val()).forEach(id => {
          updates[`rooms/${roomId}/workflow/connections/${id}`] = null;
        });
      }
      
      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
      }
    } catch (err) {
      handleSyncError('clearWorkflow', err);
    }
  }, [roomId, handleSyncError]);

  // ─── Workflow Commands processor ────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !chatHistory.length) return;

    chatHistory.forEach(msg => {
      if (msg.role === 'assistant') {
        const msgId = msg.id || msg.timestamp;
        const processedId = `processed_wf_${msgId}`;

        if (processedCommands.current.has(processedId) || localStorage.getItem(processedId)) {
          return;
        }

        try {
          const content = msg.content;
          const marker = '"action"';
          const workflowAction = '"CREATE_WORKFLOW"';
          
          // Look for action marker in the message
          if (content.includes(marker) && content.includes(workflowAction)) {
            // Find the start of the object containing this action
            const actionIdx = content.indexOf(workflowAction);
            const startIdx = content.lastIndexOf('{', actionIdx);
            
            if (startIdx !== -1) {
              // Extract the object by matching braces
              let braceCount = 0;
              let endIdx = -1;
              for (let i = startIdx; i < content.length; i++) {
                if (content[i] === '{') braceCount++;
                else if (content[i] === '}') braceCount--;
                
                if (braceCount === 0) {
                  endIdx = i;
                  break;
                }
              }

              if (endIdx !== -1) {
                const jsonStr = content.substring(startIdx, endIdx + 1);
                const command = JSON.parse(jsonStr);
                
                if (command.action === 'CREATE_WORKFLOW') {
                  console.log('[WorkflowProcessor] Executing command:', msgId);
                  processedCommands.current.add(processedId);
                  localStorage.setItem(processedId, 'true');

                  if (command.clear) clearWorkflow();

                  if (Array.isArray(command.nodes)) {
                    command.nodes.forEach(n => {
                      const safeNode = {
                        ...n,
                        type: n.type || 'process',
                        label: n.label || 'New Node',
                        x: typeof n.x === 'number' ? n.x : 200,
                        y: typeof n.y === 'number' ? n.y : 200
                      };
                      updateWorkflowNode(safeNode.id || uuidv4(), safeNode);
                    });
                  }
                  if (Array.isArray(command.connections)) {
                    command.connections.forEach(c => {
                      if (c.sourceId && c.targetId) {
                        updateWorkflowConnection(uuidv4(), c);
                      }
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error('[WorkflowCommand] Parse Error:', e, 'Source:', msg.content.substring(0, 50) + '...');
        }
      }
    });
  }, [chatHistory, roomId, updateWorkflowNode, updateWorkflowConnection, clearWorkflow]);

  // ─── Workflow Data sync ──────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !userId || !isValidRoomId(roomId)) return;
    const wfNodesRef = ref(db, `rooms/${roomId}/workflow/nodes`);
    const unsubNodes = onValue(wfNodesRef, snap => setWorkflowNodes(snap.val() || {}), err => handleSyncError('workflowNodes', err));
    
    const wfConnRef = ref(db, `rooms/${roomId}/workflow/connections`);
    const unsubConn = onValue(wfConnRef, snap => setWorkflowConnections(snap.val() || {}), err => handleSyncError('workflowConnections', err));

    return () => { off(wfNodesRef); off(wfConnRef); unsubNodes(); unsubConn(); };
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

  // ─── AI chat logic ───────────────────────────────────────────────────────

  const buildSystemPrompt = useCallback(() => {
    const collaborators = activePeers.length > 0
      ? activePeers.map(p => sanitizeString(p.name, MAX_NAME_LENGTH)).join(', ')
      : 'none';

    const blueprintSummary = Object.entries(nodes || {})
      .map(([id, data]) => `- [${data.intent?.toUpperCase()}] ID: ${id} | Status: ${data.status}`)
      .join('\n');

    const workflowSummary = Object.entries(workflowNodes || {})
      .map(([id, data]) => `- [${data.type?.toUpperCase()}] ${data.label} (ID: ${id})`)
      .join('\n');

    return `You are Togcode AI — an elite senior software engineer.
User: ${sanitizeString(userName, MAX_NAME_LENGTH)}
Team Online: ${collaborators}

[BLUEPRINT CONTEXT]:
${blueprintSummary || 'No active logic nodes.'}

[WORKFLOW CONTEXT]:
${workflowSummary || 'No visual workflow nodes.'}

- Provide senior-staff technical advice.
- IMPORTANT: To generate visual workflows, you MUST include a \`\`\`workflow_command\`\`\` JSON block in your response.
- CRITICAL: Every node MUST have a "type" field set to 'start', 'process', 'decision', 'io', or 'end'.
- Block format:
\`\`\`workflow_command
{
  "action": "CREATE_WORKFLOW",
  "clear": true,
  "nodes": [
    { "id": "n1", "x": 100, "y": 100, "type": "start", "label": "Start Process" },
    { "id": "n2", "x": 400, "y": 100, "type": "io", "label": "Get Username" },
    { "id": "n3", "x": 700, "y": 100, "type": "decision", "label": "Valid User?" },
    { "id": "n4", "x": 1000, "y": 100, "type": "end", "label": "Success" }
  ],
  "connections": [
    { "sourceId": "n1", "targetId": "n2" },
    { "sourceId": "n2", "targetId": "n3" },
    { "sourceId": "n3", "targetId": "n4" }
  ]
}
\`\`\`
- Layout: Use ~300px horizontal spacing.`;
  }, [userName, activePeers, nodes, workflowNodes]);

  const sendAiMessage = useCallback(async (message, modelOverride = null, attachments = []) => {
    if (!roomId || !isValidRoomId(roomId)) return;

    const safeMsg = sanitizeString(message, MAX_MSG_LENGTH);
    if (!safeMsg.trim() && attachments.length === 0) return;

    if (!rateLimiterRef.current.isAllowed()) {
      console.warn('[useRoom] Rate limit exceeded');
      return;
    }

    updatePresence();
    const targetModel = modelOverride || AI_CONFIG.model;

    aiAbortControllerRef.current?.abort();
    aiAbortControllerRef.current = new AbortController();

    const chatRef = ref(db, `rooms/${roomId}/chat`);
    
    // 1. Send user message
    await push(chatRef, {
      role: 'user',
      content: safeMsg,
      attachments: attachments.slice(0, 3).map(a => ({ name: a.name, type: a.type, size: a.size, data: a.data })),
      senderName: sanitizeString(userName, MAX_NAME_LENGTH),
      senderEmail: sanitizeString(userEmail, 128),
      senderId: userId,
      timestamp: Date.now(),
    }).catch(err => { throw new Error(`Failed to send: ${err.message}`); });

    const isMentioned = safeMsg.toLowerCase().includes('@tagcode');
    if (!isMentioned) return;

    // 2. Start AI generation
    setAiThinking(true);
    try {
      const history = chatHistoryRef.current
        .slice(-AI_CONTEXT_WINDOW)
        .map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.role === 'user' ? `[${m.senderName}]: ${m.content}` : m.content,
        }));

      history.push({ role: 'user', content: `[${userName}]: ${safeMsg}` });

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

      if (!response.ok) throw new Error(`Backend Error: ${response.status}`);

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content?.trim() || 'No response from AI.';

      await push(chatRef, {
        role: 'assistant',
        content: aiResponse,
        senderName: 'Togcode AI',
        senderId: 'ai',
        timestamp: Date.now(),
        model: targetModel,
      });

    } catch (err) {
      if (err.name === 'AbortError') return;
      handleSyncError('sendAiMessage', err);
      await push(chatRef, { role: 'assistant', content: `_Error: ${err.message}_`, senderName: 'Togcode AI', senderId: 'ai', timestamp: Date.now(), isError: true });
    } finally {
      setAiThinking(false);
      aiAbortControllerRef.current = null;
    }
  }, [roomId, userName, userId, userEmail, buildSystemPrompt, handleSyncError, updatePresence]);

  // ─── Canvas logic handlers ───────────────────────────────────────────────

  const updateNode = useCallback((nodeId, data) => {
    if (!roomId || !userId || !nodeId) return;
    return update(ref(db, `rooms/${roomId}/nodes/${nodeId}`), { ...data, timestamp: Date.now(), updatedBy: userId })
      .catch(err => handleSyncError('updateNode', err));
  }, [roomId, userId, handleSyncError]);

  const deleteNode = useCallback((nodeId) => {
    if (!roomId || !nodeId) return;
    return set(ref(db, `rooms/${roomId}/nodes/${nodeId}`), null)
      .catch(err => handleSyncError('deleteNode', err));
  }, [roomId, handleSyncError]);

  const updateConnection = useCallback((connId, data) => {
    if (!roomId || !connId) return;
    return set(ref(db, `rooms/${roomId}/connections/${connId}`), { ...data, createdBy: userId, timestamp: Date.now() })
      .catch(err => handleSyncError('updateConnection', err));
  }, [roomId, userId, handleSyncError]);

  const deleteConnection = useCallback((connId) => {
    if (!roomId || !connId) return;
    return set(ref(db, `rooms/${roomId}/connections/${connId}`), null)
      .catch(err => handleSyncError('deleteConnection', err));
  }, [roomId, handleSyncError]);

  return {
    chatHistory, peers, aiThinking, typingStatus,
    connectionStatus, syncErrors, idlePeers, stats, activePeers,
    nodes, connections, workflowNodes, workflowConnections, syncStats,
    setTyping, sendAiMessage, updateNode, deleteNode,
    updateConnection, deleteConnection,
    updateWorkflowNode, deleteWorkflowNode,
    updateWorkflowConnection, deleteWorkflowConnection,
    clearWorkflow,
    formatLastSeen, clearSyncErrors: () => setSyncErrors([]),
  };
}

export function getUserColor(userId) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7B731', '#5F27CD', '#00D2D3', '#FF9FF3', '#54A0FF'];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
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
