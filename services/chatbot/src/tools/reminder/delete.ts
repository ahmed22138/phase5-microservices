/**
 * MCP Tool: reminder.delete
 * Deletes a reminder by ID
 * Reference: spec.md User Story 4, FR-014
 * Task: P5-T-069, P5-T-072
 */

import { DaprClient, HttpMethod } from '@dapr/dapr';
import { v4 as uuidv4 } from 'uuid';
import { getEventPublisher } from '../../events/publisher.js';
import { EventTypes } from '../../events/types.js';
import pino from 'pino';

const logger = pino({ name: 'mcp-reminder-delete' });

export interface ReminderDeleteInput {
  reminderId: string;
}

export interface ReminderDeleteOutput {
  success: boolean;
  message: string;
}

export class ReminderDeleteTool {
  private readonly daprClient: DaprClient;
  private readonly eventPublisher = getEventPublisher();

  constructor() {
    this.daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });
  }

  async execute(input: ReminderDeleteInput, userId: string, correlationId?: string): Promise<ReminderDeleteOutput> {
    const corrId = correlationId ?? uuidv4();

    try {
      logger.info({ input, userId, correlationId: corrId }, 'Deleting reminder');

      // Validate required fields
      if (!input.reminderId) {
        return {
          success: false,
          message: 'Reminder ID is required',
        };
      }

      // First, get the reminder to retrieve taskId for the event
      let taskId: string | undefined;
      try {
        const reminderResponse = await this.daprClient.invoker.invoke(
          'reminder-service',
          `reminders/${input.reminderId}`,
          HttpMethod.GET,
          undefined,
          {
            headers: {
              'X-User-Id': userId,
              'X-Correlation-Id': corrId,
            },
          }
        );
        taskId = (reminderResponse as { taskId: string }).taskId;
      } catch {
        // Reminder not found - will be handled by delete call
      }

      // Call Reminder Service via Dapr to delete
      await this.daprClient.invoker.invoke(
        'reminder-service',
        `reminders/${input.reminderId}`,
        HttpMethod.DELETE,
        undefined,
        {
          headers: {
            'X-User-Id': userId,
            'X-Correlation-Id': corrId,
          },
        }
      );

      // Emit reminder.deleted event (P5-T-072)
      await this.eventPublisher.publishReminderEvent(
        EventTypes.REMINDER_DELETED,
        input.reminderId,
        userId,
        {
          reminderId: input.reminderId,
          taskId: taskId ?? 'unknown',
        },
        { correlationId: corrId, metadata: { toolName: 'reminder.delete' } }
      );

      logger.info({ reminderId: input.reminderId, taskId, userId, correlationId: corrId }, 'Reminder deleted successfully');

      return {
        success: true,
        message: 'Reminder deleted successfully',
      };
    } catch (error) {
      logger.error({ error, input, userId, correlationId: corrId }, 'Failed to delete reminder');

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Handle specific error cases
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        return {
          success: false,
          message: 'Reminder not found. It may have already been deleted or triggered.',
        };
      }

      return {
        success: false,
        message: `Failed to delete reminder: ${errorMessage}`,
      };
    }
  }
}

// MCP Tool Definition
export const reminderDeleteToolDefinition = {
  name: 'reminder.delete',
  description: 'Delete a reminder by its ID. Use this to cancel a scheduled reminder.',
  inputSchema: {
    type: 'object',
    properties: {
      reminderId: {
        type: 'string',
        description: 'The ID of the reminder to delete (required)',
      },
    },
    required: ['reminderId'],
  },
};
