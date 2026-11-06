import { Router } from 'express';
import sapClient from '../services/sapClient';

const router = Router();

const SERVICE_NAME_REGEX = /^(\/)?[A-Za-z_][A-Za-z0-9_\/]*$/;

function validateServiceName(name: string): boolean {
  return name.length <= 30 && SERVICE_NAME_REGEX.test(name);
}

router.get('/', async (req, res, next) => {
  try {
    const { search, refresh } = req.query;
    const forceRefresh = refresh === 'true' || refresh === '1';
    const services = await sapClient.getServices(
      typeof search === 'string' ? search : undefined,
      forceRefresh
    );
    
    const formattedServices = services.map((service: any) => {
      // Use title/ExternalName if available, otherwise fall back to TechnicalServiceName
      const displayName = service.Title || service.ExternalName || service.Description || service.TechnicalServiceName;
      // Use Title (External Name) for API calls if available, otherwise fall back to TechnicalServiceName
      const apiName = service.Title || service.ExternalName || service.TechnicalServiceName;
      return {
        id: service.ID || service.ServiceId,
        name: apiName,  // Use Title/ExternalName for API calls
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

export default router;
