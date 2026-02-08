import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { getReminderTriggeredHandler } from './handlers/reminder-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({
  name: 'chatbot',
  level: process.env.LOG_LEVEL ?? 'info',
});

const app = express();
const port = process.env.PORT ?? 3000;

app.use(express.json());

// Serve static files (Chat UI)
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoints (P5-T-021)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'chatbot', timestamp: new Date().toISOString() });
});

app.get('/ready', async (_req, res) => {
  const checks: Record<string, string> = {};
  try {
    const taskRes = await fetch(`${process.env.TASK_SERVICE_URL ?? 'http://localhost:3001'}/health`);
    checks.taskService = taskRes.ok ? 'ok' : 'unavailable';
  } catch {
    checks.taskService = 'unavailable';
  }
  const allOk = Object.values(checks).every(v => v === 'ok');
  res.status(allOk ? 200 : 503).json({ status: allOk ? 'ready' : 'degraded', service: 'chatbot', checks, timestamp: new Date().toISOString() });
});

// Initialize reminder triggered handler (P5-T-073)
const reminderHandler = getReminderTriggeredHandler();

// Start the event handler if enabled
const enableReminderHandler = process.env.ENABLE_REMINDER_HANDLER !== 'false';
if (enableReminderHandler) {
  reminderHandler.start().catch((error: unknown) => {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to start reminder handler');
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  void (async () => {
    if (enableReminderHandler) {
      await reminderHandler.stop();
    }
    process.exit(0);
  })();
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  void (async () => {
    if (enableReminderHandler) {
      await reminderHandler.stop();
    }
    process.exit(0);
  })();
});

app.listen(port, () => {
  logger.info({ port, reminderHandlerEnabled: enableReminderHandler }, 'Chatbot service started');
});

export { app };
