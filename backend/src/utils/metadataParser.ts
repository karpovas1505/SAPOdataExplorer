import { XMLParser } from 'fast-xml-parser';

type XmlNode = Record<string, any>;

export interface ODataField {
  name: string;
  type: string;
  nullable?: string;
  maxLength?: number;
}

export interface ODataEntity {
  name: string;
  entityType: string;
  fields: ODataField[];
}

export interface ODataFunctionParameter {
  name: string;
  type: string;
  mode?: string;
}

export interface ODataFunctionImport {
  name: string;
  returnType?: string;
  parameters: ODataFunctionParameter[];
}

export interface ParsedMetadata {
  entities: ODataEntity[];
  functionImports: ODataFunctionImport[];
}

const ARRAY_ELEMENTS = new Set([
  'Schema',
  'EntityContainer',
  'EntitySet',
  'EntityType',
  'Property',
  'PropertyRef',
  'FunctionImport',
  'Parameter',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name, _jPath, _isLeafNode, isAttribute) =>
    !isAttribute && ARRAY_ELEMENTS.has(name),
});

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function readText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readText).join('');
  if (value && typeof value === 'object') {
    const node = value as XmlNode;
    return readText(node['#text'] ?? node['#cdata'] ?? '');
  }
  return '';
}

function normalizeType(type: string): string {
  return type.split('.').pop() || type;
}

function asObject(value: unknown): XmlNode | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as XmlNode)
    : null;
}

function parseFields(entityType: XmlNode | undefined): ODataField[] {
  if (!entityType) return [];

  const keyNames = asArray(entityType.Key?.PropertyRef)
    .map((ref) => readText(ref?.Name ?? ref))
    .filter(Boolean);

  return asArray(entityType.Property)
    .map((property): ODataField | null => {
      const node = asObject(property);
      if (!node || !node.Name) return null;

      const name = readText(node.Name);
      const type = normalizeType(readText(node.Type));
      let nullable: string | undefined;

      if (keyNames.includes(name)) {
        nullable = 'key';
      } else if (node.Nullable === 'false' || node.Nullable === false) {
        nullable = 'required';
      } else if (node.Nullable === 'true' || node.Nullable === true) {
        nullable = 'optional';
      }

      const maxLengthValue = node.MaxLength;
      const maxLength =
        maxLengthValue === undefined ? undefined : Number.parseInt(readText(maxLengthValue), 10);

      return {
        name,
        type,
        nullable,
        maxLength: Number.isNaN(maxLength) ? undefined : maxLength,
      };
    })
    .filter((field): field is ODataField => field !== null);
}

function parseFunctionImport(node: XmlNode): ODataFunctionImport | null {
  const name = readText(node.Name);
  if (!name) return null;

  const parameters = asArray(node.Parameter)
    .map((parameter): ODataFunctionParameter | null => {
      const param = asObject(parameter);
      if (!param) return null;

      const paramName = readText(param.Name);
      if (!paramName) return null;

      const rawMode = readText(param.Mode);
      const mode =
        rawMode === 'Out' ? 'out' : rawMode === 'InOut' ? 'in/out' : 'in';

      return {
        name: paramName,
        type: normalizeType(readText(param.Type)),
        mode,
      };
    })
    .filter((parameter): parameter is ODataFunctionParameter => parameter !== null);

  return {
    name,
    returnType: node.ReturnType ? readText(node.ReturnType) : undefined,
    parameters,
  };
}

export function parseMetadata(xml: string): ParsedMetadata {
  const parsed = parser.parse(xml) as XmlNode;
  const root = asObject(parsed.Edmx ?? parsed.edmx ?? Object.values(parsed)[0]) ?? {};
  const dataServices = asObject(root.DataServices) ?? root;

  const schemas = asArray(dataServices.Schema);
  if (schemas.length === 0 && (dataServices.EntityType || dataServices.EntityContainer)) {
    schemas.push(dataServices);
  }

  const entityTypes = new Map<string, XmlNode>();
  for (const schema of schemas) {
    for (const entityType of asArray(schema.EntityType)) {
      const node = asObject(entityType);
      if (node?.Name) entityTypes.set(readText(node.Name), node);
    }
  }

  const entities: ODataEntity[] = [];
  const functionImports: ODataFunctionImport[] = [];

  for (const schema of schemas) {
    for (const container of asArray(schema.EntityContainer)) {
      const containerNode = asObject(container);
      if (!containerNode) continue;

      for (const entitySet of asArray(containerNode.EntitySet)) {
        const node = asObject(entitySet);
        if (!node?.Name) continue;

        const entityTypeName = normalizeType(readText(node.EntityType));
        entities.push({
          name: readText(node.Name),
          entityType: entityTypeName,
          fields: parseFields(entityTypes.get(entityTypeName)),
        });
      }

      for (const functionImport of asArray(containerNode.FunctionImport)) {
        const node = asObject(functionImport);
        if (!node) continue;
        const parsedFunction = parseFunctionImport(node);
        if (parsedFunction) functionImports.push(parsedFunction);
      }
    }

    for (const functionImport of asArray(schema.FunctionImport)) {
      const node = asObject(functionImport);
      if (!node) continue;
      const parsedFunction = parseFunctionImport(node);
      if (parsedFunction) functionImports.push(parsedFunction);
    }
  }

  return { entities, functionImports };
}
