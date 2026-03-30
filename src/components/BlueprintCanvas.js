// src/components/BlueprintCanvas.js
import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import NodeElement from './NodeElement';
import './BlueprintCanvas.css';

// ─── Cubic bezier path between two points ────────────────────────────────────
function makePath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1) * 0.6;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

// NODE_WIDTH is the pixel width of a NodeElement — used for socket offset math
const NODE_WIDTH = 250;
const SOCKET_Y_OFFSET = 44; // Adjusted for 24px padding + 40px header height centering

export default function BlueprintCanvas({
  nodes, updateNode, deleteNode,
  connections, updateConnection, deleteConnection,
  activeNode, setActiveNode, userId,
  canvasMode, setCanvasMode,
}) {
  const canvasRef    = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [localNodePositions, setLocalNodePositions] = useState({});
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  const handleZoom = (delta) => {
    setZoom(prev => Math.min(Math.max(prev + delta, 0.4), 2.0));
  };

  const resetZoom = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  // ─── Panning Logic ────────────────────────────────────────────────────────
  const startPan = (e) => {
    // Start panning if we didn't click on a node or socket (which call stopPropagation)
    setIsPanning(true);
    panStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };

  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e) => {
      setOffset({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y
      });
    };
    const onUp = () => setIsPanning(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isPanning, offset.x, offset.y]);

  // ─── Wiring drag state ────────────────────────────────────────────────────
  const [wiring, setWiring] = useState(null);
  // wiring = { sourceNodeId, startX, startY, mouseX, mouseY }

  // ─── Node socket positions (keyed by nodeId) ──────────────────────────────
  // We compute approximate positions from node data (x, y, width).
  // For output socket: right edge center of node header.
  // For input socket:  left edge center of node header.
  const getOutputPos = useCallback((nodeId) => {
    const n = nodes[nodeId];
    if (!n) return { x: 0, y: 0 };
    const localPos = localNodePositions[nodeId];
    const x = localPos?.x ?? n.x;
    const y = localPos?.y ?? n.y;
    return { x: x + NODE_WIDTH, y: y + SOCKET_Y_OFFSET };
  }, [nodes, localNodePositions]);

  const getInputPos = useCallback((nodeId) => {
    const n = nodes[nodeId];
    if (!n) return { x: 0, y: 0 };
    const localPos = localNodePositions[nodeId];
    const x = localPos?.x ?? n.x;
    const y = localPos?.y ?? n.y;
    return { x, y: y + SOCKET_Y_OFFSET };
  }, [nodes, localNodePositions]);

  const handleNodePositionChange = useCallback((nodeId, nextPos) => {
    setLocalNodePositions(prev => ({ ...prev, [nodeId]: nextPos }));
  }, []);

  const handleNodeDragEnd = useCallback((nodeId, finalPos) => {
    setLocalNodePositions(prev => ({ ...prev, [nodeId]: finalPos }));
    window.setTimeout(() => {
      setLocalNodePositions(prev => {
        if (!prev[nodeId]) return prev;
        const next = { ...prev };
        delete next[nodeId];
        return next;
      });
    }, 400);
  }, []);

  // ─── Add node ─────────────────────────────────────────────────────────────
  // Seeding API: supports custom ID and initial data
  const handlePlusClick = useCallback((customId = null, initialData = {}) => {
    const id = customId || uuidv4();
    updateNode(id, {
      id,
      intent: initialData.intent || 'logic-unit',
      type: initialData.type || '',
      inputs: initialData.inputs || {},
      outputs: initialData.outputs || {},
      status: 'idle',
      x: initialData.x || Math.floor(Math.random() * 300) + 80,
      y: initialData.y || Math.floor(Math.random() * 200) + 80,
      ...initialData
    });
  }, [updateNode]);

  // ─── Socket drag: start wiring ────────────────────────────────────────────
  const handleOutputSocketMouseDown = useCallback((e, nodeId) => {
    e.stopPropagation();
    e.preventDefault();
    const start = getOutputPos(nodeId);
    setWiring({
      sourceNodeId: nodeId,
      startX: start.x,
      startY: start.y,
      mouseX: start.x,
      mouseY: start.y,
    });
  }, [getOutputPos]);

  // ─── Track mouse during wiring ────────────────────────────────────────────
  useEffect(() => {
    if (!wiring) return;

    const onMove = (e) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setWiring(prev => prev && ({
        ...prev,
        mouseX: (e.clientX - rect.left - offset.x) / zoom,
        mouseY: (e.clientY - rect.top - offset.y) / zoom,
      }));
    };

    const onUp = (e) => {
      if (!wiring) return;
      // Hit-test: did we release near an input socket?
      const rect = canvasRef.current?.getBoundingClientRect();
      const mx = (e.clientX - (rect?.left || 0) - offset.x) / zoom;
      const my = (e.clientY - (rect?.top  || 0) - offset.y) / zoom;
      const HIT_RADIUS = 20;

      let targetNodeId = null;
      for (const [id] of Object.entries(nodes)) {
        if (id === wiring.sourceNodeId) continue;
        const inp = getInputPos(id);
        const dx = mx - inp.x;
        const dy = my - inp.y;
        if (Math.sqrt(dx * dx + dy * dy) < HIT_RADIUS) {
          targetNodeId = id;
          break;
        }
      }

      if (targetNodeId) {
        // Avoid duplicate connections
        const alreadyExists = Object.values(connections || {}).some(
          c => c.sourceNodeId === wiring.sourceNodeId && c.targetNodeId === targetNodeId
        );
        if (!alreadyExists) {
          const connId = uuidv4();
          updateConnection(connId, {
            sourceNodeId: wiring.sourceNodeId,
            targetNodeId,
          });
        }
      }
      setWiring(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [wiring, nodes, connections, getInputPos, updateConnection]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div 
      className={`blueprint-canvas ${isPanning ? 'panning' : ''}`}
      ref={canvasRef}
      onMouseDown={startPan}
      onClick={(e) => {
        // Only deselect if clicking the background grid, not a node or button
        if (e.target === e.currentTarget) setActiveNode(null);
      }}
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
    >
      <div 
        className="canvas-content" 
        style={{ 
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, 
          transformOrigin: '0 0' 
        }}
      >
        {/* SVG wiring layer — sits above canvas, pointer-events passthrough */}
        <svg className="wiring-svg" xmlns="http://www.w3.org/2000/svg">
          <defs>
            {/* Cyan -> Purple Gradient */}
            <linearGradient id="wireGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00F2FF" />
              <stop offset="100%" stopColor="#A855F7" />
            </linearGradient>

            {/* Glowing cyan filter */}
            <filter id="wire-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Saved connections */}
          {Object.entries(connections || {}).map(([connId, conn]) => {
            const src = getOutputPos(conn.sourceNodeId);
            const tgt = getInputPos(conn.targetNodeId);
            if (!nodes[conn.sourceNodeId] || !nodes[conn.targetNodeId]) return null;
            return (
              <g key={connId} className="wire-group">
                {/* Fat invisible hit target for click-to-delete */}
                <path
                  d={makePath(src.x, src.y, tgt.x, tgt.y)}
                  stroke="transparent"
                  strokeWidth="14"
                  fill="none"
                  style={{ cursor: 'pointer' }}
                  onClick={() => deleteConnection(connId)}
                />
                {/* Visible glowing wire */}
                <path
                  d={makePath(src.x, src.y, tgt.x, tgt.y)}
                  stroke="url(#wireGrad)"
                  strokeWidth="2"
                  fill="none"
                  opacity="0.95"
                  filter="url(#wire-glow)"
                  className="wire-path"
                />
                {/* Animated flow dot */}
                <circle r="4" fill="#A855F7" filter="url(#wire-glow)">
                  <animateMotion
                    dur="1.8s"
                    repeatCount="indefinite"
                    path={makePath(src.x, src.y, tgt.x, tgt.y)}
                  />
                </circle>
              </g>
            );
          })}

          {/* Live drag wire */}
          {wiring && (
            <path
              d={makePath(wiring.startX, wiring.startY, wiring.mouseX, wiring.mouseY)}
              stroke="url(#wireGrad)"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              fill="none"
              opacity="0.9"
              filter="url(#wire-glow)"
            />
          )}

          {/* Input sockets — render hit targets for wiring drop */}
          {Object.entries(nodes || {}).map(([id, data]) => {
            const inp = getInputPos(id);
            return (
              <circle
                key={`in-${id}`}
                cx={inp.x}
                cy={inp.y}
                r="7"
                className={`socket socket-in ${wiring && wiring.sourceNodeId !== id ? 'socket-active' : ''}`}
                style={{ pointerEvents: wiring ? 'auto' : 'none' }}
              />
            );
          })}

          {/* Output sockets — rendered via NodeElement but we also draw them here for SVG precision */}
          {Object.entries(nodes || {}).map(([id, data]) => {
            const out = getOutputPos(id);
            return (
              <circle
                key={`out-${id}`}
                cx={out.x}
                cy={out.y}
                r="7"
                className="socket socket-out"
                onMouseDown={e => handleOutputSocketMouseDown(e, id)}
                style={{ cursor: 'crosshair' }}
              />
            );
          })}
        </svg>

        {/* Node cards */}
        {Object.entries(nodes || {}).map(([id, data]) => (
          <NodeElement
            key={id}
            nodeId={id}
            data={{ ...data, id }}
            updateNode={updateNode}
            deleteNode={deleteNode}
            userId={userId}
            selected={activeNode === id}
            setActiveNode={setActiveNode}
            zoom={zoom}
            offset={offset}
            onPositionChange={handleNodePositionChange}
            onDragEnd={handleNodeDragEnd}
          />
        ))}
      </div>

      {/* Floating Action Buttons */}
      <div className="fab-actions">
        {activeNode && (
          <button
            className="fab-btn delete-fab"
            onClick={() => {
              deleteNode(activeNode);
              setActiveNode(null);
            }}
            onMouseDown={e => e.stopPropagation()}
            title="Delete Selected Node"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
        <button
          className="fab-btn plus-btn"
          onClick={() => handlePlusClick()}
          onMouseDown={e => e.stopPropagation()}
          title="Add Logic Node"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Overlay watermark / Tab Switcher */}
      <div className="workspace-overlay">
        <div className="workspace-tabs">
          <button 
            className={`workspace-tab ${canvasMode === 'blueprint' ? 'active' : ''}`}
            onClick={() => setCanvasMode('blueprint')}
          >
            Intelligence Blueprint
          </button>
          <button 
            className={`workspace-tab ${canvasMode === 'workflow' ? 'active' : ''}`}
            onClick={() => setCanvasMode('workflow')}
          >
            Workflow
          </button>
        </div>

        <div className="zoom-controls" onMouseDown={e => e.stopPropagation()}>
          <button onClick={() => handleZoom(0.1)} title="Zoom In">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button className="zoom-reset" onClick={resetZoom} title="Reset Zoom">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => handleZoom(-0.1)} title="Zoom Out">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
