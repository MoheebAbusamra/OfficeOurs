// AWS Lambda "officeours-scheduling":
// The scheduling service's whole API (login + scheduling: auth, modules, instructors, slots, holidays, dashboard) behind API Gateway.
// It runs exactly the same routes as local development. The holidays Lambda (lambda.js) is unchanged.
// Deployed by scripts/floci-api.mjs.
import authRoutes from '../auth/routes.js';
import schedulingRoutes from './routes.js';
import { createLambdaHandler } from '../../shared/lambda-app.js';

export const handler = createLambdaHandler(authRoutes, schedulingRoutes);
