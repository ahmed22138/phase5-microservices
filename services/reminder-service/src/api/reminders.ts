/**
 * Reminder Service API Endpoints
 * Implements REST API for reminder management
 * Reference: contracts/reminder-service.openapi.yaml
 */

import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Reminder, parseRelativeTime } from '../domain/reminder.js';
import { ReminderRepository } from '../persistence/reminder-repository.js';
import { getEventPublisher } from '../events/publisher.js';
import { EventTypes } from '../events/types.js';
import pino from 'pino';

const logger = pino({ name: 'reminder-api' });

const router = Router();
const reminderRepository = new ReminderRepository();
const eventPublisher = getEventPublisher();

// Middleware to extract user ID from headers
function getUserId(req: Request): string {
  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    throw new Error('Missing X-User-Id header');
  }
  return userId;
}

// Middleware to extract correlation ID
function getCorrelationId(req: Request): string {
  const correlationId = req.headers['x-correlation-id'];
  return typeof correlationId === 'string' ? correlationId : uuidv4();
}

/**
 * POST /reminders - Create a new reminder
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const correlationId = getCorrelationId(req);
    const { taskId, reminderTime, relativeTo } = req.body as {
      taskId: string;
      reminderTime: string; // ISO 8601 or relative like "1 hour before"
      relativeTo?: string; // Due date to calculate relative time from
    };

    if (!taskId) {
      res.status(400).json({ error: 'taskId is required' });
      return;
    }

    // Parse reminder time
    let parsedTime: Date;
    if (reminderTime.includes('before') && relativeTo) {
      // Relative time format
      parsedTime = parseRelativeTime(reminderTime, new Date(relativeTo));
    } else {
      // Absolute time format
      parsedTime = new Date(reminderTime);
    }

    if (isNaN(parsedTime.getTime())) {
      res.status(400).json({ error: 'Invalid reminder time format' });
      return;
    }

    const reminder = new Reminder({
      taskId,
      userId,
      reminderTime: parsedTime,
    });

    const createdReminder = await reminderRepository.create(reminder);

    // Emit reminder.created event
    await eventPublisher.publishReminderEvent(
      EventTypes.REMINDER_CREATED,
      createdReminder.id,
      userId,
      {
        reminderId: createdReminder.id,
        taskId,
        reminderTime: parsedTime.toISOString(),
      },
      { correlationId, metadata: { serviceName: 'reminder-service' } }
    );

    logger.info({ reminderId: createdReminder.id, taskId, userId, correlationId }, 'Reminder created');

    res.status(201).json({
      id: createdReminder.id,
      taskId: createdReminder.taskId,
      reminderTime: createdReminder.reminderTime.toISOString(),
      status: createdReminder.status,
      createdAt: createdReminder.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /reminders - List reminders for a user
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { taskId, pendingOnly } = req.query;

    let reminders: Reminder[];

    if (taskId) {
      reminders = await reminderRepository.findByTaskId(taskId as string, userId);
    } else if (pendingOnly === 'true') {
      reminders = await reminderRepository.findPendingByUser(userId);
    } else {
      reminders = await reminderRepository.findPendingByUser(userId);
    }

    res.json({
      reminders: reminders.map((r) => ({
        id: r.id,
        taskId: r.taskId,
        reminderTime: r.reminderTime.toISOString(),
        status: r.status,
        triggeredAt: r.triggeredAt?.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      total: reminders.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /reminders/:id - Get a reminder by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const reminder = await reminderRepository.findById(id, userId);
    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    res.json({
      id: reminder.id,
      taskId: reminder.taskId,
      reminderTime: reminder.reminderTime.toISOString(),
      status: reminder.status,
      triggeredAt: reminder.triggeredAt?.toISOString(),
      createdAt: reminder.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /reminders/:id - Delete a reminder
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const correlationId = getCorrelationId(req);
    const { id } = req.params;

    const reminder = await reminderRepository.findById(id, userId);
    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    await reminderRepository.delete(id, userId);

    // Emit reminder.deleted event
    await eventPublisher.publishReminderEvent(
      EventTypes.REMINDER_DELETED,
      id,
      userId,
      {
        reminderId: id,
        taskId: reminder.taskId,
      },
      { correlationId, metadata: { serviceName: 'reminder-service' } }
    );

    logger.info({ reminderId: id, taskId: reminder.taskId, userId, correlationId }, 'Reminder deleted');

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
