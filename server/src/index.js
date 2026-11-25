// Express entry point: loads env, middleware, mounts the 3 services under /api/v1, global error handler
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './shared/errors.js';
import authRoutes from './services/auth/routes.js';
import schedulingRoutes from './services/scheduling/routes.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

app.get('/api/v1/health', (req, res) => res.json({ data: { status: 'ok' } }));

// S1 Scheduling & Access
app.use('/api/v1', authRoutes);
app.use('/api/v1', schedulingRoutes);
// S2 and S3 mount their routers here the same way

// Unknown URL -> 404 in the standard error format (must stay after all routers)
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}`, details: [] } });
});

// Every error ends here (must be the very last app.use)
app.use(errorHandler);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
