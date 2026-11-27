// [S1, added by S2 (Moheeb) for the Floci deployment] AWS Lambda "officeours-scheduling":
// S1's whole API (login + scheduling: auth, modules, instructors, slots, holidays, dashboard) behind API Gateway.
// It runs exactly the same routes as local development. S1's own holidays Lambda (lambda.js) is unchanged.
// Deployed by scripts/floci-api.mjs.
import authRoutes from '../auth/routes.js';
import schedulingRoutes from './routes.js';
import { createLambdaHandler } from '../../shared/lambda-app.js';

export const handler = createLambdaHandler(authRoutes, schedulingRoutes);
