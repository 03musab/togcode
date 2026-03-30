// src/engine/pyParser.js

/**
 * Lightweight, pattern-based Python parser to sync Code Inspector changes
 * back to the visual Blueprint nodes.
 */

// Helper to reverse map common Python types back to user-friendly strings
function reverseMapPyType(pyType = '') {
  const t = pyType.trim();
  if (t === 'int') return 'int';
  if (t === 'float') return 'float';
  if (t === 'bool') return 'bool';
  if (t.includes('List')) return 'list';
  if (t.includes('Dict')) return 'dict';
  if (t.includes('Optional')) return 'optional';
  return 'str';
}

/**
 * Parses Python boilerplate back into node data.
 * @param {string} code - The current Python code from the inspector
 * @param {object} currentNode - The current node data (to preserve fields not in code)
 * @returns {object|null} - A delta object { intent, inputs, outputs, description } or null if parse failed
 */
export function parsePythonToNode(code, currentNode) {
  if (!code) return null;

  // Clone current node schema to maintain fields that aren't explicitly in the code block
  const delta = {
    intent: currentNode.intent || 'logic-unit',
    inputs: { ...currentNode.inputs },
    outputs: { ...currentNode.outputs },
    description: currentNode.description || '',
  };

  try {
    // 1. Extract Description (Docstrings)
    // Matches triple-quoted strings. We prioritize the one inside the main function or class.
    const docMatch = code.match(/"""([\s\S]*?)"""/);
    if (docMatch) {
      const docContent = docMatch[1].trim();
      // Only update description if it's not a generated header (starts with "Transform:" or "METHOD /path")
      if (!docContent.startsWith('Transform:') && !docContent.match(/^[A-Z]+\s\//)) {
         delta.description = docContent;
      }
    }

    // 2. Intent-Specific Parsing
    
    // --- API INTENT ---
    if (code.includes('@router.')) {
      delta.intent = 'api';
      // Liberal regex to handle ' or " and varied whitespace
      const routeMatch = code.match(/@router\.(\w+)\s*\(['"]([^'"]+)['"]\)/i);
      if (routeMatch) {
        delta.inputs.method = routeMatch[1].toUpperCase();
        delta.inputs.endpoint = routeMatch[2];
      }

      // Parse Body Model (Inputs) - more flexible whitespace
      const bodyClassMatch = code.match(/class\s+(\w+)Body\((BaseModel|object)\):\s*([\s\S]*?)(?=\n\n|\nclass|\ndef|$)/);
      if (bodyClassMatch) {
        const lines = bodyClassMatch[3].split('\n');
        lines.forEach(line => {
          const fieldMatch = line.match(/^\s*(\w+)\s*:\s*([\w\[\], ]+)/);
          if (fieldMatch) {
            const [_, name, type] = fieldMatch;
            if (name !== 'name' && name !== 'pass') delta.inputs[name] = reverseMapPyType(type);
          }
        });
      }

      // Parse Response Model (Outputs)
      const respClassMatch = code.match(/class\s+(\w+)Response\((BaseModel|object)\):\s*([\s\S]*?)(?=\n\n|\nclass|\ndef|$)/);
      if (respClassMatch) {
        const lines = respClassMatch[3].split('\n');
        lines.forEach(line => {
          const fieldMatch = line.match(/^\s*(\w+)\s*:\s*([\w\[\], ]+)/);
          if (fieldMatch) {
            const [_, name, type] = fieldMatch;
            if (name !== 'pass') delta.outputs[name] = reverseMapPyType(type);
          }
        });
      }
    }

    // --- DATABASE INTENT ---
    else if (code.includes('(Base):') || code.includes('__tablename__')) {
      delta.intent = 'database';
      
      // Parse Table/Model Name
      const modelClassMatch = code.match(/class\s+(\w+)\(Base\):/);
      if (modelClassMatch) {
        delta.inputs.name = modelClassMatch[1];
      }

      // Parse Create Model (Inputs)
      const createClassMatch = code.match(/class\s+(\w+)Create\((BaseModel|object)\):\s*([\s\S]*?)(?=\n\n|\nclass|\ndef|$)/);
      if (createClassMatch) {
        const lines = createClassMatch[3].split('\n');
        lines.forEach(line => {
          const m = line.match(/^\s*(\w+)\s*:\s*([\w\[\], ]+)/);
          if (m && m[1] !== 'name' && m[1] !== 'pass') {
            delta.inputs[m[1]] = reverseMapPyType(m[2]);
          }
        });
      }
    }

    // --- TRANSFORM INTENT ---
    else if (code.includes('def') && (code.includes('payload:') || code.includes('Input'))) {
      delta.intent = 'transform';
      
      const funcMatch = code.match(/def\s+(\w+)\s*\(/);
      if (funcMatch) delta.inputs.name = funcMatch[1];

      // Parse Input Schema
      const inClassMatch = code.match(/class\s+(\w+)Input\((BaseModel|object)\):\s*([\s\S]*?)(?=\n\n|\nclass|\ndef|$)/);
      if (inClassMatch) {
        inClassMatch[3].split('\n').forEach(line => {
          const m = line.match(/^\s*(\w+)\s*:\s*([\w\[\], ]+)/);
          if (m && m[1] !== 'name' && m[1] !== 'pass') delta.inputs[m[1]] = reverseMapPyType(m[2]);
        });
      }

      // Parse Output Schema
      const outClassMatch = code.match(/class\s+(\w+)Output\((BaseModel|object)\):\s*([\s\S]*?)(?=\n\n|\nclass|\ndef|$)/);
      if (outClassMatch) {
        outClassMatch[3].split('\n').forEach(line => {
          const m = line.match(/^\s*(\w+)\s*:\s*([\w\[\], ]+)/);
          if (m && m[1] !== 'pass') delta.outputs[m[1]] = reverseMapPyType(m[2]);
        });
      }
    }

    return delta;
  } catch (e) {
    console.warn('[pyParser] Failed to parse node code:', e);
    return null;
  }
}
