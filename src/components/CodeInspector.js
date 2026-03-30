// src/components/CodeInspector.js
import { useState, useEffect } from 'react';
import { generateBoilerplate, copyToClipboard } from '../engine/codeGenerator';
import './CodeInspector.css';

export default function CodeInspector({ activeNode, nodes, connections, onClose }) {
  const [lang, setLang] = useState('python');
  const [boilerplate, setBoilerplate] = useState({ python: '', typescript: '', schema: null });
  const [copied, setCopied] = useState(false);

  // Re-generate boilerplate whenever node attributes or connections change
  useEffect(() => {
    if (activeNode && nodes[activeNode]) {
      const generated = generateBoilerplate(nodes[activeNode], { nodes, connections });
      setBoilerplate(generated);
    }
  }, [activeNode, nodes, connections]);

  const currentCodeDisplay = boilerplate[lang] || '';
  const schema = boilerplate.schema;

  const handleCopy = async () => {
    const ok = await copyToClipboard(currentCodeDisplay);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="code-inspector">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="inspector-header">
        <div className="inspector-title-row">
          <span className="inspector-label">Code Inspector</span>
          <button className="close-btn" onClick={onClose} title="Close Inspector">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Language toggle: Switching always shows live-generated code */}
        <div className="segmented-control">
          <button
            className={`segment-btn ${lang === 'python' ? 'active' : ''}`}
            onClick={() => setLang('python')}
          >
            Python · FastAPI
          </button>
          <button
            className={`segment-btn ${lang === 'typescript' ? 'active' : ''}`}
            onClick={() => setLang('typescript')}
          >
            TypeScript · Node.js
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="inspector-content">
        
        {/* Logic Schema Pill Row */}
        {schema && (
          <div className="schema-pill-row">
            <span className="schema-intent-pill">{schema.intent}</span>
            <span className="schema-meta">
              {Object.keys(schema.inputs).filter(k => k !== 'name').length} in
              &nbsp;·&nbsp;
              {Object.keys(schema.outputs).filter(k => k !== 'name').length} out
            </span>
            <span className="schema-node-id">{activeNode?.slice(0, 8)}</span>
          </div>
        )}

        {/* Code Display Area */}
        <div className="code-block-wrapper">
          <div className="code-header">
            <div className="code-header-left">
              <span className="code-lang-label">
                {lang === 'python' ? 'fastapi · pydantic v2' : 'nodejs · typescript'}
              </span>
            </div>

            <div className="code-header-actions">
              <button
                className={`copy-btn ${copied ? 'copy-btn-ok' : ''}`}
                onClick={handleCopy}
                title="Copy to clipboard"
              >
                {copied ? (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
          
          <div className="code-editor-container readonly">
            <pre className="code-display">
              <code>{currentCodeDisplay}</code>
            </pre>
          </div>
        </div>

        <div className="inspector-footer">
          Intelligence Suite · Logic Schema Viewer
        </div>
      </div>
    </div>
  );
}
