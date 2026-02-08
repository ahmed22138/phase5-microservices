/**
 * Reminder Scheduler
 * Polls for due reminders and triggers them
 * Reference: spec.md FR-015
 */

import { ReminderRepository } from '../persistence/reminder-repository.js';
import { getEventPublisher } from '../events/publisher.js';
import { EventTypes } from '../events/types.js';
import pino from 'pino';

const logger = pino({ name: 'reminder-scheduler' });

export class ReminderScheduler {
  private readonly reminderRepository: ReminderRepository;
  private readonly eventPublisher = getEventPublisher();
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(reminderRepository?: ReminderRepository) {
    this.reminderRepository = reminderRepository ?? new ReminderRepository();
  }

  /**
   * Start the scheduler
   * @param intervalMs - Polling interval in milliseconds (default: 30 seconds)
   */
  start(intervalMs = 30000): void {
    if (this.intervalId) {
      logger.warn('Scheduler already running');
      return;
    }

    logger.info({ intervalMs }, 'Starting reminder scheduler');

    // Run immediately on start
    void this.processReminders();

    // Then run on interval
    this.intervalId = setInterval(() => {
      void this.processReminders();
    }, intervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Reminder scheduler stopped');
    }
  }

  /**
   * Process reminders triggered via Dapr cron binding
   * Called from the /cron-reminder endpoint
   */
  async processViaBinding(): Promise<void> {
    logger.info('Processing reminders via Dapr cron binding');
    await this.processReminders();
  }

  /**
   * Process due reminders
   */
  private async processReminders(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Skipping reminder processing - previous run still in progress');
      return;
    }

    this.isRunning = true;

    try {
      const dueReminders = await this.reminderRepository.findDueReminders(100);

      if (dueReminders.length === 0) {
        logger.debug('No due reminders found');
        return;
      }

      logger.info({ count: dueReminders.length }, 'Processing due reminders');

      for (const reminder of dueReminders) {
        try {
          // Mark as triggered
          reminder.trigger();
          await this.reminderRepository.update(reminder);

          // Emit reminder.triggered event
          await this.eventPublisher.publishReminderEvent(
            EventTypes.REMINDER_TRIGGERED,
            reminder.id,
            reminder.userId,
            {
              reminderId: reminder.id,
              taskId: reminder.taskId,
              triggeredAt: reminder.triggeredAt?.toISOString(),
            },
            { metadata: { serviceName: 'reminder-scheduler' } }
          );

          logger.info({
            reminderId: reminder.id,
            taskId: reminder.taskId,
            userId: reminder.userId,
          }, 'Reminder triggered');
        } catch (error) {
          logger.error({
            error,
            reminderId: reminder.id,
            taskId: reminder.taskId,
          }, 'Failed to process reminder');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error processing reminders');
    } finally {
      this.isRunning = false;
    }
  }
}

// Singleton instance
let schedulerInstance: ReminderScheduler | null = null;

export function getReminderScheduler(): ReminderScheduler {
  schedulerInstance ??= new ReminderScheduler();
  return schedulerInstance;
}
