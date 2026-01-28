import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import pino from 'pino';
import recurrenceRouter from './api/recurrence';
import { getRecurrenceScheduler } from './scheduler/recurrence-scheduler';
import { getRecurrenceEventHandlers } from './events/handlers';

const logger = pino({
  name: 'recurrence-service',
  level: process.env.LOG_LEVEL ?? 'info',
});

const app = express();
const port = process.env.PORT ?? 3003;

// Enable CORS for Chat UI
app.use(cors());
app.use(express.json());

// Health check endpoints (P5-T-024)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'recurrence-service', timestamp: new Date().toISOString() });
});

app.get('/ready', (_req, res) => {
  // TODO: Add database connectivity check
  res.json({ status: 'ready', service: 'recurrence-service', timestamp: new Date().toISOString() });
});

// API routes
app.use('/recurrence', recurrenceRouter);

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');

  if (err.message === 'Missing X-User-Id header') {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
});

// Start the scheduler (P5-T-078)
const scheduler = getRecurrenceScheduler();
const schedulerInterval = parseInt(process.env.SCHEDULER_INTERVAL_MS ?? '60000', 10);
const enableScheduler = process.env.ENABLE_SCHEDULER !== 'false';

if (enableScheduler) {
  scheduler.start(schedulerInterval);
}

// Start event handlers (P5-T-079)
const eventHandlers = getRecurrenceEventHandlers();
const enableEventHandlers = process.env.ENABLE_EVENT_HANDLERS !== 'false';

if (enableEventHandlers) {
  eventHandlers.start().catch((error: unknown) => {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to start event handlers');
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  scheduler.stop();
  if (enableEventHandlers) {
    await eventHandlers.stop();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  scheduler.stop();
  if (enableEventHandlers) {
    await eventHandlers.stop();
  }
  process.exit(0);
});

app.listen(port, () => {
  logger.info({
    port,
    schedulerEnabled: enableScheduler,
    schedulerInterval,
    eventHandlersEnabled: enableEventHandlers,
  }, 'Recurrence service started');
});

export { app };
