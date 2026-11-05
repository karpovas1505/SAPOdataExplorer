import { XMLParser } from 'fast-xml-parser';

export type XmlNode = Record<string, any>;

export function parseAdtXml(xml: string, arrayElements: string[] = []): XmlNode {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
    isArray: (name, _jPath, _isLeafNode, isAttribute) =>
      !isAttribute && arrayElements.includes(name),
  });

  return parser.parse(xml) as XmlNode;
}

export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function asObject(value: unknown): XmlNode | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as XmlNode)
    : null;
}

export function readXmlText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readXmlText).join('');
  if (value && typeof value === 'object') {
    const node = value as XmlNode;
    return readXmlText(node['#text'] ?? node['#cdata'] ?? '');
  }
  return '';
}

export function findNodes(
  value: unknown,
  tagName: string,
  result: XmlNode[] = []
): XmlNode[] {
  if (Array.isArray(value)) {
    for (const item of value) findNodes(item, tagName, result);
    return result;
  }

  const node = asObject(value);
  if (!node) return result;

  for (const [key, child] of Object.entries(node)) {
    if (key === tagName) {
      for (const item of asArray(child)) {
        const object = asObject(item);
        if (object) result.push(object);
      }
    }
    findNodes(child, tagName, result);
  }

  return result;
}

export function getRootNode(parsed: XmlNode): XmlNode | null {
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith('?')) continue;
    const node = asObject(value);
    if (node) return node;
    if (Array.isArray(value)) {
      for (const item of value) {
        const itemNode = asObject(item);
        if (itemNode) return itemNode;
      }
    }
  }
  return null;
}
