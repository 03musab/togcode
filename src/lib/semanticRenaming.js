// src/lib/semanticRenaming.js
// Provides intelligent field name suggestions based on node intent.

const SUGGESTIONS = {
  database:     ['id', 'name', 'createdAt', 'updatedAt', 'status'],
  api:          ['endpoint', 'method', 'headers', 'body', 'response'],
  transform:    ['input', 'output', 'mapping', 'filter'],
  'logic-unit': ['a', 'b', 'result', 'error'],
  auth:         ['userId', 'token', 'expiresAt', 'role'],
  cache:        ['key', 'value', 'ttl', 'hit'],
  queue:        ['message', 'priority', 'retries', 'dlq'],
};

export async function getSemanticSuggestions(intent) {
  return SUGGESTIONS[intent] || [];
}
