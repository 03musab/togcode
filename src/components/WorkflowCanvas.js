// WorkflowCanvas.js — Obsidian Forge Edition
import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import WorkflowNode from './WorkflowNode';
import './WorkflowCanvas.css';

// ─── Constants ───────────────────────────────────────────────────────────────
const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 72;
const DECISION_SIZE = 120;
const TERMINAL_W = 140;
const TERMINAL_H = 60;
const MINIMAP_W = 160;
const MINIMAP_H = 100;
const MINIMAP_SCALE = 0.08;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const FIT_PADDING = 96;
const DECISION_ROTATION_RADIANS = Math.PI / 4;
const IO_SKEW_RADIANS = -15 * (Math.PI / 180);

const NODE_DEFAULTS = {
  start: { width: TERMINAL_W, height: TERMINAL_H, label: 'Start' },
  end: { width: TERMINAL_W, height: TERMINAL_H, label: 'End' },
  decision: { width: DECISION_SIZE, height: DECISION_SIZE, label: 'Decision' },
  process: { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT, label: 'Process' },
  io: { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT, label: 'I/O' },
};

const NODE_COLORS = {
  start: '#22d3ee', process: '#818cf8', decision: '#fbbf24', io: '#34d399', end: '#f87171',
};

function clampZoom(value) {
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
}

function getNodeSize(node) {
  const defaults = NODE_DEFAULTS[node?.type] || NODE_DEFAULTS.process;
  return {
    width: node?.width || defaults.width || DEFAULT_NODE_WIDTH,
    height: node?.height || defaults.height || DEFAULT_NODE_HEIGHT,
  };
}

function rotatePoint(point, center, radians) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function skewXPoint(point, center, radians) {
  return {
    x: point.x + Math.tan(radians) * (point.y - center.y),
    y: point.y,
  };
}

function getNodeVisualBounds(node) {
  const { width, height } = getNodeSize(node);
  const center = { x: node.x + width / 2, y: node.y + height / 2 };

  if (node.type === 'decision' || node.type === 'io') {
    const corners = [
      { x: node.x, y: node.y },
      { x: node.x + width, y: node.y },
      { x: node.x + width, y: node.y + height },
      { x: node.x, y: node.y + height },
    ].map((corner) => (
      node.type === 'decision'
        ? rotatePoint(corner, center, DECISION_ROTATION_RADIANS)
        : skewXPoint(corner, center, IO_SKEW_RADIANS)
    ));

    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }

  return {
    minX: node.x,
    maxX: node.x + width,
    minY: node.y,
    maxY: node.y + height,
  };
}

// ─── Path builder (cubic bezier) ─────────────────────────────────────────────
function makePath(x1, y1, x2, y2) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.55, 60);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

// ─── Midpoint of a cubic bezier (approx) ─────────────────────────────────────
function bezierMid(x1, y1, x2, y2) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.55, 60);
  const t = 0.5;
  const cx1 = x1 + dx, cy1 = y1, cx2 = x2 - dx, cy2 = y2;
  const x = (1 - t) ** 3 * x1 + 3 * (1 - t) ** 2 * t * cx1 + 3 * (1 - t) * t ** 2 * cx2 + t ** 3 * x2;
  const y = (1 - t) ** 3 * y1 + 3 * (1 - t) ** 2 * t * cy1 + 3 * (1 - t) * t ** 2 * cy2 + t ** 3 * y2;
  return { x, y };
}

// ─── Animated dot offset along path ──────────────────────────────────────────
function useTick(fps = 30) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % 10000), 1000 / fps);
    return () => clearInterval(id);
  }, [fps]);
  return tick;
}

