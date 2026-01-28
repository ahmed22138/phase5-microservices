/**
 * Task Service API Endpoints
 * Implements REST API for task management
 * Reference: contracts/task-service.openapi.yaml
 */

import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Task, TaskPriority, TaskStatus } from '../domain/task.js';
import { TaskRepository, TaskFilter, TaskSort } from '../persistence/task-repository.js';
import { TagRepository } from '../persistence/tag-repository.js';
import { TaskSearchService, SearchQuery } from '../persistence/task-search.js';
import { normalizeTagNames } from '../domain/tag.js';
import { getEventPublisher } from '../events/publisher.js';
import { EventTypes } from '../events/types.js';
import pino from 'pino';

const logger = pino({ name: 'task-api' });

const router = Router();
const taskRepository = new TaskRepository();
const tagRepository = new TagRepository();
const taskSearchService = new TaskSearchService();
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
 * POST /tasks/search - Search tasks with full-text query and filters
 */
router.post('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const correlationId = getCorrelationId(req);
    const { query, filters, sort, limit, offset } = req.body as {
      query?: string;
      filters?: {
        status?: TaskStatus | TaskStatus[];
        priority?: TaskPriority | TaskPriority[];
        tags?: string[];
        tagsMatchAll?: boolean;
        dueBefore?: string;
        dueAfter?: string;
        overdue?: boolean;
        isRecurring?: boolean;
      };
      sort?: {
        field: 'priority' | 'dueDate' | 'createdAt' | 'title' | 'relevance';
        direction: 'asc' | 'desc';
      };
      limit?: number;
      offset?: number;
    };

    const searchQuery: SearchQuery = {
      userId,
      query,
      filters: filters ? {
        ...filters,
        dueBefore: filters.dueBefore ? new Date(filters.dueBefore) : undefined,
        dueAfter: filters.dueAfter ? new Date(filters.dueAfter) : undefined,
      } : undefined,
      sort,
      pagination: {
        limit: limit ?? 50,
        offset: offset ?? 0,
      },
    };

    const result = await taskSearchService.search(searchQuery);

    // Get tags for each task
    const tasksWithTags = await Promise.all(
      result.tasks.map(async (task) => {
        const taskTags = await tagRepository.getTagsForTask(task.id, userId);
        return {
          ...task.toData(),
          tags: taskTags.map((t) => t.name),
        };
      })
    );

    // Emit search event for observability
    await eventPublisher.publishTaskEvent(
      'task.searched',
      'search',
      userId,
      {
        query,
        filters: filters ?? {},
        resultCount: result.total,
      },
      { correlationId, metadata: { serviceName: 'task-service' } }
    );

    logger.info({ query, resultCount: result.total, userId, correlationId }, 'Task search completed');

    res.json({
      tasks: tasksWithTags,
      total: result.total,
      query: result.query,
      filters: result.filters,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks - Create a new task
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const correlationId = getCorrelationId(req);
    const { title, description, priority, dueDate, tags } = req.body as {
      title: string;
      description?: string;
      priority?: TaskPriority;
      dueDate?: string;
      tags?: string[];
    };

    // Create task
    const task = new Task({
      userId,
      title,
      description,
      priority: priority ?? 'medium',
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });

    const createdTask = await taskRepository.create(task);

    // Handle tags if provided
    const taskTags: string[] = [];
    if (tags && tags.length > 0) {
      const normalizedTags = normalizeTagNames(tags);
      for (const tagName of normalizedTags) {
        const tag = await tagRepository.findOrCreate(tagName, userId);
        await tagRepository.addTagToTask(createdTask.id, tag.id);
        taskTags.push(tag.name);
      }
    }

    // Emit task.created event
    await eventPublisher.publishTaskEvent(
      EventTypes.TASK_CREATED,
      createdTask.id,
      userId,
      {
        title: createdTask.title,
        description: createdTask.description,
        priority: createdTask.priority,
        dueDate: createdTask.dueDate?.toISOString(),
        tags: taskTags,
        isRecurring: createdTask.isRecurring,
      },
      { correlationId, metadata: { serviceName: 'task-service' } }
    );

    logger.info({ taskId: createdTask.id, userId, correlationId }, 'Task created');

    res.status(201).json({
      ...createdTask.toData(),
      tags: taskTags,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks/:id - Get a task by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const task = await taskRepository.findById(id, userId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const tags = await tagRepository.getTagsForTask(id, userId);

    res.json({
      ...task.toData(),
      tags: tags.map((t) => t.name),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks - List tasks with filters
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const {
      status,
      priority,
      tags,
      tagsMatchAll,
      dueBefore,
      dueAfter,
      overdue,
      isRecurring,
      sortBy,
      sortOrder,
      limit,
      offset,
    } = req.query;

    const filter: TaskFilter = {
      userId,
      status: status as TaskStatus | undefined,
      priority: priority as TaskPriority | undefined,
      tags: tags ? (Array.isArray(tags) ? tags as string[] : [tags as string]) : undefined,
      tagsMatchAll: tagsMatchAll === 'true',
      dueBefore: dueBefore ? new Date(dueBefore as string) : undefined,
      dueAfter: dueAfter ? new Date(dueAfter as string) : undefined,
      overdue: overdue === 'true',
      isRecurring: isRecurring !== undefined ? isRecurring === 'true' : undefined,
    };

    const sort: TaskSort | undefined = sortBy
      ? {
          field: sortBy as 'priority' | 'dueDate' | 'createdAt' | 'title',
          direction: sortOrder ? (sortOrder as 'asc' | 'desc') : 'desc',
        }
      : undefined;

    const pagination = {
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    };

    const tasks = await taskRepository.findAll(filter, sort, pagination);
    const total = await taskRepository.count(filter);

    // Get tags for each task
    const tasksWithTags = await Promise.all(
      tasks.map(async (task) => {
        const taskTags = await tagRepository.getTagsForTask(task.id, userId);
        return {
          ...task.toData(),
          tags: taskTags.map((t) => t.name),
        };
      })
    );

    res.json({
      tasks: tasksWithTags,
      total,
      limit: pagination.limit,
      offset: pagination.offset,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /tasks/:id - Update a task
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const correlationId = getCorrelationId(req);
    const { id } = req.params;
    const { title, description, priority, status, dueDate, addTags, removeTags } = req.body as {
      title?: string;
      description?: string;
      priority?: TaskPriority;
      status?: TaskStatus;
      dueDate?: string | null;
      addTags?: string[];
      removeTags?: string[];
    };

    const task = await taskRepository.findById(id, userId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const events: { type: string; payload: Record<string, unknown> }[] = [];

    // Update fields
    if (title !== undefined) {
      task.updateTitle(title);
    }

    if (description !== undefined) {
      task.updateDescription(description);
    }

    if (priority !== undefined && priority !== task.priority) {
      const previousPriority = task.updatePriority(priority);
      events.push({
        type: EventTypes.TASK_PRIORITY_CHANGED,
        payload: {
          taskId: id,
          previousPriority,
          newPriority: priority,
        },
      });
    }

    if (dueDate !== undefined) {
      const previousDueDate = task.updateDueDate(dueDate ? new Date(dueDate) : null);
      events.push({
        type: EventTypes.TASK_DUE_DATE_SET,
        payload: {
          taskId: id,
          dueDate: dueDate,
          previousDueDate: previousDueDate?.toISOString(),
        },
      });
    }

    if (status !== undefined) {
      switch (status) {
        case 'in_progress':
          task.start();
          break;
        case 'completed':
          task.complete();
          events.push({
            type: EventTypes.TASK_COMPLETED,
            payload: {
              taskId: id,
              completedAt: task.completedAt?.toISOString(),
            },
          });
          break;
        case 'cancelled':
          task.cancel();
          break;
        case 'pending':
          task.reopen();
          break;
      }
    }

    // Handle tag additions
    if (addTags && addTags.length > 0) {
      const normalizedTags = normalizeTagNames(addTags);
      const addedTags: string[] = [];
      for (const tagName of normalizedTags) {
        const tag = await tagRepository.findOrCreate(tagName, userId);
        await tagRepository.addTagToTask(id, tag.id);
        addedTags.push(tag.name);
      }
      if (addedTags.length > 0) {
        events.push({
          type: EventTypes.TASK_TAGS_ADDED,
          payload: { taskId: id, addedTags },
        });
      }
    }

    // Handle tag removals
    if (removeTags && removeTags.length > 0) {
      const normalizedTags = normalizeTagNames(removeTags);
      const removedTags: string[] = [];
      for (const tagName of normalizedTags) {
        const tag = await tagRepository.findByName(tagName, userId);
        if (tag) {
          await tagRepository.removeTagFromTask(id, tag.id);
          removedTags.push(tag.name);
        }
      }
      if (removedTags.length > 0) {
        events.push({
          type: EventTypes.TASK_TAGS_REMOVED,
          payload: { taskId: id, removedTags },
        });
      }
    }

    // Save task
    const updatedTask = await taskRepository.update(task);

    // Publish events
    for (const event of events) {
      await eventPublisher.publishTaskEvent(
        event.type,
        id,
        userId,
        event.payload,
        { correlationId, metadata: { serviceName: 'task-service' } }
      );
    }

    // Also publish generic task.updated event
    await eventPublisher.publishTaskEvent(
      EventTypes.TASK_UPDATED,
      id,
      userId,
      { taskId: id, updatedFields: Object.keys(req.body as Record<string, unknown>) },
      { correlationId, metadata: { serviceName: 'task-service' } }
    );

    const tags = await tagRepository.getTagsForTask(id, userId);

    logger.info({ taskId: id, userId, correlationId, events: events.length }, 'Task updated');

    res.json({
      ...updatedTask.toData(),
      tags: tags.map((t) => t.name),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /tasks/:id - Delete a task
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const correlationId = getCorrelationId(req);
    const { id } = req.params;

    const deleted = await taskRepository.delete(id, userId);
    if (!deleted) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Emit task.deleted event
    await eventPublisher.publishTaskEvent(
      EventTypes.TASK_DELETED,
      id,
      userId,
      { taskId: id },
      { correlationId, metadata: { serviceName: 'task-service' } }
    );

    logger.info({ taskId: id, userId, correlationId }, 'Task deleted');

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
