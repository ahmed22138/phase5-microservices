import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import pino from 'pino';
import tasksRouter from './api/tasks';
import tagsRouter from './api/tags';

const logger = pino({
  name: 'task-service',
  level: process.env.LOG_LEVEL ?? 'info',
});

const app = express();
const port = process.env.PORT ?? 3001;

// Enable CORS for Chat UI
app.use(cors());
app.use(express.json());

// Health check endpoints (P5-T-022)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'task-service', timestamp: new Date().toISOString() });
});

app.get('/ready', async (_req, res) => {
  try {
    const pg = await import('pg');
    const pool = new pg.default.Pool({ host: process.env.DB_HOST ?? 'localhost', port: parseInt(process.env.DB_PORT ?? '5432'), database: process.env.DB_NAME ?? 'task_db', user: process.env.DB_USER ?? 'task_user', password: process.env.DB_PASSWORD ?? 'task_password' });
    await pool.query('SELECT 1');
    await pool.end();
    res.json({ status: 'ready', service: 'task-service', database: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'not_ready', service: 'task-service', database: 'unavailable', timestamp: new Date().toISOString() });
  }
});

// API routes
app.use('/tasks', tasksRouter);
app.use('/tags', tagsRouter);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error: err.message, stack: err.stack }, 'Request error');
  res.status(500).json({ error: err.message });
});

app.listen(port, () => {
  logger.info({ port }, 'Task service started');
});

export { app };
