// Express entry point: loads env, middleware, mounts the 3 services under /api/v1, global error handler
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

app.get('/api/v1/health', (req, res) => res.json({ data: { status: 'ok' } }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
