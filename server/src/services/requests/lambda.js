// AWS Lambda "officeours-requests" (runs on Floci behind API Gateway): the whole requests service
// (requests, FAQ, notifications, Gemini AI). It runs exactly the same routes as local development (npm run dev).
// floci-setup.js bundles this file (with everything it imports) into one zip.
import requestsRoutes from './routes.js';
import { createLambdaHandler } from '../../shared/lambda-app.js';

export const handler = createLambdaHandler(requestsRoutes);
