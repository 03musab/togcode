// src/hooks/useRoom.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { ref, onValue, set, push, update, serverTimestamp, off } from 'firebase/database';
import { db } from '../lib/firebase';

export function useRoom(roomId, userId, userName) {
  const [code, setCode] = useState('// Start coding together!\n');
  const [cursors, setCursors] = useState({});
  const [chatHistory, setChatHistory] = useState([]);
  const [peers, setPeers] = useState({});
  const [aiThinking, setAiThinking] = useState(false);
  const suppressRef = useRef(false);

  // Join room and set presence
  useEffect(() => {
    if (!roomId || !userId) return;
    const presenceRef = ref(db, `rooms/${roomId}/peers/${userId}`);
    set(presenceRef, { name: userName, lastSeen: serverTimestamp(), color: getUserColor(userId) });

    const peersRef = ref(db, `rooms/${roomId}/peers`);
    onValue(peersRef, snap => {
      setPeers(snap.val() || {});
    });

    return () => {
      set(presenceRef, null);
      off(peersRef);
    };
  }, [roomId, userId, userName]);

  // Sync code
  useEffect(() => {
    if (!roomId) return;
    const codeRef = ref(db, `rooms/${roomId}/code`);
    onValue(codeRef, snap => {
      const val = snap.val();
      if (val !== null && !suppressRef.current) {
        setCode(val);
      }
    });
    return () => off(codeRef);
  }, [roomId]);

  // Sync cursors
  useEffect(() => {
    if (!roomId) return;
    const cursorsRef = ref(db, `rooms/${roomId}/cursors`);
    onValue(cursorsRef, snap => {
      const val = snap.val() || {};
      const others = {};
      Object.entries(val).forEach(([uid, data]) => {
        if (uid !== userId) others[uid] = data;
      });
      setCursors(others);
    });
    return () => off(cursorsRef);
  }, [roomId, userId]);

  // Sync chat history
  useEffect(() => {
    if (!roomId) return;
    const chatRef = ref(db, `rooms/${roomId}/chat`);
    onValue(chatRef, snap => {
      const val = snap.val();
      if (val) {
        const msgs = Object.entries(val)
          .map(([id, msg]) => ({ id, ...msg }))
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setChatHistory(msgs);
      }
    });
    return () => off(chatRef);
  }, [roomId]);

  const updateCode = useCallback((newCode) => {
    suppressRef.current = true;
    setCode(newCode);
    set(ref(db, `rooms/${roomId}/code`), newCode);
    setTimeout(() => { suppressRef.current = false; }, 100);
  }, [roomId]);

  const updateCursor = useCallback((position) => {
    update(ref(db, `rooms/${roomId}/cursors/${userId}`), {
      position,
      name: userName,
      color: getUserColor(userId),
      updatedAt: Date.now()
    });
  }, [roomId, userId, userName]);

  const sendAiMessage = useCallback(async (message) => {
    if (!roomId) return;
    const chatRef = ref(db, `rooms/${roomId}/chat`);

    // Save user message
    await push(chatRef, {
      role: 'user',
      content: message,
      senderName: userName,
      senderId: userId,
      timestamp: Date.now()
    });

    setAiThinking(true);

    try {
      // Build messages array from history
      const history = chatHistory.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.role === 'user' ? `[${m.senderName}]: ${m.content}` : m.content
      }));

      history.push({ role: 'user', content: `[${userName}]: ${message}` });

      const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer csk-yjmhny5wcyh5dmt4wf9f5mp3k6w4cvkerw2vrh4ceyxh46vr`
        },
        body: JSON.stringify({
          model: 'llama3.1-8b',
          messages: [
            {
              role: 'system',
              content: `You are a helpful pair programming AI inside a collaborative coding session called Togcode. Two developers are coding together in real time. The current code is:\n\n\`\`\`\n${code}\n\`\`\`\n\nHelp them with code questions, bugs, suggestions, and explanations. Be concise and friendly.`
            },
            ...history.slice(-20)
          ]
        })
      });

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content || 'Sorry, something went wrong.';

      await push(chatRef, {
        role: 'assistant',
        content: aiResponse,
        senderName: 'Cerebras AI',
        senderId: 'ai',
        timestamp: Date.now()
      });
    } catch (err) {
      await push(chatRef, {
        role: 'assistant',
        content: `Error reaching Cerebras: ${err.message}`,
        senderName: 'Cerebras AI',
        senderId: 'ai',
        timestamp: Date.now()
      });
    } finally {
      setAiThinking(false);
    }
  }, [roomId, userName, userId, code, chatHistory]);

  return { code, cursors, chatHistory, peers, aiThinking, updateCode, updateCursor, sendAiMessage };
}

function getUserColor(userId) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
