/**
 * Reminder Triggered Event Handler
 * Handles reminder.triggered events to notify users through the chatbot
 * Reference: spec.md User Story 4, FR-015
 * Task: P5-T-073
 */

import { DaprClient, DaprServer, CommunicationProtocolEnum, HttpMethod } from '@dapr/dapr';
import pino from 'pino';
import { Topics, EventTypes } from '../events/types.js';
import type { BaseDomainEvent, ReminderTriggeredPayload } from '../events/types.js';

const logger = pino({ name: 'reminder-handler' });

export interface TaskInfo {
  id: string;
  title: string;
  description?: string;
  priority: string;
  dueDate?: string;
}

export interface NotificationPayload {
  userId: string;
  type: 'reminder';
  title: string;
  body: string;
  taskId: string;
  reminderId: string;
  timestamp: string;
}

// Notification callback type - allows different notification strategies
export type NotificationCallback = (notification: NotificationPayload) => Promise<void>;

export class ReminderTriggeredHandler {
  private readonly daprClient: DaprClient;
  private readonly daprServer: DaprServer;
  private readonly pubsubName: string;
  private notificationCallback?: NotificationCallback;

  constructor() {
    this.daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });

    this.daprServer = new DaprServer({
      serverHost: process.env.SERVER_HOST ?? '127.0.0.1',
      serverPort: process.env.DAPR_APP_PORT ?? '3010', // Different port for Dapr subscriptions
      communicationProtocol: CommunicationProtocolEnum.HTTP,
      clientOptions: {
        daprHost: process.env.DAPR_HOST ?? 'localhost',
        daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
      },
    });

    this.pubsubName = process.env.PUBSUB_NAME ?? 'pubsub';
  }

  /**
   * Register a callback to handle notifications
   * This allows the chatbot to plug in its own notification mechanism
   */
  setNotificationCallback(callback: NotificationCallback): void {
    this.notificationCallback = callback;
  }

  /**
   * Start listening for reminder.triggered events
   */
  async start(): Promise<void> {
    logger.info('Starting reminder triggered handler');

    // Subscribe to reminder.events topic
    await this.daprServer.pubsub.subscribe(
      this.pubsubName,
      Topics.REMINDER_EVENTS,
      async (event: BaseDomainEvent<ReminderTriggeredPayload>) => {
        // Only handle reminder.triggered events
        if (event.eventType === EventTypes.REMINDER_TRIGGERED) {
          await this.handleReminderTriggered(event);
        }
      }
    );

    await this.daprServer.start();
    logger.info({ pubsub: this.pubsubName, topic: Topics.REMINDER_EVENTS }, 'Reminder handler started');
  }

  /**
   * Stop the event handler
   */
  async stop(): Promise<void> {
    logger.info('Stopping reminder triggered handler');
    await this.daprServer.stop();
  }

  /**
   * Handle a reminder.triggered event
   */
  private async handleReminderTriggered(event: BaseDomainEvent<ReminderTriggeredPayload>): Promise<void> {
    const { reminderId, taskId } = event.payload;
    const userId = event.userId;
    const correlationId = event.correlationId;

    logger.info({ reminderId, taskId, userId, correlationId }, 'Handling reminder.triggered event');

    try {
      // Fetch task details to include in the notification
      const task = await this.fetchTaskDetails(taskId, userId, correlationId);

      // Build notification
      const notification = this.buildNotification(reminderId, task, userId);

      // Send notification via callback or default handler
      if (this.notificationCallback) {
        await this.notificationCallback(notification);
      } else {
        await this.defaultNotificationHandler(notification);
      }

      logger.info({ reminderId, taskId, userId, correlationId }, 'Reminder notification sent');
    } catch (error) {
      logger.error({ error, reminderId, taskId, userId, correlationId }, 'Failed to handle reminder triggered event');
      // Don't throw - we don't want to nack the message and cause infinite retries
      // The error is logged for observability
    }
  }

  /**
   * Fetch task details from task-service
   */
  private async fetchTaskDetails(taskId: string, userId: string, correlationId: string): Promise<TaskInfo> {
    try {
      const response = await this.daprClient.invoker.invoke(
        'task-service',
        `tasks/${taskId}`,
        HttpMethod.GET,
        undefined,
        {
          headers: {
            'X-User-Id': userId,
            'X-Correlation-Id': correlationId,
          },
        }
      );

      return response as TaskInfo;
    } catch (error) {
      logger.warn({ error, taskId, userId }, 'Failed to fetch task details for reminder');
      // Return minimal task info if fetch fails
      return {
        id: taskId,
        title: 'Task',
        priority: 'medium',
      };
    }
  }

  /**
   * Build notification payload
   */
  private buildNotification(reminderId: string, task: TaskInfo, userId: string): NotificationPayload {
    // Build human-readable notification body
    let body = `Reminder: "${task.title}"`;

    if (task.dueDate) {
      const dueDate = new Date(task.dueDate);
      const now = new Date();
      const timeDiff = dueDate.getTime() - now.getTime();
      const hoursDiff = Math.round(timeDiff / (1000 * 60 * 60));

      if (hoursDiff < 0) {
        body += ` (overdue by ${String(Math.abs(hoursDiff))} hours)`;
      } else if (hoursDiff === 0) {
        body += ' (due now)';
      } else if (hoursDiff < 24) {
        body += ` (due in ${String(hoursDiff)} hours)`;
      } else {
        const daysDiff = Math.round(hoursDiff / 24);
        body += ` (due in ${String(daysDiff)} day${daysDiff > 1 ? 's' : ''})`;
      }
    }

    if (task.priority === 'urgent' || task.priority === 'high') {
      body += ` [${task.priority.toUpperCase()} PRIORITY]`;
    }

    return {
      userId,
      type: 'reminder',
      title: 'Task Reminder',
      body,
      taskId: task.id,
      reminderId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Default notification handler - logs to console
   * In production, this would be replaced with actual notification delivery
   */
  private defaultNotificationHandler(notification: NotificationPayload): Promise<void> {
    logger.info({
      notification,
    }, 'Reminder notification (default handler)');

    // In a real implementation, this would:
    // 1. Look up the user's session/connection
    // 2. Send a push notification, WebSocket message, or queue for next interaction
    // For now, we log it for demonstration

    console.log('\n========================================');
    console.log('REMINDER NOTIFICATION');
    console.log('========================================');
    console.log(`User: ${notification.userId}`);
    console.log(`Title: ${notification.title}`);
    console.log(`Body: ${notification.body}`);
    console.log(`Task ID: ${notification.taskId}`);
    console.log(`Time: ${notification.timestamp}`);
    console.log('========================================\n');

    return Promise.resolve();
  }
}

// Singleton instance
let handlerInstance: ReminderTriggeredHandler | null = null;

export function getReminderTriggeredHandler(): ReminderTriggeredHandler {
  handlerInstance ??= new ReminderTriggeredHandler();
  return handlerInstance;
}
