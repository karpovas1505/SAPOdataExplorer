import { Router } from 'express';
import sapClient from '../services/sapClient';

const router = Router();

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const MAX_URL_LENGTH = 2048;
const DANGEROUS_PATTERNS = [/\.\./, /\/\//, /\0/];

function validateTestRequest(method: string, url: string): string | null {
  if (!ALLOWED_METHODS.includes(method.toUpperCase())) {
    return `Invalid method: ${method}`;
  }
  if (!url || typeof url !== 'string') {
    return 'URL is required';
  }
  if (url.length > MAX_URL_LENGTH) {
    return 'URL too long';
  }
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(url)) {
      return 'Invalid URL format';
    }
  }
  return null;
}

router.post('/', async (req, res, next) => {
  try {
    const { method, url, body } = req.body;

    if (!method || !url) {
      res.status(400).json({
        success: false,
        error: 'Method and URL are required',
      });
      return;
    }

    const validationError = validateTestRequest(method, url);
    if (validationError) {
      res.status(400).json({
        success: false,
        error: validationError,
      });
      return;
    }

    let fullUrl: string;
    if (url.startsWith('http')) {
      fullUrl = url;
    } else if (url.startsWith('/sap/opu/odata/')) {
      // Fix any issues with IWFND/IWBEP paths - handle double slashes and wrong prefixes
      let fixedUrl = url;
      
      // Fix double slash after /sap/
      fixedUrl = fixedUrl.replace('/sap//', '/sap/');
      
      // Fix /sap/opu/odata/sap/IWFND/ or /sap/opu/odata/sap//IWFND/ pattern
      if (fixedUrl.includes('/sap/opu/odata/sap/IWFND/') || fixedUrl.includes('/sap/opu/odata/sap/IWBEP/')) {
        // Extract the entity and path after IWFND/ or IWBEP/
        const iwfndMatch = fixedUrl.match(/\/sap\/opu\/odata\/sap\/?.*?(IWFND\/[^\/]+)\/(.+)$/);
        if (iwfndMatch) {
          const entityPart = iwfndMatch[2]; // e.g., "SG_MED_CATALOG/Vocabularies"
          fixedUrl = `/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/${entityPart}`;
        }
      }
      
      fullUrl = fixedUrl;
    } else if (url.startsWith('/IWFND/') || url.startsWith('/SAP/')) {
      // Remove /IWFND/ or /SAP/ prefix and use CATALOGSERVICE
      const entityPath = url.replace(/^\/IWFND\//, '').replace(/^\/SAP\//, '');
      fullUrl = `/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/${entityPath}`;
    } else {
      fullUrl = `/sap/opu/odata/sap${url}`;
    }
    console.log(`\n=== TEST REQUEST ===`);
    console.log(`Method: ${method}`);
    console.log(`URL: ${fullUrl}`);
    console.log(`==================\n`);
    
    const result = await sapClient.executeRequest(method, fullUrl, body);

    res.json({
      success: true,
      method,
      url: fullUrl,
      response: result,
    });
  } catch (error: any) {
    console.error(`\n=== TEST REQUEST ERROR ===`);
    console.error(`Error:`, error.message);
    console.error(`Response Status:`, error.response?.status);
    console.error(`========================\n`);
    
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data,
      status: error.response?.status,
    });
  }
});

export default router;
