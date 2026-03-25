import { Router } from 'express';
import sapClient from '../services/sapClient';

const router = Router({ mergeParams: true });

const SERVICE_NAME_REGEX = /^(\/)?[A-Za-z_][A-Za-z0-9_\/]*$/;
const ENTITY_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

function validateServiceName(name: string): boolean {
  return name.length <= 30 && SERVICE_NAME_REGEX.test(name);
}

function validateEntityName(name?: string): boolean {
  if (!name) return false;
  return name.length <= 30 && ENTITY_NAME_REGEX.test(name);
}

// Parse XML metadata to extract detailed information
function parseMetadata(xml: string) {
  console.log('[parseMetadata] XML length:', xml.length);
  
  const entities: Array<{
    name: string;
    entityType: string;
    fields: Array<{ name: string; type: string; nullable?: string }>;
  }> = [];
  
  const functionImports: Array<{
    name: string;
    returnType?: string;
    parameters: Array<{ name: string; type: string; mode?: string }>;
  }> = [];

  // Extract EntitySets with their EntityTypes - more flexible regex
  const entitySetRegex = /<EntitySet\s+[^>]*Name="([^"]+)"[^>]*EntityType="([^"]+)"/g;
  let match;
  let entitySetCount = 0;
  while ((match = entitySetRegex.exec(xml)) !== null) {
    entitySetCount++;
    const entitySetName = match[1];
    const entityTypeFull = match[2]; // e.g., "ZAWP_DPP_SRV.RCMHeader"
    const entityTypeName = entityTypeFull.split('.').pop() || entityTypeFull;
    console.log('[parseMetadata] EntitySet:', entitySetName, '-> EntityType:', entityTypeName);
    
    // Find EntityType definition - more robust regex that handles different attribute orders
    const entityTypeRegex = new RegExp(
      `<EntityType\\s+[^>]*Name="${entityTypeName}"[^>]*>([\\s\\S]*?)</EntityType>`,
      'i'
    );
    const entityTypeMatch = xml.match(entityTypeRegex);
    
    const fields: Array<{ name: string; type: string; nullable?: string; maxLength?: number }> = [];
    const keyFieldNames: string[] = [];
    
    if (entityTypeMatch) {
      const entityTypeContent = entityTypeMatch[1];
      
      // Extract Key property names first (composite keys)
      const keyRegex = /<Key>([\s\S]*?)<\/Key>/gi;
      const keyMatch = keyRegex.exec(entityTypeContent);
      if (keyMatch) {
        const keyContent = keyMatch[1];
        const keyPropRegex = /<PropertyRef[^>]*Name="([^"]+)"/g;
        let keyPropMatch;
        while ((keyPropMatch = keyPropRegex.exec(keyContent)) !== null) {
          keyFieldNames.push(keyPropMatch[1]);
        }
      }
      console.log('[parseMetadata] Keys for', entityTypeName, ':', keyFieldNames);
      
      // Extract Properties (fields) - more flexible regex
      const propertyRegex = /<Property\s+[^>]*Name="([^"]+)"[^>]*Type="([^"]+)"([^>]*)\s*\/?>/gi;
      let propMatch;
      while ((propMatch = propertyRegex.exec(entityTypeContent)) !== null) {
        const propName = propMatch[1];
        const propType = propMatch[2].split('.').pop() || propMatch[2];
        const propAttrs = propMatch[3] || '';
        
        let nullable: string | undefined;
        if (keyFieldNames.includes(propName)) {
          nullable = 'key';
        } else if (propAttrs.includes('Nullable="false"') || propAttrs.includes("Nullable='false'")) {
          nullable = 'required';
        } else if (propAttrs.includes('Nullable="true"') || propAttrs.includes("Nullable='true'")) {
          nullable = 'optional';
        }
        
        const maxLengthMatch = propAttrs.match(/MaxLength="(\d+)"/);
        const maxLength = maxLengthMatch ? parseInt(maxLengthMatch[1]) : undefined;
        
        fields.push({
          name: propName,
          type: propType,
          nullable,
          maxLength,
        });
      }
      console.log('[parseMetadata] Fields for', entityTypeName, ':', fields.length);
    } else {
      console.log('[parseMetadata] EntityType NOT FOUND:', entityTypeName);
    }
    
    entities.push({
      name: entitySetName,
      entityType: entityTypeName,
      fields,
    });
  }
  console.log('[parseMetadata] Total EntitySets found:', entitySetCount, 'Entities:', entities.length);

  // Extract FunctionImports with parameters (handles both closing and self-closing tags)
  const functionImportRegex = /<FunctionImport\s+([^>]*?)(?:>([\s\S]*?)<\/FunctionImport>|\s*\/>)/g;
  while ((match = functionImportRegex.exec(xml)) !== null) {
    const fullMatch = match[0];
    const attrs = match[1];
    const innerContent = match[2] || ''; // content between tags (if any)
    const nameMatch = attrs.match(/Name="([^"]+)"/);
    const returnTypeMatch = attrs.match(/ReturnType="([^"]*)"/);

    if (!nameMatch) continue;

    const funcName = nameMatch[1];
    const returnType = returnTypeMatch ? returnTypeMatch[1] : undefined;

    const parameters: Array<{ name: string; type: string; mode?: string }> = [];

    // Extract Parameters from inside FunctionImport or from attributes
    const paramRegex = /<Parameter[^>]*Name="([^"]+)"[^>]*Type="([^"]+)"([^>]*)\/?>/g;
    let paramMatch;
    // Search in inner content for tags with closing, or in full match for self-closing
    const contentToSearch = innerContent || fullMatch;
    while ((paramMatch = paramRegex.exec(contentToSearch)) !== null) {
      const paramName = paramMatch[1];
      const paramType = paramMatch[2].split('.').pop() || paramMatch[2];
      const paramAttrs = paramMatch[3];
      const mode = paramAttrs.includes('Mode="In"') ? 'in' :
                   paramAttrs.includes('Mode="Out"') ? 'out' :
                   paramAttrs.includes('Mode="InOut"') ? 'in/out' : 'in';

      parameters.push({
        name: paramName,
        type: paramType,
        mode,
      });
    }

    functionImports.push({
      name: funcName,
      returnType: returnType || undefined,
      parameters,
    });
  }

  return { entities, functionImports };
}

