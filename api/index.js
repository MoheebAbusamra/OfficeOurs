// Vercel entry point: the whole Express API (server/src/index.js) as one Vercel Function.
// vercel.json sends every /api/... request here; the app's own routes (/api/v1/...) take it from there.
import { app } from '../server/src/index.js';

export default app;
