// AWS Lambda "officeours-queue-api":
// The queue service's whole API (queue, check-in, meetings) behind API Gateway. It runs exactly the same routes as local development.
// The queue-worker Lambda (lambda.js, fed by SQS) is unchanged.
// Deployed by scripts/floci-api.mjs.
import queueRoutes from './routes.js';
import { createLambdaHandler } from '../../shared/lambda-app.js';

export const handler = createLambdaHandler(queueRoutes);
