// [S3, added by S2 (Moheeb) for the Floci deployment] AWS Lambda "officeours-queue-api":
// S3's whole API (queue, check-in, meetings) behind API Gateway. It runs exactly the same routes as local development.
// S3's own queue-worker Lambda (lambda.js, fed by SQS) is unchanged.
// Deployed by scripts/floci-api.mjs.
import queueRoutes from './routes.js';
import { createLambdaHandler } from '../../shared/lambda-app.js';

export const handler = createLambdaHandler(queueRoutes);
