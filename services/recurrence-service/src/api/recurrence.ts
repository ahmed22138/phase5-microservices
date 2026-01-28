/**
 * Recurrence Service API Endpoints
 * Implements REST API for recurrence pattern management
 * Reference: contracts/recurrence-service.openapi.yaml
 * Task: P5-T-077
 */

import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  RecurrencePattern,
  RecurrenceFrequency,
  CreateRecurrencePatternInput,
} from '../domain/recurrence-pattern.js';
import { RecurrenceCalculator } from '../domain/recurrence-calculator.js';
import { RecurrenceRepository } from '../persistence/recurrence-repository.js';
import { getEventPublisher } from '../events/publisher.js';
import { EventTypes } from '../events/types.js';
import pino from 'pino';

const logger = pino({ name: 'recurrence-api' });

const router = Router();
const recurrenceRepository = new RecurrenceRepository();
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
 * POST /recurrence - Create a new recurrence pattern
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const correlationId = getCorrelationId(req);
    const { taskId, frequency, interval, daysOfWeek, dayOfMonth, startDate, endDate } = req.body as {
      taskId: string;
      frequency: RecurrenceFrequency;
      interval?: number;
      daysOfWeek?: number[];
      dayOfMonth?: number;
      startDate?: string;
      endDate?: string;
    };

    if (!taskId) {
      res.status(400).json({ error: 'taskId is required' });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!frequency) {
      res.status(400).json({ error: 'frequency is required (daily, weekly, monthly, yearly)' });
      return;
    }

    // Check if pattern already exists for this task
    const existing = await recurrenceRepository.findByTaskId(taskId, userId);
    if (existing) {
      res.status(409).json({ error: 'Recurrence pattern already exists for this task. Use PUT to update.' });
      return;
    }

    // Validate the recurrence input
    const validationResult = RecurrenceCalculator.validate({
      frequency,
      interval: interval ?? 1,
      daysOfWeek,
      dayOfMonth,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : undefined,
    });

    if (!validationResult.valid) {
      res.status(400).json({ error: 'Invalid recurrence pattern', details: validationResult.errors });
      return;
    }

    const input: CreateRecurrencePatternInput = {
      taskId,
      userId,
      frequency,
      interval,
      daysOfWeek,
      dayOfMonth,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    const pattern = new RecurrencePattern(input);
    const createdPattern = await recurrenceRepository.create(pattern);

    // Emit recurrence.created event
    await eventPublisher.publishRecurrenceEvent(
      EventTypes.RECURRENCE_CREATED,
      taskId,
      userId,
      {
        taskId,
        frequency,
        interval: interval ?? 1,
        daysOfWeek,
        dayOfMonth,
        startDate: createdPattern.startDate.toISOString(),
        endDate: createdPattern.endDate?.toISOString(),
      },
      { correlationId, metadata: { serviceName: 'recurrence-service' } }
    );

    logger.info({ patternId: createdPattern.id, taskId, userId, correlationId }, 'Recurrence pattern created');

    const description = RecurrenceCalculator.describe({
      frequency: createdPattern.frequency,
      interval: createdPattern.interval,
      daysOfWeek: createdPattern.daysOfWeek,
      dayOfMonth: createdPattern.dayOfMonth,
      startDate: createdPattern.startDate,
    });

    res.status(201).json({
      id: createdPattern.id,
      taskId: createdPattern.taskId,
      frequency: createdPattern.frequency,
      interval: createdPattern.interval,
      daysOfWeek: createdPattern.daysOfWeek,
      dayOfMonth: createdPattern.dayOfMonth,
      startDate: createdPattern.startDate.toISOString(),
      endDate: createdPattern.endDate?.toISOString(),
      nextRunAt: createdPattern.nextRunAt.toISOString(),
      status: createdPattern.status,
      description,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /recurrence/:taskId - Get recurrence pattern for a task
 */
router.get('/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { taskId } = req.params;

    const pattern = await recurrenceRepository.findByTaskId(taskId, userId);
    if (!pattern) {
      res.status(404).json({ error: 'Recurrence pattern not found for this task' });
      return;
    }

    const description = RecurrenceCalculator.describe({
      frequency: pattern.frequency,
      interval: pattern.interval,
      daysOfWeek: pattern.daysOfWeek,
      dayOfMonth: pattern.dayOfMonth,
      startDate: pattern.startDate,
    });

    res.json({
      id: pattern.id,
      taskId: pattern.taskId,
      frequency: pattern.frequency,
      interval: pattern.interval,
      daysOfWeek: pattern.daysOfWeek,
      dayOfMonth: pattern.dayOfMonth,
      startDate: pattern.startDate.toISOString(),
      endDate: pattern.endDate?.toISOString(),
      nextRunAt: pattern.nextRunAt.toISOString(),
      status: pattern.status,
      lastTriggeredAt: pattern.lastTriggeredAt?.toISOString(),
      description,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /recurrence - List all recurrence patterns for user
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { status } = req.query;

    const patterns = await recurrenceRepository.findByUser(
      userId,
      status as 'active' | 'paused' | 'completed' | undefined
    );

    res.json({
      patterns: patterns.map((pattern) => ({
        id: pattern.id,
        taskId: pattern.taskId,
        frequency: pattern.frequency,
        interval: pattern.interval,
        nextRunAt: pattern.nextRunAt.toISOString(),
        status: pattern.status,
        description: RecurrenceCalculator.describe({
          frequency: pattern.frequency,
          interval: pattern.interval,
          daysOfWeek: pattern.daysOfWeek,
          dayOfMonth: pattern.dayOfMonth,
          startDate: pattern.startDate,
        }),
      })),
      total: patterns.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /recurrence/:taskId - Update recurrence pattern
 */
router.put('/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const correlationId = getCorrelationId(req);
    const { taskId } = req.params;
    const { frequency, interval, daysOfWeek, dayOfMonth, endDate } = req.body as {
      frequency?: RecurrenceFrequency;
      interval?: number;
      daysOfWeek?: number[];
      dayOfMonth?: number;
      endDate?: string | null;
    };

    const pattern = await recurrenceRepository.findByTaskId(taskId, userId);
    if (!pattern) {
      // Create new pattern if it doesn't exist
      const input: CreateRecurrencePatternInput = {
        taskId,
        userId,
        frequency: frequency ?? 'daily',
        interval,
        daysOfWeek,
        dayOfMonth,
        endDate: endDate ? new Date(endDate) : undefined,
      };

      const newPattern = new RecurrencePattern(input);
      const createdPattern = await recurrenceRepository.create(newPattern);

      await eventPublisher.publishRecurrenceEvent(
        EventTypes.RECURRENCE_CREATED,
        taskId,
        userId,
        {
          taskId,
          frequency: createdPattern.frequency,
          interval: createdPattern.interval,
        },
        { correlationId, metadata: { serviceName: 'recurrence-service' } }
      );

      res.status(201).json({
        id: createdPattern.id,
        taskId: createdPattern.taskId,
        frequency: createdPattern.frequency,
        interval: createdPattern.interval,
        nextRunAt: createdPattern.nextRunAt.toISOString(),
        status: createdPattern.status,
      });
      return;
    }

    const previousPattern = pattern.toData();

    // Update pattern
    pattern.update({
      frequency,
      interval,
      daysOfWeek,
      dayOfMonth,
      endDate: endDate === null ? null : endDate ? new Date(endDate) : undefined,
    });

    const updatedPattern = await recurrenceRepository.update(pattern);

    // Emit recurrence.modified event
    await eventPublisher.publishRecurrenceEvent(
      EventTypes.RECURRENCE_MODIFIED,
      taskId,
      userId,
      {
        taskId,
        previousPattern: {
          frequency: previousPattern.frequency,
          interval: previousPattern.interval,
        },
        newPattern: {
          frequency: updatedPattern.frequency,
          interval: updatedPattern.interval,
        },
      },
      { correlationId, metadata: { serviceName: 'recurrence-service' } }
    );

    logger.info({ patternId: updatedPattern.id, taskId, userId, correlationId }, 'Recurrence pattern updated');

    const description = RecurrenceCalculator.describe({
      frequency: updatedPattern.frequency,
      interval: updatedPattern.interval,
      daysOfWeek: updatedPattern.daysOfWeek,
      dayOfMonth: updatedPattern.dayOfMonth,
      startDate: updatedPattern.startDate,
    });

    res.json({
      id: updatedPattern.id,
      taskId: updatedPattern.taskId,
      frequency: updatedPattern.frequency,
      interval: updatedPattern.interval,
      daysOfWeek: updatedPattern.daysOfWeek,
      dayOfMonth: updatedPattern.dayOfMonth,
      endDate: updatedPattern.endDate?.toISOString(),
      nextRunAt: updatedPattern.nextRunAt.toISOString(),
      status: updatedPattern.status,
      description,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /recurrence/:taskId - Delete recurrence pattern
 */
router.delete('/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const correlationId = getCorrelationId(req);
    const { taskId } = req.params;

    const deleted = await recurrenceRepository.deleteByTaskId(taskId, userId);
    if (!deleted) {
      res.status(404).json({ error: 'Recurrence pattern not found for this task' });
      return;
    }

    // Emit recurrence.stopped event
    await eventPublisher.publishRecurrenceEvent(
      EventTypes.RECURRENCE_STOPPED,
      taskId,
      userId,
      { taskId, reason: 'manual' },
      { correlationId, metadata: { serviceName: 'recurrence-service' } }
    );

    logger.info({ taskId, userId, correlationId }, 'Recurrence pattern deleted');

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /recurrence/:taskId/pause - Pause recurrence
 */
router.post('/:taskId/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const correlationId = getCorrelationId(req);
    const { taskId } = req.params;

    const pattern = await recurrenceRepository.findByTaskId(taskId, userId);
    if (!pattern) {
      res.status(404).json({ error: 'Recurrence pattern not found for this task' });
      return;
    }

    pattern.pause();
    const updatedPattern = await recurrenceRepository.update(pattern);

    // Emit recurrence.paused event
    await eventPublisher.publishRecurrenceEvent(
      EventTypes.RECURRENCE_PAUSED,
      taskId,
      userId,
      { taskId },
      { correlationId, metadata: { serviceName: 'recurrence-service' } }
    );

    logger.info({ patternId: pattern.id, taskId, userId, correlationId }, 'Recurrence pattern paused');

    res.json({
      id: updatedPattern.id,
      taskId: updatedPattern.taskId,
      status: updatedPattern.status,
      message: 'Recurrence paused',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /recurrence/:taskId/resume - Resume recurrence
 */
router.post('/:taskId/resume', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const correlationId = getCorrelationId(req);
    const { taskId } = req.params;

    const pattern = await recurrenceRepository.findByTaskId(taskId, userId);
    if (!pattern) {
      res.status(404).json({ error: 'Recurrence pattern not found for this task' });
      return;
    }

    pattern.resume();
    const updatedPattern = await recurrenceRepository.update(pattern);

    // Emit recurrence.resumed event
    await eventPublisher.publishRecurrenceEvent(
      EventTypes.RECURRENCE_RESUMED,
      taskId,
      userId,
      { taskId },
      { correlationId, metadata: { serviceName: 'recurrence-service' } }
    );

    logger.info({ patternId: pattern.id, taskId, userId, correlationId }, 'Recurrence pattern resumed');

    res.json({
      id: updatedPattern.id,
      taskId: updatedPattern.taskId,
      status: updatedPattern.status,
      nextRunAt: updatedPattern.nextRunAt.toISOString(),
      message: 'Recurrence resumed',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
