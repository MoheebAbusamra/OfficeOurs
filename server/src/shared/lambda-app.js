// Turns a service's Express routers into one AWS Lambda handler.
// Every service Lambda (scheduling, requests, queue) is built from this, so all of them behave the same as `npm run dev`:
// same routes, same validation, same { error } format, same CORS rules.
//
// API Gateway hands a Lambda a JSON event, not a real HTTP request. serverless-http translates it into an
// Express request, runs the routes, and turns the Express response back into the { statusCode, headers, body }
// object Lambda must return.
import express from 'express';
import cors from 'cors';
import serverless from 'serverless-http';
import { errorHandler, notFoundHandler } from './errors.js';

export function createLambdaHandler(...routers) {
  const app = express();

  // CLIENT_URL can list several frontends separated by commas (the S3 website and http://localhost:5173)
  const origins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((url) => url.trim());
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: '100kb' }));

  // Quick check that the Lambda is alive; AWS sets AWS_LAMBDA_FUNCTION_NAME to the function's name
  app.get('/api/v1/health', (req, res) => {
    res.json({ data: { status: 'ok', service: process.env.AWS_LAMBDA_FUNCTION_NAME || 'local' } });
  });

  for (const router of routers) app.use('/api/v1', router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return serverless(app);
}
