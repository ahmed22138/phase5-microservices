/**
 * Event Handlers for Reminder Service
 * Handles external events that affect reminders
 * Reference: spec.md FR-016
 */

import { ReminderRepository } from '../persistence/reminder-repository';
import { getEventPublisher } from './publisher';
import { EventTypes } from './types';
import pino from 'pino';

const logger = pino({ name: 'reminder-event-handlers' });

export interface TaskDeletedEvent {
  taskId: string;
  userId: string;
  deletedAt: string;
}

export interface TaskCompletedEvent {
  taskId: string;
  userId: string;
  completedAt: string;
}

export class ReminderEventHandlers {
  private readonly reminderRepository: ReminderRepository;
  private readonly eventPublisher = getEventPublisher();

  constructor(reminderRepository?: ReminderRepository) {
    this.reminderRepository = reminderRepository ?? new ReminderRepository();
  }

  /**
   * Handle task.deleted event - cancel all pending reminders for the task
   */
  async handleTaskDeleted(event: TaskDeletedEvent, correlationId?: string): Promise<void> {
    logger.info({ event, correlationId }, 'Handling task.deleted event');

    try {
      const cancelledCount = await this.reminderRepository.cancelByTaskId(event.taskId);

      if (cancelledCount > 0) {
        // Emit reminder.cancelled events for each cancelled reminder
        await this.eventPublisher.publishReminderEvent(
          EventTypes.REMINDER_CANCELLED,
          `task-deleted-${event.taskId}`,
          event.userId,
          {
            taskId: event.taskId,
            reason: 'task_deleted',
            cancelledCount,
          },
          { correlationId, metadata: { serviceName: 'reminder-service', trigger: 'task.deleted' } }
        );

        logger.info({ taskId: event.taskId, cancelledCount, correlationId }, 'Cancelled reminders for deleted task');
      } else {
        logger.debug({ taskId: event.taskId, correlationId }, 'No pending reminders found for deleted task');
      }
    } catch (error) {
      logger.error({ error, event, correlationId }, 'Failed to handle task.deleted event');
      throw error;
    }
  }

  /**
   * Handle task.completed event - optionally cancel pending reminders
   */
  async handleTaskCompleted(event: TaskCompletedEvent, correlationId?: string): Promise<void> {
    logger.info({ event, correlationId }, 'Handling task.completed event');

    try {
      // Cancel pending reminders for completed tasks
      const cancelledCount = await this.reminderRepository.cancelByTaskId(event.taskId);

      if (cancelledCount > 0) {
        await this.eventPublisher.publishReminderEvent(
          EventTypes.REMINDER_CANCELLED,
          `task-completed-${event.taskId}`,
          event.userId,
          {
            taskId: event.taskId,
            reason: 'task_completed',
            cancelledCount,
          },
          { correlationId, metadata: { serviceName: 'reminder-service', trigger: 'task.completed' } }
        );

        logger.info({ taskId: event.taskId, cancelledCount, correlationId }, 'Cancelled reminders for completed task');
      }
    } catch (error) {
      logger.error({ error, event, correlationId }, 'Failed to handle task.completed event');
      throw error;
    }
  }
}

// Singleton instance
let handlersInstance: ReminderEventHandlers | null = null;

export function getReminderEventHandlers(): ReminderEventHandlers {
  handlersInstance ??= new ReminderEventHandlers();
  return handlersInstance;
}
