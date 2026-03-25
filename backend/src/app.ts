import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import servicesRoutes from './routes/services.routes';
import metadataRoutes from './routes/metadata.routes';
import testRoutes from './routes/test.routes';
import pdfRoutes from './routes/pdf.routes';
import errorHandler from './middleware/errorHandler';

const envLocalPath = path.join(__dirname, '../.env.local');
const envPath = path.join(__dirname, '../.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config({ path: envPath });
}

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const logFile = path.join(process.cwd(), 'server.log');

const writeToLog = (message: string) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(logFile, logEntry);
  } catch (err) {
    console.error('Failed to write to log file');
  }
};

writeToLog('=== SERVER STARTING ===');
writeToLog(`Port: ${PORT}`);

const corsOrigins = CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map(o => o.trim());

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests' },
});
app.use('/api/', limiter);

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/services', servicesRoutes);
app.use('/api/services', metadataRoutes);
app.use('/api/test', testRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api', servicesRoutes);

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 Catalog Service: /sap/opu/odata/IWFND/CATALOGSERVICE;v=2`);
  writeToLog('=== SERVER STARTED SUCCESSFULLY ===');
});

export default app;
