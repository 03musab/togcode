import React, { useState, useEffect, useRef } from 'react';
import './Console.css';

export default function Console({ isOpen, onClose, code, language }) {
  const [output, setOutput] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const consoleBottomRef = useRef(null);

  useEffect(() => {
    consoleBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  const runCode = () => {
    setIsRunning(true);
    const logs = [];
    const originalLog = console.log;
    const originalError = console.error;

    // Intercept console.log
    console.log = (...args) => {
      logs.push({ type: 'log', content: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
    };

    console.error = (...args) => {
      logs.push({ type: 'error', content: args.join(' ') });
    };

    try {
      if (language === 'javascript' || language === 'js') {
        // eslint-disable-next-line no-eval
        const result = eval(code);
        if (result !== undefined) {
          logs.push({ type: 'log', content: `Returned: ${typeof result === 'object' ? JSON.stringify(result) : String(result)}` });
        }
      } else {
        logs.push({ type: 'warn', content: `Execution for ${language} is not yet supported in-browser.` });
      }
    } catch (err) {
      let msg = err.message;
      if (msg.includes('require is not defined')) {
        msg += " (Hint: This console runs in the browser, not Node.js. Use browser-native APIs or fetch instead of require.)";
      }
      logs.push({ type: 'error', content: msg });
    }

    // Restore original console
    console.log = originalLog;
    console.error = originalError;

    setOutput(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), items: logs }]);
    setIsRunning(false);
  };

  const clearConsole = () => setOutput([]);

  if (!isOpen) return null;

  return (
    <div className="console-panel">
      <div className="console-header">
        <div className="console-header-left">
          <span className="console-title">🖥️ Output Console</span>
          <div className="console-actions">
            <button className="console-btn run" onClick={runCode} disabled={isRunning}>
              {isRunning ? 'Running...' : '▶ Run Code'}
            </button>
            <button className="console-btn clear" onClick={clearConsole}>Clear</button>
          </div>
        </div>
        <button className="console-close" onClick={onClose}>✕</button>
      </div>

      <div className="console-body">
        {output.length === 0 ? (
          <div className="console-empty">
            <span>No output yet. Click 'Run Code' to execute the current file.</span>
          </div>
        ) : (
          output.map((run, idx) => (
            <div key={idx} className="console-run-group">
              <div className="run-timestamp">Run at {run.timestamp}</div>
              {run.items.map((item, i) => (
                <div key={i} className={`console-line ${item.type}`}>
                  <span className="line-prefix">{item.type === 'error' ? '✖' : '›'}</span>
                  <span className="line-content">{item.content}</span>
                </div>
              ))}
            </div>
          ))
        )}
        <div ref={consoleBottomRef} />
      </div>
    </div>
  );
}
