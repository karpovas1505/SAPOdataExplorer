import { Router } from 'express';
import sapClient from '../services/sapClient';

const router = Router();

const SERVICE_NAME_REGEX = /^(\/)?[A-Za-z_][A-Za-z0-9_\/]*$/;
const CLASS_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]+$/;

function validateServiceName(name: string): boolean {
  return name.length <= 30 && SERVICE_NAME_REGEX.test(name);
}

function validateClassName(name: string): boolean {
  return name.length <= 30 && CLASS_NAME_REGEX.test(name);
}

const writeToLog = (message: string) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
};

router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    let services = await sapClient.getServices();

    // Client-side search filtering (support string query)
    if (typeof search === 'string' && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      services = services.filter((service: any) => {
        const name = (service.TechnicalServiceName || '').toLowerCase();
        const description = (service.Description || '').toLowerCase();
        const namespace = (service.Namespace || '').toLowerCase();
        return name.includes(searchLower) || 
               description.includes(searchLower) || 
               namespace.includes(searchLower);
      });
    }
    
    const formattedServices = services.map((service: any) => {
      // Use title/ExternalName if available, otherwise fall back to TechnicalServiceName
      const displayName = service.title || service.ExternalName || service.Description || service.TechnicalServiceName;
      return {
        id: service.ServiceId,
        name: service.TechnicalServiceName,  // Keep technical name for API calls
        displayName: displayName,  // Human-readable name for display
        description: service.Description,
        version: service.TechnicalServiceVersion,
        namespace: service.Namespace,
        createdAt: service.CreatedAt,
        lastModifiedAt: service.LastModifiedAt,
      };
    });

    res.json({
      success: true,
      count: formattedServices.length,
      data: formattedServices,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:serviceName/details', async (req, res, next) => {
  try {
    const { serviceName } = req.params as { serviceName: string };
    
    if (!validateServiceName(serviceName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid service name format',
      });
    }
    
    // Get service details from catalog
    const services = await sapClient.getServices();
    const service = services.find((s: any) => s.TechnicalServiceName === serviceName);
    
    if (!service) {
      return res.status(404).json({
        success: false,
        error: `Service '${serviceName}' not found`,
      });
    }

    // Extract namespace (usually something like /SAP/ or /ZCUSTOM/)
    const namespace = service.Namespace || '';
    const cleanNamespace = namespace.replace(/\//g, '').toUpperCase();
    
    // Remove _SRV suffix from service name if present
    let cleanServiceName = serviceName.toUpperCase();
    if (cleanServiceName.endsWith('_SRV')) {
      cleanServiceName = cleanServiceName.slice(0, -4);
    }
    
    // Generate typical ABAP class names with ZCL_ prefix
    // Pattern: ZCL_{NAMESPACE}_{SERVICENAME}_DPC_EXT
    const baseName = cleanNamespace ? `${cleanNamespace}_${cleanServiceName}` : cleanServiceName;
    
    const dpcClass = `ZCL_${baseName}_DPC`;
    const dpcExtClass = `ZCL_${baseName}_DPC_EXT`;
    const mpcClass = `ZCL_${baseName}_MPC`;
    const mpcExtClass = `ZCL_${baseName}_MPC_EXT`;
    
    const altDpcExtClass = `ZCL_${cleanServiceName}_DPC_EXT`;

    res.json({
      success: true,
      serviceName,
      technicalDetails: {
        serviceId: service.ServiceId,
        namespace: service.Namespace,
        version: service.ServiceVersion,
        createdAt: service.CreatedAt,
        lastModifiedAt: service.LastModifiedAt,
      },
      abapClasses: {
        dataProvider: {
          name: dpcClass,
          description: 'Data Provider Class (Base)',
          methods: ['CREATE_ENTITY', 'UPDATE_ENTITY', 'DELETE_ENTITY', 'GET_ENTITY', 'GET_ENTITYSET'],
        },
        dataProviderExt: {
          name: dpcExtClass,
          altName: altDpcExtClass,
          description: 'Data Provider Extension Class (Custom Logic)',
          methods: ['CREATE_ENTITY', 'UPDATE_ENTITY', 'DELETE_ENTITY', 'GET_ENTITY', 'GET_ENTITYSET'],
          se80Link: `se80://class/${dpcExtClass}`,
        },
        modelProvider: {
          name: mpcClass,
          description: 'Model Provider Class (Base)',
        },
        modelProviderExt: {
          name: mpcExtClass,
          description: 'Model Provider Extension Class',
        },
      },
      se80Transaction: `/nse80`,
     sapGatewayInfo: {
         // Handle service names that might start with '/' (especially for IWFND/IWBEP services from catalog)
         const cleanServiceName = serviceName.startsWith('/') ? serviceName.substring(1) : serviceName;
         serviceUrl: cleanServiceName.startsWith('IWFND/') || cleanServiceName.startsWith('IWBEP/') 
           ? `/sap/opu/odata/${cleanServiceName};v=2/` 
           : `/sap/opu/odata/sap/${cleanServiceName}/`,
         serviceVersion: service.ServiceVersion,
       },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:serviceName/abap-source/:objectName', async (req, res, next) => {
  try {
    const { objectName } = req.params as { objectName: string };
    const { type } = req.query as { type?: string };
    
    // Validate object name (allow various formats for different object types)
    if (!objectName || objectName.length > 40) {
      return res.status(400).json({
        success: false,
        error: 'Invalid object name format',
      });
    }
    
    // Default to CLAS if no type specified
    const objectType = type || 'CLAS';
    
    console.log(`\n[ROUTE] ABAP Source Request - Object: ${objectName}, Type: ${objectType}`);
    console.log(`[ROUTE] Timestamp: ${new Date().toISOString()}`);
    
    writeToLog(`[ROUTE] Calling sapClient.getObjectSource for ${objectType}: ${objectName}`);
    
    const result = await sapClient.getObjectSource(objectName, objectType);
    
    writeToLog(`[ROUTE] Successfully retrieved source code for ${objectName}, length: ${result.sourceCode.length}`);
    writeToLog(`[ROUTE] Package: ${result.metadata.packageName}`);
    
    res.json({
      success: true,
      objectName,
      objectType,
      sourceCode: result.sourceCode,
      sourceLength: result.sourceCode.length,
      lines: result.sourceCode.split('\n').length,
      metadata: result.metadata,
    });
  } catch (error: any) {
    const errorDetails = `
[ROUTE] ========== ABAP SOURCE ROUTE ERROR ==========
[ROUTE] Object: ${req.params.objectName}
[ROUTE] Error Message: ${error.message}
[ROUTE] Error Stack: ${error.stack}
[ROUTE] Timestamp: ${new Date().toISOString()}
[ROUTE] ==============================================
`;
    console.error(errorDetails);
    writeToLog(errorDetails);
    
    res.status(500).json({
      success: false,
      error: error.message,
      note: 'ADT (ABAP Development Tools) may not be enabled on this SAP system',
    });
  }
});

// Get package objects (ABAP objects tree)
router.get('/package/:packageName/objects', async (req, res) => {
  try {
    const { packageName } = req.params;
    console.log(`\n[ROUTE] Package Objects Request - Package: ${packageName}`);
    
    writeToLog(`[ROUTE] Getting objects for package: ${packageName}`);
    
    const objects = await sapClient.getPackageObjects(packageName);
    
    writeToLog(`[ROUTE] Successfully retrieved ${objects.length} objects from package ${packageName}`);
    
    res.json({
      success: true,
      packageName,
      count: objects.length,
      objects,
    });
  } catch (error: any) {
    const errorDetails = `
[ROUTE] ==============================================
[ROUTE] Package Objects Request FAILED
[ROUTE] Package: ${req.params.packageName}
[ROUTE] Error Message: ${error.message}
[ROUTE] Error Stack: ${error.stack}
[ROUTE] Timestamp: ${new Date().toISOString()}
[ROUTE] ==============================================
`;
    console.error(errorDetails);
    writeToLog(errorDetails);
    
    res.status(500).json({
      success: false,
      error: error.message,
      note: 'ADT (ABAP Development Tools) may not be enabled on this SAP system',
    });
  }
});

export default router;
