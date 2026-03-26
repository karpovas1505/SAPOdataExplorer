import { Router } from 'express';
import sapClient from '../services/sapClient';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { url, method = 'GET', params } = req.body;

    console.log(`\n=== PDF TEST REQUEST (RAW) ===`);
    console.log(`Body:`, JSON.stringify(req.body));
    console.log(`========================\n`);

    if (!url) {
      res.status(400).json({
        success: false,
        error: 'URL is required',
      });
      return;
    }

    let fullUrl: string;
    if (url.startsWith('http')) {
      fullUrl = url;
    } else if (url.startsWith('/sap/')) {
      fullUrl = url;
    } else {
      fullUrl = `/sap/opu/odata/sap${url}`;
    }

    console.log(`\n=== PDF TEST REQUEST ===`);
    console.log(`Method: ${method}`);
    console.log(`URL: ${fullUrl}`);
    console.log(`Params: ${JSON.stringify(params)}`);
    console.log(`========================\n`);

    const response = await sapClient.executeRawRequest(method, fullUrl, undefined, {
      responseType: 'arraybuffer',
      params,
    });

    const contentType = response.headers['content-type'] || 'application/pdf';
    const filename = response.headers['content-disposition']?.match(/filename="?([^";]+)"?/)?.[1] || 'output.pdf';

    console.log(`\n=== PDF RESPONSE HEADERS ===`);
    console.log(`Content-Type: ${contentType}`);
    console.log(`Content-Disposition: inline; filename="${filename}"`);
    console.log(`Content-Length: ${response.data.length}`);
    console.log(`============================\n`);

    // Send as base64 to avoid CORS issues with blob URLs
    const base64Data = Buffer.from(response.data).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64Data}`;
    
    res.json({
      success: true,
      dataUrl,
      filename,
      contentType,
      size: response.data.length,
    });
  } catch (error: any) {
    console.error(`\n=== PDF TEST REQUEST ERROR ===`);
    console.error(`Error:`, error.message);
    console.error(`Response Status:`, error.response?.status);
    console.error(`================================\n`);
    
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data?.toString?.() || error.response?.data,
      status: error.response?.status,
    });
  }
});

export default router;
