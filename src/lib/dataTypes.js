export const dataTypes = {
  text: { icon: '📝', label: 'Text' },
  number: { icon: '🔢', label: 'Number' },
  boolean: { icon: '✅', label: 'Boolean' },
  date: { icon: '📅', label: 'Date' },
  array: { icon: '📚', label: 'List' },
  object: { icon: '📦', label: 'Object' },
  any: { icon: '✨', label: 'Any' },
};

export const getDefaultDataType = (value) => {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object' && value !== null) return 'object';
  if (typeof value === 'string' && !isNaN(Date.parse(value))) return 'date';
  return 'text';
};
