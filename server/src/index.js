// Express entry point: loads env, middleware, mounts the 3 services under /api/v1, global error handler
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler, notFoundHandler } from './shared/errors.js';
import queueRoutes from './services/queue/routes.js';
import { startQueueConsumer } from './services/queue/consumer.js';
import authRoutes from './services/auth/routes.js';
import schedulingRoutes from './services/scheduling/routes.js';
import requestsRoutes from './services/requests/routes.js';

export const app = express();
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/v1/health', (req, res) => res.json({ data: { status: 'ok' } }));

// Scheduling & access
app.use('/api/v1', authRoutes);
app.use('/api/v1', schedulingRoutes);

// Requests, FAQ & notifications
app.use('/api/v1', requestsRoutes);

// queue, check-in, meetings
app.use('/api/v1', queueRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// Tests import { app } without starting the server or the SQS consumer.
// On Vercel (VERCEL=1) the app runs as a serverless function (api/index.js), so it does not listen on a port.
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
  startQueueConsumer();
}