router.get('/metadata', async (req, res, next) => {
  try {
    const { serviceName, version } = req.query as { serviceName: string; version?: string };
    console.log('[metadata] serviceName:', serviceName, 'version:', version, 'type:', typeof version);
    
    if (!serviceName || !validateServiceName(serviceName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid service name format',
      });
    }
    
    const metadata = await sapClient.getServiceMetadata(serviceName, version);
    
    res.set('Content-Type', 'application/xml');
    res.send(metadata);
  } catch (error: any) {
    console.log('[metadata] Error:', error.message);
    next(error);
  }
});

router.get('/entities', async (req, res, next) => {
  try {
    const { serviceName, version } = req.query as { serviceName: string; version?: string };
    
    if (!serviceName || !validateServiceName(serviceName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid service name format',
      });
    }
    
    const metadata = await sapClient.getServiceMetadata(serviceName, version);
    const { entities, functionImports } = parseMetadata(metadata);

    res.json({
      success: true,
      serviceName,
      entities,
      functionImports,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/entities/:entityName/fields', async (req, res, next) => {
  try {
    const { serviceName, version } = req.query as { serviceName: string; version?: string };
    const entityName = req.params.entityName;
    
    if (!serviceName || !validateServiceName(serviceName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid service name format',
      });
    }
    
    if (!validateEntityName(entityName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid entity name format',
      });
    }
    
    const metadata = await sapClient.getServiceMetadata(serviceName, version);
    const { entities } = parseMetadata(metadata);
    
    const entity = entities.find(e => e.name === entityName);
    
    if (!entity) {
      console.log('[parseMetadata] Entity not found:', entityName, 'Available:', entities.map(e => e.name).join(', '));
      return res.status(404).json({
        success: false,
        error: `Entity '${entityName}' not found in service '${serviceName}'`,
      });
    }

    res.json({
      success: true,
      serviceName,
      entityName,
      fields: entity.fields,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
