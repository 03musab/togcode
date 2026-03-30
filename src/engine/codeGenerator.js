// src/engine/codeGenerator.js

// ============================================================================
//  UNIVERSAL LOGIC SCHEMA UTILITIES
// ============================================================================

/**
 * Infer a Python type annotation from a field value string.
 * Supports: int, float, bool, list, dict, and falls back to str.
 */
function inferPyType(value = '') {
  const v = String(value).trim().toLowerCase();
  if (v === 'int' || v === 'integer')   return 'int';
  if (v === 'float' || v === 'number')  return 'float';
  if (v === 'bool' || v === 'boolean')  return 'bool';
  if (v === 'list' || v === 'array')    return 'List[Any]';
  if (v === 'dict' || v === 'object')   return 'Dict[str, Any]';
  if (v === 'optional')                 return 'Optional[str]';
  return 'str';
}

/**
 * Infer a TypeScript type from a field value string.
 */
function inferTsType(value = '') {
  const v = String(value).trim().toLowerCase();
  if (v === 'int' || v === 'integer' || v === 'float' || v === 'number') return 'number';
  if (v === 'bool' || v === 'boolean')  return 'boolean';
  if (v === 'list' || v === 'array')    return 'unknown[]';
  if (v === 'dict' || v === 'object')   return 'Record<string, unknown>';
  if (v === 'optional')                 return 'string | null';
  return 'string';
}

/**
 * Capitalise the first letter of a string (for class/interface names).
 */
function cap(s = '') {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build a Universal Logic Schema object representing this node's contract.
 */
function buildSchema(logicNode, upstreamIntents = [], downstreamIntents = []) {
  return {
    id:        logicNode.id,
    intent:    logicNode.intent || 'logic-unit',
    type:      logicNode.type || '',
    inputs:    logicNode.inputs  || {},
    outputs:   logicNode.outputs || {},
    upstream:  upstreamIntents,
    downstream: downstreamIntents,
  };
}

// ============================================================================
//  PYDANTIC MODEL BUILDER  (Python)
// ============================================================================

/**
 * Generate a Pydantic v2 BaseModel for a given schema side (inputs or outputs).
 * @param {string} className - e.g. 'UserInput'
 * @param {Object} fields    - { fieldName: typeHint }
 * @param {string[]} extraImports - any extra types needed
 */
function buildPydanticModel(className, fields = {}) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return '';

  const needsAdvanced = Object.values(fields).some(v => {
    const t = inferPyType(v);
    return t.includes('List') || t.includes('Dict') || t.includes('Optional');
  });

  const lines = [
    `class ${className}(BaseModel):`,
    ...keys.map(k => `    ${k}: ${inferPyType(fields[k])}`),
  ];

  return lines.join('\n');
}

// ============================================================================
//  TYPESCRIPT INTERFACE BUILDER
// ============================================================================

/**
 * Generate a TypeScript Interface for a given schema side.
 */
function buildTsInterface(interfaceName, fields = {}) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return '';

  const lines = [
    `interface ${interfaceName} {`,
    ...keys.map(k => `  ${k}: ${inferTsType(fields[k])};`),
    '}',
  ];

  return lines.join('\n');
}

// ============================================================================
//  CLIPBOARD UTILITY  (works in browser via Clipboard API)
// ============================================================================

/**
 * Copy a code string to the clipboard.
 * Returns a Promise<boolean> — true on success, false on failure.
 */
