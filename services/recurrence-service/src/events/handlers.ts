/**
 * Event Handlers for Recurrence Service
 * Handles task.completed events to trigger next recurrence
 * Reference: spec.md FR-019
 * Task: P5-T-079
 */

import { DaprClient, DaprServer, CommunicationProtocolEnum, HttpMethod } from '@dapr/dapr';
import { RecurrenceRepository } from '../persistence/recurrence-repository';
import { getEventPublisher } from './publisher';
import { EventTypes, SubscribedTopics } from './types';
import type { RecurrencePattern } from '../domain/recurrence-pattern';
import pino from 'pino';

const logger = pino({ name: 'recurrence-event-handlers' });

export interface TaskCompletedEvent {
  eventType: string;
  aggregateId: string;
  userId: string;
  correlationId: string;
  payload: {
    taskId: string;
    completedAt: string;
  };
}

export interface TaskDeletedEvent {
  eventType: string;
  aggregateId: string;
  userId: string;
  correlationId: string;
  payload: {
    taskId: string;
  };
}

interface TaskData {
  id: string;
  title: string;
  description?: string;
  priority: string;
  dueDate?: string;
  tags?: string[];
}

export class RecurrenceEventHandlers {
  private readonly recurrenceRepository: RecurrenceRepository;
  private readonly daprClient: DaprClient;
  private readonly daprServer: DaprServer;
  private readonly eventPublisher = getEventPublisher();
  private readonly pubsubName: string;

