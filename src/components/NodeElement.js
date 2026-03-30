import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { dataTypes, getDefaultDataType } from '../lib/dataTypes';
import { getSemanticSuggestions } from '../lib/semanticRenaming';
import './NodeElement.css';

// Throttling helper to prevent Firebase spam
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}

export default function NodeElement({ nodeId, data, updateNode, deleteNode, userId, selected, setActiveNode, zoom = 1, offset = { x: 0, y: 0 }, onPositionChange, onDragEnd }) {
  const [isLocalDragging, setIsLocalDragging] = useState(false);
  const [pos, setPos] = useState({ x: data.x || 100, y: data.y || 100 });
  const [suggestions, setSuggestions] = useState([]);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef({ x: data.x || 100, y: data.y || 100 });
  const posRef = useRef({ x: data.x || 100, y: data.y || 100 });
  const nodeRef = useRef(null);

  const isRemoteDragging = data.draggingBy && data.draggingBy !== userId;

  useEffect(() => {
    // Only update position from data if NOT dragging locally
    if (!isLocalDragging && data.x !== undefined && data.y !== undefined) {
      const nextPos = { x: data.x, y: data.y };
      posRef.current = nextPos;
      setPos(nextPos);
    }
  }, [data.x, data.y, isLocalDragging]);

  const throttledSync = useCallback(
    throttle((id, updates) => {
      updateNode(id, updates);
    }, 180),
    [updateNode]
  );

  const handleMouseDown = (e) => {
    if (e.target.closest('.node-controls') || e.target.closest('.node-delete-btn') || e.target.closest('.io-field-input') || e.target.closest('.node-description-input')) return;
    e.stopPropagation();
    e.preventDefault();
    setActiveNode(nodeId); 
    setIsLocalDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragOrigin.current = { x: pos.x, y: pos.y };
    
    // Sync start of drag
    updateNode(nodeId, { ...data, draggingBy: userId || null });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isLocalDragging) return;

      const dx = (e.clientX - dragStart.current.x) / zoom;
      const dy = (e.clientY - dragStart.current.y) / zoom;
      
      const newX = dragOrigin.current.x + dx;
      const newY = dragOrigin.current.y + dy;
      
      const nextPos = { x: newX, y: newY };
      posRef.current = nextPos;
      setPos(nextPos);
      onPositionChange?.(nodeId, nextPos);
      
      // Real-time broadcast
      throttledSync(nodeId, { 
        x: newX, 
        y: newY, 
        draggingBy: userId || null 
      });
    };

    const handleMouseUp = () => {
      if (isLocalDragging) {
        setIsLocalDragging(false);
        const finalPos = posRef.current;
        updateNode(nodeId, { 
          x: finalPos.x, 
          y: finalPos.y, 
          draggingBy: null 
        });
        onDragEnd?.(nodeId, finalPos);
      }
    };

    if (isLocalDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isLocalDragging, nodeId, data, updateNode, userId, throttledSync, zoom, onPositionChange, onDragEnd]);

  // --- Field editor helpers ---
  const inputKeys  = Object.keys(data.inputs  || {});
  const outputKeys = Object.keys(data.outputs || {});

  /** Debouncer for field edits — pushes to Firebase after 400 ms of idle typing */
  const fieldDebounceRef = useRef({});

  const handleFieldChange = useCallback((section, key, value) => {
    const newData = {
      ...data,
      [section]: { ...(data[section] || {}), [key]: value },
    };
    // Optimistic local state (position doesn't change, so reuse pos)
    if (fieldDebounceRef.current[section + key]) {
      clearTimeout(fieldDebounceRef.current[section + key]);
    }
    fieldDebounceRef.current[section + key] = setTimeout(() => {
      updateNode(nodeId, newData);
    }, 400);
  }, [data, nodeId, updateNode]);

  const handleDescriptionChange = useCallback((value) => {
    if (fieldDebounceRef.current['__description__']) {
      clearTimeout(fieldDebounceRef.current['__description__']);
    }
    fieldDebounceRef.current['__description__'] = setTimeout(() => {
      updateNode(nodeId, { ...data, description: value });
    }, 400);
  }, [data, nodeId, updateNode]);

  const handleAddField = useCallback((section) => {
    const key = `field_${Date.now()}`;
    const newData = {
      ...data,
      [section]: { ...(data[section] || {}), [key]: '' },
    };
    updateNode(nodeId, newData);
  }, [data, nodeId, updateNode]);

  const handleRemoveField = useCallback((section, key) => {
    const updated = { ...(data[section] || {}) };
    delete updated[key];
    updateNode(nodeId, { ...data, [section]: updated });
  }, [data, nodeId, updateNode]);

  const handleIntentChange = useCallback((e) => {
    updateNode(nodeId, { ...data, intent: e.target.value });
    const fetchSuggestions = async () => {
      const newSuggestions = await getSemanticSuggestions(e.target.value);
      setSuggestions(newSuggestions);
    };
    fetchSuggestions();
  }, [data, nodeId, updateNode]);

  // Load suggestions on first mount
  useEffect(() => {
    getSemanticSuggestions(data.intent || 'logic-unit').then(setSuggestions);
  }, []);

  const handleAddSuggestedField = useCallback((name) => {
    const alreadyIn = Object.keys(data.inputs || {}).some(k => data.inputs[k] === name);
    if (!alreadyIn) {
      const key = `field_${Date.now()}`;
      updateNode(nodeId, { ...data, inputs: { ...(data.inputs || {}), [key]: name } });
    }
  }, [data, nodeId, updateNode]);

  // Keyboard delete when selected
  useEffect(() => {
    if (!selected) return;
    const onKey = (e) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteNode(nodeId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, nodeId, deleteNode]);

  return (
    <div
      ref={nodeRef}
      className={`node-element glass-panel ${isLocalDragging ? 'dragging' : ''} ${isRemoteDragging ? 'ghost-mode' : ''} ${selected ? 'selected' : ''}`}
      style={{
        left: `${pos.x}px`,
        top:  `${pos.y}px`,
        zIndex: isLocalDragging || isRemoteDragging || selected ? 1000 : 100,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div className="node-header">
        <div className="node-header-left">
          <select
            className="node-intent-select"
            value={data.intent || 'logic-unit'}
            onChange={handleIntentChange}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
          >
            <option value="logic-unit">logic-unit</option>
            <option value="database">database</option>
            <option value="api">api</option>
            <option value="transform">transform</option>
          </select>
          <div className="node-status-dot" data-status={data.status || 'idle'} />
        </div>
        <button
          className="node-delete-btn"
          onClick={e => { e.stopPropagation(); deleteNode(nodeId); }}
          title="Delete Node"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Description */}
      <div className="node-description-wrap">
        <textarea
          className="node-description-input"
          defaultValue={data.description || ''}
          placeholder="Describe what this node does… (becomes a docstring)"
          rows={2}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onChange={e => handleDescriptionChange(e.target.value)}
        />
      </div>

      {/* Body */}
      <div className="node-content">

        {/* IN section */}
        <div className="node-io-section">
          <div className="node-io-header">
            <span className="io-label">IN</span>
            <button
              className="io-add-btn"
              onClick={e => { e.stopPropagation(); handleAddField('inputs'); }}
              onMouseDown={e => e.stopPropagation()}
              title="Add input field"
            >+</button>
          </div>
          {suggestions.length > 0 && (
            <div className="semantic-suggestions">
              <span className="suggestions-label">Suggested:</span>
              <div className="suggestion-chips">
                {suggestions.map(s => (
                  <button
                    key={s}
                    className="suggestion-chip"
                    onClick={e => { e.stopPropagation(); handleAddSuggestedField(s); }}
                    onMouseDown={e => e.stopPropagation()}
                    title={`Add "${s}" as an input field`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {inputKeys.length === 0 && (
            <span className="io-empty">no inputs</span>
          )}
          {inputKeys.map(key => (
            <div key={key} className="io-field-row">
              <span className="io-field-key">
                <span className="io-type-icon">{dataTypes[getDefaultDataType(data.inputs[key])].icon}</span>
                {key}
              </span>
              <input
                className="io-field-input"
                defaultValue={data.inputs[key] || ''}
                placeholder="value…"
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => handleFieldChange('inputs', key, e.target.value)}
              />
              <button
                className="io-remove-btn"
                onClick={e => { e.stopPropagation(); handleRemoveField('inputs', key); }}
                onMouseDown={e => e.stopPropagation()}
                title="Remove"
              >×</button>
            </div>
          ))}
        </div>

        {/* OUT section */}
        <div className="node-io-section">
          <div className="node-io-header">
            <span className="io-label">OUT</span>
            <button
              className="io-add-btn"
              onClick={e => { e.stopPropagation(); handleAddField('outputs'); }}
              onMouseDown={e => e.stopPropagation()}
              title="Add output field"
            >+</button>
          </div>
          {outputKeys.length === 0 && (
            <span className="io-empty">no outputs</span>
          )}
          {outputKeys.map(key => (
            <div key={key} className="io-field-row">
              <span className="io-field-key">
                <span className="io-type-icon">{dataTypes[getDefaultDataType(data.outputs[key])].icon}</span>
                {key}
              </span>
              <input
                className="io-field-input"
                defaultValue={data.outputs[key] || ''}
                placeholder="value…"
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => handleFieldChange('outputs', key, e.target.value)}
              />
              <button
                className="io-remove-btn"
                onClick={e => { e.stopPropagation(); handleRemoveField('outputs', key); }}
                onMouseDown={e => e.stopPropagation()}
                title="Remove"
              >×</button>
            </div>
          ))}
        </div>
      </div>

      <div className="node-footer">
        ID: {nodeId.slice(0, 8)}
      </div>
    </div>
  );
}
