// WorkflowNode.js — Obsidian Forge Edition
import { useState, useEffect, useRef } from 'react';

const NODE_CONFIG = {
  start: { icon: '◎', badge: 'START', color: '#22d3ee' },
  process: { icon: '⬡', badge: 'PROCESS', color: '#818cf8' },
  decision: { icon: '◇', badge: 'DECISION', color: '#fbbf24' },
  io: { icon: '⇌', badge: 'I/O', color: '#34d399' },
  end: { icon: '●', badge: 'END', color: '#f87171' },
};

export default function WorkflowNode({
  data, selected, onSelect, onUpdate, onDelete, onStartWiring, onPositionChange, onDragEnd, zoom, isNew
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [portHover, setPortHover] = useState(null); // 'in' | 'out' | null
  const [localPos, setLocalPos] = useState({ x: data.x, y: data.y });
  const nodeRef = useRef(null);
  const inputRef = useRef(null);
  const dragOrigin = useRef({ x: data.x, y: data.y });
  const localPosRef = useRef({ x: data.x, y: data.y });
  const syncTimeout = useRef(null);

  const config = NODE_CONFIG[data.type] || NODE_CONFIG.process;

  useEffect(() => {
    if (!isDragging) {
      const nextPos = { x: data.x, y: data.y };
      localPosRef.current = nextPos;
      setLocalPos(nextPos);
    }
  }, [data.x, data.y, isDragging]);

  // ── Dragging ──
  const handleMouseDown = (e) => {
    if (e.button !== 0 || isEditing) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    dragOrigin.current = { x: data.x, y: data.y };
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;
      const nextPos = { x: dragOrigin.current.x + dx, y: dragOrigin.current.y + dy };
      localPosRef.current = nextPos;
      setLocalPos(nextPos);
      onPositionChange?.(nextPos);

      if (syncTimeout.current) clearTimeout(syncTimeout.current);
      syncTimeout.current = setTimeout(() => {
        onUpdate(nextPos);
      }, 120);
    };
    const onUp = () => {
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
      const finalPos = localPosRef.current;
      onUpdate(finalPos);
      onDragEnd?.(finalPos);
      setIsDragging(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, dragStart, zoom, onUpdate, onPositionChange, onDragEnd]);

  // ── Edit on double-click ──
  const handleDoubleClick = (e) => {
    e.stopPropagation();
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 10);
  };

  const handleLabelChange = (e) => onUpdate({ label: e.target.value });
  const handleBlur = () => setIsEditing(false);
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') handleBlur();
  };

  // ── Keyboard delete when selected ──
  useEffect(() => {
    if (!selected) return;
    const onKey = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing) {
        e.preventDefault();
        onDelete();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, isEditing, onDelete]);

  const nodeClass = [
    'workflow-node',
    data.type,
    selected ? 'selected' : '',
    isDragging ? 'dragging' : '',
    isNew ? 'just-added' : '',
  ].filter(Boolean).join(' ');

  const isDecision = data.type === 'decision';
  const isTerminal = data.type === 'start' || data.type === 'end';

  return (
    <div
      ref={nodeRef}
      className={nodeClass}
      style={{
        left: localPos.x,
        top: localPos.y,
        width: data.width,
        height: data.height,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {/* Accent bar (not for decision) */}
      {!isDecision && <div className="node-accent-bar" />}

      {/* Input port */}
      {data.type !== 'start' && (
        <div
          className="workflow-port port-in"
          title="Input"
          onMouseEnter={() => setPortHover('in')}
          onMouseLeave={() => setPortHover(null)}
        />
      )}

      {/* Output port */}
      {data.type !== 'end' && (
        <div
          className="workflow-port port-out"
          title="Drag to connect"
          onMouseDown={(e) => { e.stopPropagation(); onStartWiring(e); }}
          onMouseEnter={() => setPortHover('out')}
          onMouseLeave={() => setPortHover(null)}
        />
      )}

      {/* Inner content (rotated back for decision nodes) */}
      <div className="node-inner">
        <div className="node-icon" style={{ color: config.color }}>
          {config.icon}
        </div>
        <div className="node-label">
          {isEditing ? (
            <input
              ref={inputRef}
              autoFocus
              className="node-input"
              value={data.label}
              onChange={handleLabelChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span title="Double-click to rename">{data.label}</span>
          )}
        </div>
        {!isTerminal && !isDecision && (
          <div className="node-type-badge" style={{ color: config.color }}>
            {config.badge}
          </div>
        )}
      </div>

      {/* Delete button */}
      <button
        className="node-delete-btn"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        onMouseDown={(e) => e.stopPropagation()}
        title="Delete node (Del)"
        tabIndex={-1}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
