export interface ODataKeyField {
  name: string;
  value: string;
}

export interface ODataEntityField {
  name: string;
  type: string;
}

const NUMERIC_TYPES = new Set([
  'Byte',
  'SByte',
  'Int16',
  'Int32',
  'Int64',
  'Decimal',
  'Double',
  'Single',
]);

const BOOLEAN_TYPES = new Set(['Boolean', 'Bool']);
const GUID_TYPES = new Set(['Guid']);
const DATE_TYPES = new Set(['DateTime', 'DateTimeOffset', 'Date', 'Time']);

function normalizeType(type?: string): string {
  if (!type) return '';
  return type.split('.').pop()?.replace(/^Collection\(|\)$/g, '') || type;
}

function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Formats a single OData V2 key literal according to the field type.
 */
export function formatODataKeyValue(value: string, type?: string): string {
  const raw = value.trim();
  const normalizedType = normalizeType(type);

  if (NUMERIC_TYPES.has(normalizedType) && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw)) {
    return raw;
  }

  if (BOOLEAN_TYPES.has(normalizedType) && /^(true|false)$/i.test(raw)) {
    return raw.toLowerCase();
  }

  if (GUID_TYPES.has(normalizedType)) {
    return `guid'${raw.replace(/'/g, "''")}'`;
  }

  if (DATE_TYPES.has(normalizedType)) {
    if (/^(datetime|guid|time)'/i.test(raw)) return raw;
    const isoValue = raw.replace(' ', 'T');
    return `datetime'${isoValue.replace(/'/g, "''")}'`;
  }

  return quoteString(raw);
}

/**
 * Builds an OData key segment, e.g. (ID=42) or (ID='42',Region='EU').
 */
export function buildODataKeyPath(
  keyFields: ODataKeyField[],
  entityFields: ODataEntityField[] = []
): string {
  const validKeys = keyFields.filter((key) => key.value.trim() !== '');
  if (validKeys.length === 0) return '';

  const parts = validKeys.map((key) => {
    const field = entityFields.find((candidate) => candidate.name === key.name);
    const formattedValue = formatODataKeyValue(key.value, field?.type);
    return key.name ? `${key.name}=${formattedValue}` : formattedValue;
  });

  return `(${parts.join(',')})`;
}