export default function WorkflowCanvas({
  userId, canvasMode, setCanvasMode,
  nodes = {}, connections = {},
  updateNode, deleteNode, updateConnection, deleteConnection,
  clearWorkflow
}) {
  const canvasRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [activeNode, setActiveNode] = useState(null);
  const [wiring, setWiring] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [localNodePositions, setLocalNodePositions] = useState({});
  const [newNodeId, setNewNodeId] = useState(null);   // for entry animation
  const [hoveredLink, setHoveredLink] = useState(null);
  const [showHints, setShowHints] = useState(true);
  const panStart = useRef({ x: 0, y: 0 });
  useTick(20);

  // ─── Zoom ──────────────────────────────────────────────────────────────────
  const handleZoom = (delta) => setZoom(prev => clampZoom(prev + delta));
  const fitToView = useCallback(() => {
    const canvas = canvasRef.current;
    const nodeEntries = Object.values(nodes);

    if (!canvas || nodeEntries.length === 0) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const bounds = nodeEntries.reduce((acc, node) => {
      const next = getNodeVisualBounds(node);
      return {
        minX: Math.min(acc.minX, next.minX),
        maxX: Math.max(acc.maxX, next.maxX),
        minY: Math.min(acc.minY, next.minY),
        maxY: Math.max(acc.maxY, next.maxY),
      };
    }, {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    });

    const paddedWidth = Math.max(bounds.maxX - bounds.minX + FIT_PADDING * 2, 1);
    const paddedHeight = Math.max(bounds.maxY - bounds.minY + FIT_PADDING * 2, 1);
    const nextZoom = clampZoom(Math.min(rect.width / paddedWidth, rect.height / paddedHeight));
    const centeredX = (rect.width - (bounds.maxX - bounds.minX) * nextZoom) / 2 - bounds.minX * nextZoom;
    const centeredY = (rect.height - (bounds.maxY - bounds.minY) * nextZoom) / 2 - bounds.minY * nextZoom;

    setZoom(nextZoom);
    setOffset({ x: centeredX, y: centeredY });
  }, [nodes]);
  const resetZoom = useCallback(() => {
    if (Object.keys(nodes).length === 0) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      return;
    }

    fitToView();
  }, [fitToView, nodes]);

  // Scroll to zoom
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      setZoom(prev => clampZoom(prev + delta));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ─── Panning ───────────────────────────────────────────────────────────────
  const startPan = (e) => {
    // Start panning if we didn't click on a node or interactive element 
    // (nodes and ports call stopPropagation automatically in their handlers)
    if (e.button === 1 || e.button === 0) {
      setIsPanning(true);
      panStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    }
  };

  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e) => setOffset({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    const onUp = () => setIsPanning(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isPanning]);

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      // Escape deselects
      if (e.key === 'Escape') { setActiveNode(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offset.x, offset.y, updateNode, zoom]);

  // ─── Node CRUD ─────────────────────────────────────────────────────────────
  const addNode = useCallback((type = 'process', x = 200, y = 200) => {
    const id = uuidv4();
    const defaults = NODE_DEFAULTS[type] || NODE_DEFAULTS.process;
    // Center the node on the drop point
    const cx = x - defaults.width / 2;
    const cy = y - defaults.height / 2;

    updateNode(id, { id, type, ...defaults, x: cx, y: cy });

    setNewNodeId(id);
    setActiveNode(id);
    setTimeout(() => setNewNodeId(null), 400);
    setShowHints(false);
  }, [updateNode]);

  const addNodeAtCenter = useCallback((type) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    addNode(type, (rect.width / 2 - offset.x) / zoom, (rect.height / 2 - offset.y) / zoom);
  }, [addNode, offset.x, offset.y, zoom]);

  // Handlers now use the prop methods directly
  const deleteNodeHandler = useCallback((id) => {
    // Delete connections first
    Object.keys(connections).forEach(cid => {
      if (connections[cid].sourceId === id || connections[cid].targetId === id) deleteConnection(cid);
    });
    deleteNode(id);
    setActiveNode(null);
  }, [connections, deleteConnection, deleteNode]);

  // ─── Port positions ────────────────────────────────────────────────────────
  const getPortPos = useCallback((nodeId, side) => {
    const n = nodes[nodeId];
    if (!n) return { x: 0, y: 0 };
    const localPos = localNodePositions[nodeId];
    const nodeX = localPos?.x ?? n.x;
    const nodeY = localPos?.y ?? n.y;
    const { width: w, height: h } = getNodeSize(n);
    const center = { x: nodeX + w / 2, y: nodeY + h / 2 };

    // Match the same transform rules as CSS so wires hit the visual edge.
    if (n.type === 'decision') {
      const corner = side === 'out'
        ? { x: nodeX + w, y: nodeY }
        : { x: nodeX, y: nodeY + h };
      return rotatePoint(corner, center, DECISION_ROTATION_RADIANS);
    }

    const midY = nodeY + h / 2;

    if (n.type === 'io') {
      const anchor = side === 'out'
        ? { x: nodeX + w, y: midY }
        : { x: nodeX, y: midY };
      return skewXPoint(anchor, center, IO_SKEW_RADIANS);
    }

    if (side === 'out') return { x: nodeX + w, y: midY };
    return { x: nodeX, y: midY };
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

  // ─── Wiring ────────────────────────────────────────────────────────────────
  const startWiring = useCallback((e, nodeId) => {
    e.stopPropagation();
    const pos = getPortPos(nodeId, 'out');
    setWiring({ sourceId: nodeId, x: pos.x, y: pos.y, mouseX: pos.x, mouseY: pos.y });
  }, [getPortPos]);

  useEffect(() => {
    if (!wiring) return;
    const onMove = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      setWiring(prev => ({
        ...prev,
        mouseX: (e.clientX - rect.left - offset.x) / zoom,
        mouseY: (e.clientY - rect.top - offset.y) / zoom,
      }));
    };
    const onUp = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = (e.clientX - rect.left - offset.x) / zoom;
      const my = (e.clientY - rect.top - offset.y) / zoom;
      let targetId = null;
      let minDist = 30;
      Object.entries(nodes).forEach(([id, n]) => {
        if (id === wiring.sourceId) return;
        const port = getPortPos(id, 'in');
        const dist = Math.hypot(mx - port.x, my - port.y);
        if (dist < minDist) { minDist = dist; targetId = id; }
      });
      if (targetId) {
        const alreadyConnected = Object.values(connections).some(
          c => c.sourceId === wiring.sourceId && c.targetId === targetId
        );
        if (!alreadyConnected) {
          updateConnection(uuidv4(), { sourceId: wiring.sourceId, targetId });
        }
      }
      setWiring(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [wiring, nodes, zoom, offset, connections, getPortPos, updateConnection]);

  // ─── Minimap node list ─────────────────────────────────────────────────────
  const minimapNodes = Object.entries(nodes).map(([id, n]) => {
    const bounds = getNodeVisualBounds(n);
    return {
      ...n,
      id,
      mmX: MINIMAP_W / 2 + bounds.minX * MINIMAP_SCALE,
      mmY: MINIMAP_H / 2 + bounds.minY * MINIMAP_SCALE,
      mmW: (bounds.maxX - bounds.minX) * MINIMAP_SCALE,
      mmH: (bounds.maxY - bounds.minY) * MINIMAP_SCALE,
    };
  });

  const nodeCount = Object.keys(nodes).length;
  const isEmpty = nodeCount === 0;

  return (
    <div
      className={`workflow-canvas${isPanning ? ' panning' : ''}`}
      ref={canvasRef}
      onMouseDown={startPan}
      onClick={(e) => { if (e.target === e.currentTarget) setActiveNode(null); }}
    >
      {/* ── Canvas content ── */}
      <div
        className="canvas-content"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <svg className="workflow-svg">
          <defs>
            {/* Arrowhead markers per color */}
            {Object.entries(NODE_COLORS).map(([type, color]) => (
              <marker key={type} id={`arrow-${type}`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill={color} opacity="0.7" />
              </marker>
            ))}
            <marker id="arrow-default" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
            </marker>
            {/* Glow filter */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Connections */}
          {Object.entries(connections).map(([id, conn]) => {
            const src = getPortPos(conn.sourceId, 'out');
            const tgt = getPortPos(conn.targetId, 'in');
            const srcNode = nodes[conn.sourceId];
            const tgtNode = nodes[conn.targetId];
            if (!srcNode || !tgtNode) return null;
            const srcColor = NODE_COLORS[srcNode.type] || '#64748b';
            const d = makePath(src.x, src.y, tgt.x, tgt.y);
            const mid = bezierMid(src.x, src.y, tgt.x, tgt.y);
            const isHovered = hoveredLink === id;

            return (
              <g
                key={id}
                className="link-group"
                onMouseEnter={() => setHoveredLink(id)}
                onMouseLeave={() => setHoveredLink(null)}
                onClick={(e) => { e.stopPropagation(); deleteConnection(id); }}
              >
                {/* Fat invisible hit area */}
                <path d={d} className="link-hit-area" />

                {/* Glow layer */}
                <path
                  d={d}
                  fill="none"
                  stroke={srcColor}
                  strokeWidth={isHovered ? 8 : 0}
                  strokeLinecap="round"
                  opacity={0.25}
                  style={{ filter: 'blur(4px)', transition: 'stroke-width 0.2s' }}
                />

                {/* Main track */}
                <path
                  d={d}
                  className="link-track"
                  stroke={isHovered ? srcColor : '#2d3748'}
                  markerEnd={`url(#arrow-${srcNode.type})`}
                  style={{ transition: 'stroke 0.2s, stroke-width 0.2s', strokeWidth: isHovered ? 2.5 : 1.5 }}
                />

                {/* Delete badge at midpoint */}
                {isHovered && (
                  <g transform={`translate(${mid.x}, ${mid.y})`} style={{ pointerEvents: 'auto', cursor: 'pointer' }}>
                    <circle r="9" fill="#0f1117" stroke="rgba(248,113,113,0.5)" strokeWidth="1" />
                    <text textAnchor="middle" dominantBaseline="central" fill="#f87171" fontSize="11" fontWeight="bold">×</text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Preview wire while dragging */}
          {wiring && (
            <path
              d={makePath(wiring.x, wiring.y, wiring.mouseX, wiring.mouseY)}
              className="workflow-link-preview"
            />
          )}
        </svg>

        {/* Nodes */}
        {Object.entries(nodes).map(([id, data]) => (
          <WorkflowNode
            key={id}
            data={data}
            selected={activeNode === id}
            isNew={newNodeId === id}
            onSelect={() => setActiveNode(id)}
            onUpdate={(val) => updateNode(id, val)}
            onDelete={() => deleteNodeHandler(id)}
            onStartWiring={(e) => startWiring(e, id)}
            onPositionChange={(nextPos) => handleNodePositionChange(id, nextPos)}
            onDragEnd={(finalPos) => handleNodeDragEnd(id, finalPos)}
            zoom={zoom}
          />
        ))}
      </div>

      {/* ── Empty state ── */}
      {isEmpty && (
        <div className="canvas-empty-hint">
          <div className="big-icon">⬡</div>
          <div>Use the toolbar below for states</div>
        </div>
      )}

      {/* ── Overlay (tabs + zoom) ── */}
      <div className="workspace-overlay">
        <div className="workspace-tabs" onMouseDown={e => e.stopPropagation()}>
          <button
            className={`workspace-tab${canvasMode === 'blueprint' ? ' active' : ''}`}
            onClick={() => setCanvasMode('blueprint')}
          >
            Blueprint
          </button>
          <button
            className={`workspace-tab${canvasMode === 'workflow' ? ' active' : ''}`}
            onClick={() => setCanvasMode('workflow')}
          >
            Workflow
          </button>
        </div>

        <div className="zoom-controls" onMouseDown={e => e.stopPropagation()}>
          <button onClick={() => handleZoom(0.1)} title="Zoom in">+</button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button onClick={() => handleZoom(-0.1)} title="Zoom out">−</button>
          <button onClick={resetZoom} title="Fit to view" style={{ fontSize: '9px', letterSpacing: '0.05em', width: 'auto', padding: '0 8px' }}>FIT</button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="workflow-toolbar" onMouseDown={e => e.stopPropagation()}>
        {[
          { type: 'start', label: 'Start' },
          { type: 'process', label: 'Process' },
          { type: 'decision', label: 'Decision' },
          { type: 'io', label: 'I/O' },
          { type: 'end', label: 'End' },
        ].map(({ type, label }, i) => (
          <button key={type} onClick={() => addNodeAtCenter(type)} title={`Add ${label} node`}>
            <span className={`node-pip ${type}`} />
            {label}
          </button>
        ))}

        <div className="toolbar-divider" />

        <button
          onClick={() => { if (window.confirm('Clear all workflow nodes?')) clearWorkflow(); setActiveNode(null); setShowHints(true); }}
          title="Clear canvas"
          style={{ color: 'rgba(248,113,113,0.6)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
          </svg>
          Clear
        </button>
      </div>

      {/* ── Mini-map ── */}
      {nodeCount > 0 && (
        <div className="minimap" title="Canvas overview">
          {minimapNodes.map(n => (
            <div
              key={n.id}
              className="minimap-node"
              style={{
                left: n.mmX,
                top: n.mmY,
                width: Math.max(n.mmW, 4),
                height: Math.max(n.mmH, 3),
                background: NODE_COLORS[n.type] || '#818cf8',
                borderRadius: n.type === 'start' || n.type === 'end' ? '999px' : '1px',
                opacity: activeNode === n.id ? 1 : 0.5,
              }}
            />
          ))}
          {/* Viewport indicator */}
          <div
            className="minimap-viewport"
            style={{
              left: MINIMAP_W / 2 - (offset.x * MINIMAP_SCALE) / zoom,
              top: MINIMAP_H / 2 - (offset.y * MINIMAP_SCALE) / zoom,
              width: (canvasRef.current?.offsetWidth || 800) * MINIMAP_SCALE / zoom,
              height: (canvasRef.current?.offsetHeight || 600) * MINIMAP_SCALE / zoom,
            }}
          />
        </div>
      )}

      {/* ── Keyboard hints ── */}
      {showHints && isEmpty && (
        <div className="shortcuts-hint">
          <div><span className="shortcut-key">Scroll</span> zoom</div>
          <div><span className="shortcut-key">Del</span> delete selected</div>
        </div>
      )}

      {/* ── Node count badge ── */}
      {nodeCount > 0 && (
        <div style={{
          position: 'absolute', bottom: 90, left: 16,
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-dim)', letterSpacing: '0.08em',
          pointerEvents: 'none', zIndex: 100,
        }}>
          {nodeCount} node{nodeCount !== 1 ? 's' : ''} · {Object.keys(connections).length} edge{Object.keys(connections).length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
