import { Router } from 'express';
import sapClient from '../services/sapClient';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { url, method = 'GET', params } = req.body;

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

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(Buffer.from(response.data));
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
