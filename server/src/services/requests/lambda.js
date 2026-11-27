// [S2] AWS Lambda "officeours-requests" (runs on Floci behind API Gateway): the whole S2 service
// (requests, FAQ, notifications, Gemini AI). It runs exactly the same routes as local development (npm run dev).
//
// API Gateway hands a Lambda a JSON event, not a real HTTP request. serverless-http translates it into an
// Express request, runs our routes, and turns the Express response back into the { statusCode, headers, body }
// object Lambda must return. floci-setup.js bundles this file (with everything it imports) into one zip.
import express from 'express';
import cors from 'cors';
import serverless from 'serverless-http';
import requestsRoutes from './routes.js';
import { errorHandler, notFoundHandler } from '../../shared/errors.js';

const app = express();

// CLIENT_URL can list several frontends separated by commas (the S3 website and http://localhost:5173)
const origins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((url) => url.trim());
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '100kb' }));

app.use('/api/v1', requestsRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export const handler = serverless(app);
