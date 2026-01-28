/**
 * MCP Tool: reminder.create
 * Creates a reminder for a task with specified time
 * Reference: spec.md User Story 4, FR-014, FR-015, FR-016
 * Task: P5-T-068, P5-T-071
 */

import { DaprClient, HttpMethod } from '@dapr/dapr';
import { v4 as uuidv4 } from 'uuid';
import { getEventPublisher } from '../../events/publisher.js';
import { EventTypes } from '../../events/types.js';
import pino from 'pino';

const logger = pino({ name: 'mcp-reminder-create' });

export interface ReminderCreateInput {
  taskId: string;
  reminderTime: string; // ISO 8601 or relative like "1 hour before", "1 day before"
  relativeTo?: string; // Due date to calculate relative time from (ISO 8601)
}

export interface ReminderCreateOutput {
  success: boolean;
  message: string;
  reminder?: {
    id: string;
    taskId: string;
    reminderTime: string;
    status: string;
  };
}

export class ReminderCreateTool {
  private readonly daprClient: DaprClient;
  private readonly eventPublisher = getEventPublisher();

  constructor() {
    this.daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });
  }

  async execute(input: ReminderCreateInput, userId: string, correlationId?: string): Promise<ReminderCreateOutput> {
    const corrId = correlationId ?? uuidv4();

    try {
      logger.info({ input, userId, correlationId: corrId }, 'Creating reminder');

      // Validate required fields
      if (!input.taskId) {
        return {
          success: false,
          message: 'Task ID is required',
        };
      }

      if (!input.reminderTime) {
        return {
          success: false,
          message: 'Reminder time is required. Use ISO 8601 format or relative time like "1 hour before"',
        };
      }

      // If relative time is used, relativeTo (due date) is required
      if (input.reminderTime.includes('before') && !input.relativeTo) {
        return {
          success: false,
          message: 'When using relative time (e.g., "1 hour before"), the task due date (relativeTo) is required',
        };
      }

      // Call Reminder Service via Dapr
      const response = await this.daprClient.invoker.invoke(
        'reminder-service',
        'reminders',
        HttpMethod.POST,
        {
          taskId: input.taskId,
          reminderTime: input.reminderTime,
          relativeTo: input.relativeTo,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
            'X-Correlation-Id': corrId,
          },
        }
      );

      const reminder = response as {
        id: string;
        taskId: string;
        reminderTime: string;
        status: string;
      };

      // Emit reminder.created event (P5-T-071)
      await this.eventPublisher.publishReminderEvent(
        EventTypes.REMINDER_CREATED,
        reminder.id,
        userId,
        {
          reminderId: reminder.id,
          taskId: input.taskId,
          reminderTime: reminder.reminderTime,
        },
        { correlationId: corrId, metadata: { toolName: 'reminder.create' } }
      );

      logger.info({ reminderId: reminder.id, taskId: input.taskId, userId, correlationId: corrId }, 'Reminder created successfully');

      // Format reminder time for human-readable message
      const reminderDate = new Date(reminder.reminderTime);
      const formattedTime = reminderDate.toLocaleString();

      return {
        success: true,
        message: `Reminder created for ${formattedTime}`,
        reminder,
      };
    } catch (error) {
      logger.error({ error, input, userId, correlationId: corrId }, 'Failed to create reminder');

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Handle specific error cases
      if (errorMessage.includes('Invalid reminder time')) {
        return {
          success: false,
          message: 'Invalid reminder time format. Use ISO 8601 (e.g., "2026-01-20T10:00:00Z") or relative (e.g., "1 hour before")',
        };
      }

      return {
        success: false,
        message: `Failed to create reminder: ${errorMessage}`,
      };
    }
  }
}

// MCP Tool Definition
export const reminderCreateToolDefinition = {
  name: 'reminder.create',
  description: 'Create a reminder for a task. Supports absolute time (ISO 8601) or relative time like "1 hour before", "1 day before"',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The ID of the task to set a reminder for (required)',
      },
      reminderTime: {
        type: 'string',
        description: 'When to remind. Use ISO 8601 format (e.g., "2026-01-20T10:00:00Z") or relative time (e.g., "1 hour before", "2 days before")',
      },
      relativeTo: {
        type: 'string',
        format: 'date-time',
        description: 'The due date to calculate relative time from (ISO 8601). Required when using relative time like "1 hour before"',
      },
    },
    required: ['taskId', 'reminderTime'],
  },
};
