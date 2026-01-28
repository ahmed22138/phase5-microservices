import express, { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import eventsRouter from './api/events';
import { getEventConsumer } from './consumers/event-consumer';

const logger = pino({
  name: 'audit-service',
  level: process.env.LOG_LEVEL ?? 'info',
});

const app = express();
const port = process.env.PORT ?? 3004;

app.use(express.json());

// Health check endpoints (P5-T-025)
app.get('/health', (_req, res) => {
  const consumer = getEventConsumer();
  const stats = consumer.getStats();

  res.json({
    status: 'ok',
    service: 'audit-service',
    timestamp: new Date().toISOString(),
    consumer: {
      running: stats.isRunning,
      eventsProcessed: stats.eventCount,
      errors: stats.errorCount,
    },
  });
});

app.get('/ready', (_req, res) => {
  const consumer = getEventConsumer();
  const stats = consumer.getStats();

  // Ready if consumer is running
  const isReady = stats.isRunning;

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not_ready',
    service: 'audit-service',
    timestamp: new Date().toISOString(),
    consumer: {
      running: stats.isRunning,
    },
  });
});

// API routes
app.use('/events', eventsRouter);

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// Start event consumer
const eventConsumer = getEventConsumer();
const enableConsumer = process.env.ENABLE_CONSUMER !== 'false';

if (enableConsumer) {
  eventConsumer.start().catch((error: unknown) => {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to start event consumer');
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  void (async () => {
    if (enableConsumer) {
      await eventConsumer.stop();
    }
    process.exit(0);
  })();
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  void (async () => {
    if (enableConsumer) {
      await eventConsumer.stop();
    }
    process.exit(0);
  })();
});

app.listen(port, () => {
  logger.info({
    port,
    consumerEnabled: enableConsumer,
  }, 'Audit service started');
});

export { app };
