// Express entry point: loads env, middleware, mounts the 3 services under /api/v1, global error handler
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler, notFoundHandler } from './shared/errors.js';
import queueRoutes from './services/queue/routes.js';
import { startQueueConsumer } from './services/queue/consumer.js';

export const app = express();
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/v1/health', (req, res) => res.json({ data: { status: 'ok' } }));

// One router per service. S1 and S2 add theirs here when their routes.js exports a router.
app.use('/api/v1', queueRoutes); // [S3] queue, check-in, meetings

app.use(notFoundHandler);
app.use(errorHandler);

// Tests import { app } without starting the server or the SQS consumer
if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
  startQueueConsumer();
}
