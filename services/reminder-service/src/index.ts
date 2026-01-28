import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import pino from 'pino';
import remindersRouter from './api/reminders';
import { getReminderScheduler } from './scheduler/reminder-scheduler';

const logger = pino({
  name: 'reminder-service',
  level: process.env.LOG_LEVEL ?? 'info',
});

const app = express();
const port = process.env.PORT ?? 3002;

// Enable CORS for Chat UI
app.use(cors());
app.use(express.json());

// Health check endpoints (P5-T-023)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'reminder-service', timestamp: new Date().toISOString() });
});

app.get('/ready', (_req, res) => {
  // TODO: Add database connectivity check
  res.json({ status: 'ready', service: 'reminder-service', timestamp: new Date().toISOString() });
});

// API routes
app.use('/reminders', remindersRouter);

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');

  if (err.message === 'Missing X-User-Id header') {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
});

// Start the scheduler
const scheduler = getReminderScheduler();
const schedulerInterval = parseInt(process.env.SCHEDULER_INTERVAL_MS ?? '30000', 10);
scheduler.start(schedulerInterval);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  scheduler.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  scheduler.stop();
  process.exit(0);
});

app.listen(port, () => {
  logger.info({ port, schedulerInterval }, 'Reminder service started');
});

export { app };
