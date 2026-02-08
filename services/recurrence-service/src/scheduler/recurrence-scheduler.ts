/**
 * Recurrence Scheduler
 * Polls for due recurrence patterns and generates new task instances
 * Reference: spec.md FR-019
 * Task: P5-T-078
 */

import { DaprClient, HttpMethod } from '@dapr/dapr';
import { RecurrenceRepository } from '../persistence/recurrence-repository.js';
import { getEventPublisher } from '../events/publisher.js';
import { EventTypes } from '../events/types.js';
import type { RecurrencePattern } from '../domain/recurrence-pattern.js';
import pino from 'pino';

const logger = pino({ name: 'recurrence-scheduler' });

interface TaskData {
  id: string;
  title: string;
  description?: string;
  priority: string;
  dueDate?: string;
  tags?: string[];
}

export class RecurrenceScheduler {
  private readonly recurrenceRepository: RecurrenceRepository;
  private readonly daprClient: DaprClient;
  private readonly eventPublisher = getEventPublisher();
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(recurrenceRepository?: RecurrenceRepository) {
    this.recurrenceRepository = recurrenceRepository ?? new RecurrenceRepository();
    this.daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });
  }

  /**
   * Start the scheduler
   * @param intervalMs - Polling interval in milliseconds (default: 60 seconds)
   */
  start(intervalMs = 60000): void {
    if (this.intervalId) {
      logger.warn('Scheduler already running');
      return;
    }

    logger.info({ intervalMs }, 'Starting recurrence scheduler');

    // Run immediately on start
    void this.processRecurrences();

    // Then run on interval
    this.intervalId = setInterval(() => {
      void this.processRecurrences();
    }, intervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Recurrence scheduler stopped');
    }
  }

  /**
   * Process recurrences triggered via Dapr cron binding
   * Called from the /cron-recurrence endpoint
   */
  async processViaBinding(): Promise<void> {
    logger.info('Processing recurrences via Dapr cron binding');
    await this.processRecurrences();
  }

  /**
   * Process due recurrence patterns
   */
  private async processRecurrences(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Skipping recurrence processing - previous run still in progress');
      return;
    }

    this.isRunning = true;

    try {
      const duePatterns = await this.recurrenceRepository.findDuePatterns(100);

      if (duePatterns.length === 0) {
        logger.debug('No due recurrence patterns found');
        return;
      }

      logger.info({ count: duePatterns.length }, 'Processing due recurrence patterns');

      for (const pattern of duePatterns) {
        try {
          await this.processPattern(pattern);
        } catch (error) {
          logger.error({
            error,
            patternId: pattern.id,
            taskId: pattern.taskId,
          }, 'Failed to process recurrence pattern');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error processing recurrences');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process a single recurrence pattern
   */
  private async processPattern(pattern: RecurrencePattern): Promise<void> {
    const originalTaskId = pattern.taskId;
    const userId = pattern.userId;

    logger.info({
      patternId: pattern.id,
      taskId: originalTaskId,
      userId,
    }, 'Processing recurrence pattern');

    // Fetch the original task to create a new instance
    const originalTask = await this.fetchTask(originalTaskId, userId);
    if (!originalTask) {
      logger.warn({
        patternId: pattern.id,
        taskId: originalTaskId,
      }, 'Original task not found, skipping recurrence');
      return;
    }

    // Create new task instance
    const newTask = await this.createTaskInstance(originalTask, pattern, userId);
    if (!newTask) {
      logger.error({
        patternId: pattern.id,
        taskId: originalTaskId,
      }, 'Failed to create new task instance');
      return;
    }

    // Update the pattern with next run time
    const triggerResult = pattern.trigger();

    if (triggerResult.isCompleted) {
      // Recurrence has ended
      await this.recurrenceRepository.updateStatus(pattern.id, 'completed');

      await this.eventPublisher.publishRecurrenceEvent(
        EventTypes.RECURRENCE_STOPPED,
        originalTaskId,
        userId,
        { taskId: originalTaskId, reason: 'end_date_reached' },
        { metadata: { serviceName: 'recurrence-scheduler' } }
      );

      logger.info({
        patternId: pattern.id,
        taskId: originalTaskId,
      }, 'Recurrence completed - end date reached');
    } else {
      // Update next run time
      await this.recurrenceRepository.updateNextRun(
        pattern.id,
        triggerResult.nextRunAt!,
        pattern.lastTriggeredAt!
      );
    }

    // Emit recurrence.triggered event
    await this.eventPublisher.publishRecurrenceEvent(
      EventTypes.RECURRENCE_TRIGGERED,
      originalTaskId,
      userId,
      {
        originalTaskId,
        newTaskId: newTask.id,
        triggeredAt: new Date().toISOString(),
        nextRunAt: triggerResult.nextRunAt?.toISOString(),
      },
      { metadata: { serviceName: 'recurrence-scheduler' } }
    );

    logger.info({
      patternId: pattern.id,
      originalTaskId,
      newTaskId: newTask.id,
      nextRunAt: triggerResult.nextRunAt?.toISOString(),
    }, 'Recurrence triggered - new task created');
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
   * Create a new task instance based on the original task
   */
  private async createTaskInstance(
    originalTask: TaskData,
    pattern: RecurrencePattern,
    userId: string
  ): Promise<TaskData | null> {
    try {
      // Calculate the new due date based on the recurrence pattern
      const newDueDate = pattern.nextRunAt;

      const newTaskData = {
        title: originalTask.title,
        description: originalTask.description,
        priority: originalTask.priority,
        dueDate: newDueDate.toISOString(),
        tags: originalTask.tags,
        // Note: We don't copy the recurrence to the new instance
        // The recurrence is managed by the pattern, not individual tasks
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
            'X-Correlation-Id': `recurrence-${pattern.id}`,
          },
        }
      );

      return response as TaskData;
    } catch (error) {
      logger.error({
        error,
        originalTaskId: originalTask.id,
        patternId: pattern.id,
      }, 'Failed to create task instance');
      return null;
    }
  }

  /**
   * Manually trigger a recurrence pattern (for testing)
   */
  async triggerPattern(taskId: string, userId: string): Promise<{ newTaskId?: string; error?: string }> {
    const pattern = await this.recurrenceRepository.findByTaskId(taskId, userId);
    if (!pattern) {
      return { error: 'Recurrence pattern not found' };
    }

    if (pattern.status !== 'active') {
      return { error: `Cannot trigger ${pattern.status} recurrence` };
    }

    try {
      await this.processPattern(pattern);
      return { newTaskId: 'created' }; // Would return actual ID in real implementation
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

// Singleton instance
let schedulerInstance: RecurrenceScheduler | null = null;

export function getRecurrenceScheduler(): RecurrenceScheduler {
  schedulerInstance ??= new RecurrenceScheduler();
  return schedulerInstance;
}