export async function copyToClipboard(code) {
  if (!code) return false;
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch {
    // Fallback for older browsers / non-HTTPS contexts
    try {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.opacity  = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// ============================================================================
//  MAIN GENERATOR
// ============================================================================

/**
 * Generates boilerplate code based on the intent and inputs/outputs of a logic node.
 * @param {Object} logicNode  - The logic node: { intent, inputs, outputs, id }.
 * @param {Object} context    - Optional: { nodes, connections } for connection-aware generation.
 * @returns {Object} { python, typescript, schema }
 */
export function generateBoilerplate(logicNode, context = {}) {
  if (!logicNode) return {
    python:     '# No node selected.',
    typescript: '// No node selected.',
    schema:     null,
  };

  const { intent = 'logic-unit', type = '', inputs = {}, outputs = {}, id: nodeId, description = '' } = logicNode;
  const { nodes = {}, connections = {} } = context;

  // Alias support: if type is PostgresDatabase, treat as database intent
  const effectiveIntent = type === 'PostgresDatabase' ? 'database' : intent;

  // ─── Resolve wired neighbours ────────────────────────────────────────────
  const upstreamNodes = Object.values(connections)
    .filter(c => c.targetNodeId === nodeId && nodes[c.sourceNodeId])
    .map(c => nodes[c.sourceNodeId]);

  const downstreamNodes = Object.values(connections)
    .filter(c => c.sourceNodeId === nodeId && nodes[c.targetNodeId])
    .map(c => nodes[c.targetNodeId]);

  const upstreamIntents   = upstreamNodes.map(n => n.intent || 'logic-unit');
  const downstreamIntents = downstreamNodes.map(n => n.intent || 'logic-unit');

  const hasUpstreamAuth  = upstreamIntents.includes('auth');
  const hasUpstreamDB    = upstreamIntents.includes('database');
  const hasDownstreamDB  = downstreamIntents.includes('database');
  const hasDownstreamApi = downstreamIntents.includes('api');

  // ─── Build Universal Logic Schema ─────────────────────────────────────────
  const schema = buildSchema(logicNode, upstreamIntents, downstreamIntents);

  const inputKeys  = Object.keys(inputs);
  const outputKeys = Object.keys(outputs);
  // 'name' is a meta key used for class naming, not a real field
  const dataInputKeys  = inputKeys.filter(k => k !== 'name');
  const dataOutputKeys = outputKeys.filter(k => k !== 'name');

  const modelName = inputs.name ? cap(inputs.name) : 'MyModel';

  // ─── Common Python preamble ────────────────────────────────────────────────
  const needsAdvancedPy = dataInputKeys.some(k => {
    const t = inferPyType(inputs[k]);
    return t.includes('List') || t.includes('Dict') || t.includes('Optional');
  });

  const pyAdvancedImport = needsAdvancedPy
    ? `from typing import List, Dict, Any, Optional\n`
    : (dataInputKeys.some(() => true) ? '' : '');

  // ══════════════════════════════════════════════════════════════════════════
  //  DATABASE INTENT
  // ══════════════════════════════════════════════════════════════════════════
  if (effectiveIntent === 'database') {
    const ormFields = dataInputKeys.length
      ? dataInputKeys.map(f => `    ${f} = Column(${inferPyType(inputs[f]) === 'int' ? 'Integer' : 'String'})`).join('\n')
      : '    # Add your fields here';

    const prismaFields = dataInputKeys.length
      ? dataInputKeys.map(f => `  ${f}    ${inferTsType(inputs[f]) === 'number' ? 'Int' : 'String'}?`).join('\n')
      : '  // Add your fields here';

    // Pydantic model for API-layer validation
    const pydanticInput = buildPydanticModel(`${modelName}Create`, inputs);
    const pydanticUpdate = dataInputKeys.length
      ? buildPydanticModel(`${modelName}Update`,
          Object.fromEntries(dataInputKeys.map(k => [k, 'optional'])))
      : '';

    // TypeScript Interface
    const tsInputInterface  = buildTsInterface(`${modelName}CreateInput`, inputs);
    const tsUpdateInterface = dataInputKeys.length
      ? buildTsInterface(`${modelName}UpdateInput`,
          Object.fromEntries(dataInputKeys.map(k => [k, 'optional'])))
      : '';

    const python = [
`# ─── Universal Logic Schema ──────────────────────────────────────────
# Intent  : ${effectiveIntent}
# Node ID : ${nodeId || '?'}
# Inputs  : ${dataInputKeys.join(', ') || 'none'}
# Outputs : ${dataOutputKeys.join(', ') || 'none'}
# Upstream: ${upstreamIntents.join(', ') || 'none'}
# ─────────────────────────────────────────────────────────────────────

# FastAPI · SQLAlchemy Model${hasUpstreamAuth ? '  ← Auth-protected' : ''}
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from .database import Base
from pydantic import BaseModel
`,
pyAdvancedImport,
hasUpstreamAuth ? `from fastapi import Depends
from .auth import get_current_user
` : '',
`
# ── Pydantic Schemas ──────────────────────────────────────────────────
${pydanticInput || `class ${modelName}Create(BaseModel):\n    pass  # add fields`}

${pydanticUpdate || ''}

# ── ORM Model ─────────────────────────────────────────────────────────
class ${modelName}(Base):
    __tablename__ = "${modelName.toLowerCase()}s"

    id         = Column(Integer, primary_key=True, index=True)
${ormFields}
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# ── Repository ────────────────────────────────────────────────────────
def get_${modelName.toLowerCase()}(db, record_id: int${hasUpstreamAuth ? ', current_user=Depends(get_current_user)' : ''}) -> ${modelName}:
    ${description ? `"""\n    ${description}\n    """` : '...'}
    return db.query(${modelName}).filter(${modelName}.id == record_id).first()

def create_${modelName.toLowerCase()}(db, payload: ${modelName}Create${hasUpstreamAuth ? ', current_user=Depends(get_current_user)' : ''}) -> ${modelName}:
    ${description ? `"""\n    ${description}\n    """` : '...'}
    record = ${modelName}(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

def update_${modelName.toLowerCase()}(db, record_id: int, payload: ${modelName}Update${hasUpstreamAuth ? ', current_user=Depends(get_current_user)' : ''}) -> ${modelName}:
    db.query(${modelName}).filter(${modelName}.id == record_id).update(payload.model_dump(exclude_unset=True))
    db.commit()
    return get_${modelName.toLowerCase()}(db, record_id)
`,
hasDownstreamApi ? `\n# → Exposed via wired API node\n` : '',
    ].join('');

    const typescript = [
`// ─── Universal Logic Schema ──────────────────────────────────────────
// Intent  : database
// Node ID : ${nodeId || '?'}
// Inputs  : ${dataInputKeys.join(', ') || 'none'}
// Outputs : ${dataOutputKeys.join(', ') || 'none'}
// Upstream: ${upstreamIntents.join(', ') || 'none'}
// ─────────────────────────────────────────────────────────────────────

// Node.js · Prisma + Express${hasUpstreamAuth ? '  ← Auth-protected' : ''}
import { PrismaClient } from '@prisma/client'
`,
hasUpstreamAuth ? `import { authenticateToken } from './auth'\n` : '',
`
// ── TypeScript Interfaces ──────────────────────────────────────────────
${tsInputInterface || `interface ${modelName}CreateInput {\n  // add fields\n}`}

${tsUpdateInterface || ''}

// ── Prisma Schema (schema.prisma) ──────────────────────────────────────
// model ${modelName} {
//   id        Int      @id @default(autoincrement())
${prismaFields}
//   createdAt DateTime @default(now())
// }

const prisma = new PrismaClient()

// ── Repository ────────────────────────────────────────────────────────
export const get${modelName} = async (id: number): Promise<${modelName}CreateInput | null> =>
  prisma.${modelName.toLowerCase()}.findUnique({ where: { id } })

export const create${modelName} = async (data: ${modelName}CreateInput) =>
  prisma.${modelName.toLowerCase()}.create({ data })

export const update${modelName} = async (id: number, data: Partial<${modelName}CreateInput>) =>
  prisma.${modelName.toLowerCase()}.update({ where: { id }, data })

export const delete${modelName} = async (id: number) =>
  prisma.${modelName.toLowerCase()}.delete({ where: { id } })
`,
hasDownstreamApi ? `\n// → Exposed via wired API node\n` : '',
    ].join('');

    return { python, typescript, schema };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  API INTENT
  // ══════════════════════════════════════════════════════════════════════════
  if (intent === 'api') {
    const endpoint = inputs.endpoint || '/resource';
    const method   = (inputs.method  || 'GET').toUpperCase();
    const bodyArgs  = dataInputKeys.filter(k => !['endpoint', 'method'].includes(k));
    const bodyInputs = Object.fromEntries(bodyArgs.map(k => [k, inputs[k] || 'str']));

    const pydanticBody  = buildPydanticModel(`${modelName}Body`, bodyInputs);
    const tsBody        = buildTsInterface(`${modelName}Body`, bodyInputs);

    const python = [
`# ─── Universal Logic Schema ──────────────────────────────────────────
# Intent  : api
# Node ID : ${nodeId || '?'}
# Endpoint: ${method} ${endpoint}
# Inputs  : ${dataInputKeys.join(', ') || 'none'}
# Outputs : ${dataOutputKeys.join(', ') || 'none'}
# Upstream: ${upstreamIntents.join(', ') || 'none'}
# ─────────────────────────────────────────────────────────────────────

# FastAPI · Route Handler${hasUpstreamAuth ? '  ← Auth-guarded' : ''}
from fastapi import APIRouter, Depends
from pydantic import BaseModel
`,
pyAdvancedImport,
hasUpstreamAuth ? `from .auth import get_current_user\n` : '',
hasUpstreamDB   ? `from .database import get_db\nfrom sqlalchemy.orm import Session\n` : '',
pydanticBody
  ? `\n# ── Request Body Model ────────────────────────────────────────────────\n${pydanticBody}\n`
  : '',
`
# ── Output Schema ─────────────────────────────────────────────────────
class ${modelName}Response(BaseModel):
${dataOutputKeys.length ? dataOutputKeys.map(k => `    ${k}: ${inferPyType(outputs[k])}`).join('\n') : '    pass  # define your output fields'}

router = APIRouter()

@router.${method.toLowerCase()}("${endpoint}")
async def ${modelName.toLowerCase()}_handler(
${pydanticBody ? `    body: ${modelName}Body,` : '    # no body inputs'}
${hasUpstreamAuth ? '    current_user = Depends(get_current_user),' : ''}
${hasUpstreamDB   ? '    db: Session = Depends(get_db),' : ''}
) -> ${modelName}Response:
    """${description ? description : `${method} ${endpoint}`}"""
${dataOutputKeys.length
  ? dataOutputKeys.map(k => `    ${k} = None  # compute ${k}`).join('\n')
  : '    pass  # implement logic'}
    return ${modelName}Response(${dataOutputKeys.map(k => `${k}=${k}`).join(', ') || ''})
`,
    ].join('');

    const typescript = [
`// ─── Universal Logic Schema ──────────────────────────────────────────
// Intent  : api
// Node ID : ${nodeId || '?'}
// Endpoint: ${method} ${endpoint}
// Inputs  : ${dataInputKeys.join(', ') || 'none'}
// Outputs : ${dataOutputKeys.join(', ') || 'none'}
// Upstream: ${upstreamIntents.join(', ') || 'none'}
// ─────────────────────────────────────────────────────────────────────

// Express · Route Handler${hasUpstreamAuth ? '  ← Auth-guarded' : ''}
import { Router, Request, Response } from 'express'
`,
hasUpstreamAuth ? `import { authenticateToken } from './auth'\n` : '',
hasUpstreamDB   ? `import prisma from './prisma'\n` : '',
tsBody ? `\n// ── Request/Response Interfaces ───────────────────────────────────────\n${tsBody}\n` : '',
`
${dataOutputKeys.length
  ? buildTsInterface(`${modelName}Response`, Object.fromEntries(dataOutputKeys.map(k => [k, outputs[k] || 'str'])))
  : `interface ${modelName}Response {\n  // define output fields\n}`}

const router = Router()

router.${method.toLowerCase()}('${endpoint}',
${hasUpstreamAuth ? '  authenticateToken,' : ''}
  async (req: Request, res: Response) => {
${pydanticBody ? `    const body = req.body as ${modelName}Body` : '    // no body inputs'}
${dataOutputKeys.length
  ? dataOutputKeys.map(k => `    const ${k} = undefined // compute ${k}`).join('\n')
  : '    // implement logic'}
    const result: ${modelName}Response = { ${dataOutputKeys.join(', ') || '/* fields */'} }
    res.json(result)
  }
)

export default router
`,
    ].join('');

    return { python, typescript, schema };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  TRANSFORM INTENT
  // ══════════════════════════════════════════════════════════════════════════
  if (intent === 'transform') {
    const fnName = inputs.name || 'transformData';
    const argInputs  = Object.fromEntries(dataInputKeys.map(k => [k, inputs[k] || '']));
    const argOutputs = Object.fromEntries(dataOutputKeys.map(k => [k, outputs[k] || '']));

    const pydanticIn  = buildPydanticModel(`${cap(fnName)}Input`,  argInputs);
    const pydanticOut = buildPydanticModel(`${cap(fnName)}Output`, argOutputs);
    const tsIn        = buildTsInterface(`${cap(fnName)}Input`,    argInputs);
    const tsOut       = buildTsInterface(`${cap(fnName)}Output`,   argOutputs);

    const python = [
`# ─── Universal Logic Schema ──────────────────────────────────────────
# Intent  : transform
# Node ID : ${nodeId || '?'}
# Inputs  : ${dataInputKeys.join(', ') || 'none'}
# Outputs : ${dataOutputKeys.join(', ') || 'none'}
# ─────────────────────────────────────────────────────────────────────

# FastAPI · Data Transform
from pydantic import BaseModel
`,
pyAdvancedImport,
pydanticIn
  ? `\n# ── Input Schema ──────────────────────────────────────────────────────\n${pydanticIn}\n`
  : '',
pydanticOut
  ? `\n# ── Output Schema ─────────────────────────────────────────────────────\n${pydanticOut}\n`
  : '',
`
def ${fnName}(payload: ${cap(fnName)}Input) -> ${cap(fnName)}Output:
    """
    ${description ? description + '\n    \n    ' : ''}Transform: ${fnName}
    Maps ${dataInputKeys.length} input(s) → ${dataOutputKeys.length} output(s)
    """
${dataOutputKeys.length
  ? dataOutputKeys.map(k => `    ${k} = None  # compute from payload`).join('\n')
  : '    result = None  # implement logic'}
    return ${cap(fnName)}Output(${dataOutputKeys.map(k => `${k}=${k}`).join(', ') || ''})
`,
    ].join('');

    const typescript = [
`// ─── Universal Logic Schema ──────────────────────────────────────────
// Intent  : transform
// Node ID : ${nodeId || '?'}
// Inputs  : ${dataInputKeys.join(', ') || 'none'}
// Outputs : ${dataOutputKeys.join(', ') || 'none'}
// ─────────────────────────────────────────────────────────────────────

// TypeScript · Data Transform
`,
tsIn  ? `// ── Input Interface ──────────────────────────────────────────────────\n${tsIn}\n` : '',
tsOut ? `\n// ── Output Interface ─────────────────────────────────────────────────\n${tsOut}\n` : '',
`
export function ${fnName}(payload: ${cap(fnName)}Input): ${cap(fnName)}Output {
  /**
   * Transform: ${fnName}
   * Maps ${dataInputKeys.length} input(s) → ${dataOutputKeys.length} output(s)
   */
${dataOutputKeys.length
  ? dataOutputKeys.map(k => `  const ${k} = undefined // compute from payload`).join('\n')
  : '  const result = undefined  // implement logic'}
  return { ${dataOutputKeys.join(', ') || 'result'} }
}
`,
    ].join('');

    return { python, typescript, schema };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DEFAULT / LOGIC-UNIT — emit an annotated schema header
  // ══════════════════════════════════════════════════════════════════════════
  const schemaComment = [
    `# Intent  : ${intent}`,
    `# Node ID : ${nodeId || '?'}`,
    ...(description ? [`# Description: ${description}`] : []),
    `# Inputs  : ${dataInputKeys.join(', ') || 'none'}`,
    `# Outputs : ${dataOutputKeys.join(', ') || 'none'}`,
    `# Upstream: ${upstreamIntents.join(', ') || 'none'}`,
    `# Downstream: ${downstreamIntents.join(', ') || 'none'}`,
  ].join('\n');

  const python = `# ─── Universal Logic Schema ──────────────────────────────────────────
${schemaComment}
# ─────────────────────────────────────────────────────────────────────
#
# Set a specific intent (database · api · transform) to generate
# production-ready Pydantic models and repository boilerplate.
`;

  const typescript = python
    .split('\n')
    .map(l => l.replace(/^#/, '//'))
    .join('\n');

  return { python, typescript, schema };
}
