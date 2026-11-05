import { Router } from 'express';
import sapClient from '../services/sapClient';
import { parseMetadata } from '../utils/metadataParser';

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
