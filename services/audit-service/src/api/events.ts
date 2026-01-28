/**
 * Events API Endpoints
 * Provides query access to stored domain events
 * Reference: plan.md Observability
 * Task: P5-T-094
 */

import { Router, Request, Response, NextFunction } from 'express';
import { EventRepository, EventFilter, EventPagination } from '../persistence/event-repository.js';
import type { AggregateType } from '../domain/domain-event.js';
import pino from 'pino';

const logger = pino({ name: 'events-api' });

const router = Router();
const eventRepository = new EventRepository();

// Helper to wrap async route handlers
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction): void => {
  void fn(req, res, next);
};

/**
 * GET /events - Query events with filters
 */
router.get('/', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      eventType,
      eventTypes,
      aggregateType,
      aggregateId,
      userId,
      correlationId,
      fromTimestamp,
      toTimestamp,
      limit,
      offset,
    } = req.query;

    const filter: EventFilter = {};

    if (eventType) {
      filter.eventType = eventType as string;
    }

    if (eventTypes) {
      filter.eventTypes = Array.isArray(eventTypes)
        ? eventTypes as string[]
        : [eventTypes as string];
    }

    if (aggregateType) {
      filter.aggregateType = aggregateType as AggregateType;
    }

    if (aggregateId) {
      filter.aggregateId = aggregateId as string;
    }

    if (userId) {
      filter.userId = userId as string;
    }

    if (correlationId) {
      filter.correlationId = correlationId as string;
    }

    if (fromTimestamp) {
      filter.fromTimestamp = new Date(fromTimestamp as string);
    }

    if (toTimestamp) {
      filter.toTimestamp = new Date(toTimestamp as string);
    }

    const pagination: EventPagination = {
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    };

    const result = await eventRepository.query(filter, pagination);

    logger.info({
      filter,
      pagination,
      total: result.total,
      returned: result.events.length,
    }, 'Events queried');

    res.json({
      events: result.events.map((e) => e.toJSON()),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (error) {
    next(error);
  }
}));

/**
 * GET /events/recent - Get most recent events
 */
router.get('/recent', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit } = req.query;
    const maxLimit = limit ? Math.min(parseInt(limit as string, 10), 500) : 100;

    const events = await eventRepository.getRecent(maxLimit);

    res.json({
      events: events.map((e) => e.toJSON()),
      total: events.length,
    });
  } catch (error) {
    next(error);
  }
}));

/**
 * GET /events/:id - Get event by ID
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const event = await eventRepository.findById(id);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    res.json(event.toJSON());
  } catch (error) {
    next(error);
  }
}));

/**
 * GET /events/correlation/:correlationId - Get events by correlation ID (trace)
 */
router.get('/correlation/:correlationId', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { correlationId } = req.params;

    const events = await eventRepository.getByCorrelationId(correlationId);

    res.json({
      correlationId,
      events: events.map((e) => e.toJSON()),
      total: events.length,
    });
  } catch (error) {
    next(error);
  }
}));

/**
 * GET /events/aggregate/:type/:id - Get entity history
 */
router.get('/aggregate/:type/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, id } = req.params;
    const { limit, offset } = req.query;

    const aggregateType = type as AggregateType;
    if (!['task', 'reminder', 'recurrence'].includes(aggregateType)) {
      res.status(400).json({ error: 'Invalid aggregate type. Must be: task, reminder, or recurrence' });
      return;
    }

    const pagination: EventPagination = {
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    };

    const result = await eventRepository.getAggregateHistory(aggregateType, id, pagination);

    res.json({
      aggregateType,
      aggregateId: id,
      events: result.events.map((e) => e.toJSON()),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (error) {
    next(error);
  }
}));

/**
 * GET /events/stats - Get event statistics
 */
router.get('/stats/counts', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to, groupBy } = req.query;

    // Default to last 24 hours
    const toTimestamp = to ? new Date(to as string) : new Date();
    const fromTimestamp = from
      ? new Date(from as string)
      : new Date(toTimestamp.getTime() - 24 * 60 * 60 * 1000);

    const group = groupBy === 'day' ? 'day' : 'hour';

    const counts = await eventRepository.getEventCounts(fromTimestamp, toTimestamp, group);

    // Group by bucket for easier consumption
    const bucketMap = new Map<string, Record<string, number>>();
    for (const { bucket, eventType, count } of counts) {
      const bucketKey = bucket.toISOString();
      if (!bucketMap.has(bucketKey)) {
        bucketMap.set(bucketKey, {});
      }
      const bucketCounts = bucketMap.get(bucketKey);
      if (bucketCounts) {
        bucketCounts[eventType] = count;
      }
    }

    const buckets = Array.from(bucketMap.entries()).map(([timestamp, eventCounts]) => ({
      timestamp,
      counts: eventCounts,
      total: Object.values(eventCounts).reduce((sum, c) => sum + c, 0),
    }));

    res.json({
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
      groupBy: group,
      buckets,
    });
  } catch (error) {
    next(error);
  }
}));

export default router;