  constructor(recurrenceRepository?: RecurrenceRepository) {
    this.recurrenceRepository = recurrenceRepository ?? new RecurrenceRepository();

    this.daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });

    this.daprServer = new DaprServer({
      serverHost: process.env.SERVER_HOST ?? '127.0.0.1',
      serverPort: process.env.DAPR_APP_PORT ?? '3013', // Different port for Dapr subscriptions
      communicationProtocol: CommunicationProtocolEnum.HTTP,
      clientOptions: {
        daprHost: process.env.DAPR_HOST ?? 'localhost',
        daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
      },
    });

    this.pubsubName = process.env.PUBSUB_NAME ?? 'pubsub';
  }

  /**
   * Start listening for task events
   */
  async start(): Promise<void> {
    logger.info('Starting recurrence event handlers');

    // Subscribe to task.events topic
    await this.daprServer.pubsub.subscribe(
      this.pubsubName,
      SubscribedTopics.TASK_EVENTS,
      async (event: TaskCompletedEvent | TaskDeletedEvent) => {
        if (event.eventType === 'task.completed') {
          await this.handleTaskCompleted(event as TaskCompletedEvent);
        } else if (event.eventType === 'task.deleted') {
          await this.handleTaskDeleted(event as TaskDeletedEvent);
        }
      }
    );

    await this.daprServer.start();
    logger.info({ pubsub: this.pubsubName, topic: SubscribedTopics.TASK_EVENTS }, 'Recurrence event handlers started');
  }

  /**
   * Stop the event handlers
   */
  async stop(): Promise<void> {
    logger.info('Stopping recurrence event handlers');
    await this.daprServer.stop();
  }

  /**
   * Handle task.completed event - generate next occurrence for recurring tasks
   */
  async handleTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    const { taskId, completedAt } = event.payload;
    const userId = event.userId;
    const correlationId = event.correlationId;

    logger.info({ taskId, userId, correlationId, completedAt }, 'Handling task.completed event');

    try {
      // Check if this task has a recurrence pattern
      const pattern = await this.recurrenceRepository.findByTaskId(taskId, userId);

      if (!pattern) {
        logger.debug({ taskId, correlationId }, 'No recurrence pattern found for completed task');
        return;
      }

      if (pattern.status !== 'active') {
        logger.debug({ taskId, patternStatus: pattern.status, correlationId }, 'Recurrence pattern not active');
        return;
      }

      // Fetch the completed task to use as template for next occurrence
      const completedTask = await this.fetchTask(taskId, userId);
      if (!completedTask) {
        logger.warn({ taskId, correlationId }, 'Could not fetch completed task details');
        return;
      }

      // Generate next occurrence
      await this.generateNextOccurrence(pattern, completedTask, userId, correlationId);
    } catch (error) {
      logger.error({ error, taskId, correlationId }, 'Failed to handle task.completed event');
      // Don't throw - we don't want to nack the message
    }
  }

  /**
   * Handle task.deleted event - optionally remove recurrence pattern
   */
  async handleTaskDeleted(event: TaskDeletedEvent): Promise<void> {
    const { taskId } = event.payload;
    const userId = event.userId;
    const correlationId = event.correlationId;

    logger.info({ taskId, userId, correlationId }, 'Handling task.deleted event');

    try {
      const pattern = await this.recurrenceRepository.findByTaskId(taskId, userId);

      if (pattern) {
        // Delete the recurrence pattern when the parent task is deleted
        await this.recurrenceRepository.deleteByTaskId(taskId, userId);

        await this.eventPublisher.publishRecurrenceEvent(
          EventTypes.RECURRENCE_STOPPED,
          taskId,
          userId,
          { taskId, reason: 'manual' },
          { correlationId, metadata: { serviceName: 'recurrence-service', trigger: 'task.deleted' } }
        );

        logger.info({ taskId, patternId: pattern.id, correlationId }, 'Deleted recurrence pattern for deleted task');
      }
    } catch (error) {
      logger.error({ error, taskId, correlationId }, 'Failed to handle task.deleted event');
    }
  }

  /**
   * Generate the next occurrence of a recurring task
   */
  private async generateNextOccurrence(
    pattern: RecurrencePattern,
    templateTask: TaskData,
    userId: string,
    correlationId: string
  ): Promise<void> {
    // Trigger the pattern to calculate next run
    const triggerResult = pattern.trigger();

    if (triggerResult.isCompleted) {
      // Recurrence has ended
      await this.recurrenceRepository.updateStatus(pattern.id, 'completed');

      await this.eventPublisher.publishRecurrenceEvent(
        EventTypes.RECURRENCE_STOPPED,
        pattern.taskId,
        userId,
        { taskId: pattern.taskId, reason: 'end_date_reached' },
        { correlationId, metadata: { serviceName: 'recurrence-service' } }
      );

      logger.info({
        patternId: pattern.id,
        taskId: pattern.taskId,
        correlationId,
      }, 'Recurrence completed - end date reached');
      return;
    }

    // Create new task instance
    const newTask = await this.createTaskInstance(templateTask, pattern, userId, correlationId);

    if (newTask) {
      // Update pattern with next run time
      await this.recurrenceRepository.updateNextRun(
        pattern.id,
        triggerResult.nextRunAt!,
        pattern.lastTriggeredAt!
      );

      // Emit recurrence.triggered event
      await this.eventPublisher.publishRecurrenceEvent(
        EventTypes.RECURRENCE_TRIGGERED,
        pattern.taskId,
        userId,
        {
          originalTaskId: pattern.taskId,
          newTaskId: newTask.id,
          triggeredAt: new Date().toISOString(),
          nextRunAt: triggerResult.nextRunAt?.toISOString(),
        },
        { correlationId, metadata: { serviceName: 'recurrence-service' } }
      );

      logger.info({
        patternId: pattern.id,
        originalTaskId: pattern.taskId,
        newTaskId: newTask.id,
        nextRunAt: triggerResult.nextRunAt?.toISOString(),
        correlationId,
      }, 'Created next occurrence of recurring task');
    }
  }

  /**
   * Fetch task details from task-service
   */
  private async fetchTask(taskId: string, userId: string): Promise<TaskData | null> {
    try {
      const response = await this.daprClient.invoker.invoke(
        'task-service',
        `tasks/${taskId}`,
        HttpMethod.GET,
        undefined,
        {
          headers: {
            'X-User-Id': userId,
          },
        }
      );

      return response as TaskData;
    } catch (error) {
      logger.error({ error, taskId, userId }, 'Failed to fetch task');
      return null;
    }
  }

  /**
   * Create a new task instance based on the template
   */
  private async createTaskInstance(
    templateTask: TaskData,
    pattern: RecurrencePattern,
    userId: string,
    correlationId: string
  ): Promise<TaskData | null> {
    try {
      // Calculate the new due date based on the pattern's next run
      const newDueDate = pattern.nextRunAt;

      const newTaskData = {
        title: templateTask.title,
        description: templateTask.description,
        priority: templateTask.priority,
        dueDate: newDueDate.toISOString(),
        tags: templateTask.tags,
      };

      const response = await this.daprClient.invoker.invoke(
        'task-service',
        'tasks',
        HttpMethod.POST,
        newTaskData,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
            'X-Correlation-Id': correlationId,
          },
        }
      );

      return response as TaskData;
    } catch (error) {
      logger.error({
        error,
        templateTaskId: templateTask.id,
        patternId: pattern.id,
        correlationId,
      }, 'Failed to create task instance');
      return null;
    }
  }
}

// Singleton instance
let handlersInstance: RecurrenceEventHandlers | null = null;

export function getRecurrenceEventHandlers(): RecurrenceEventHandlers {
  handlersInstance ??= new RecurrenceEventHandlers();
  return handlersInstance;
}
