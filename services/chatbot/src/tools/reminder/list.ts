/**
 * MCP Tool: reminder.list
 * Lists reminders for a task or all pending reminders
 * Reference: spec.md User Story 4, FR-014
 * Task: P5-T-070
 */

import { DaprClient, HttpMethod } from '@dapr/dapr';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

const logger = pino({ name: 'mcp-reminder-list' });

export interface ReminderListInput {
  taskId?: string; // Optional: filter by task ID
  pendingOnly?: boolean; // Default: true - show only pending reminders
}

export interface ReminderInfo {
  id: string;
  taskId: string;
  reminderTime: string;
  status: 'pending' | 'triggered' | 'cancelled';
  triggeredAt?: string;
  createdAt: string;
}

export interface ReminderListOutput {
  success: boolean;
  message: string;
  reminders?: ReminderInfo[];
  total?: number;
}

export class ReminderListTool {
  private readonly daprClient: DaprClient;

  constructor() {
    this.daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });
  }

  async execute(input: ReminderListInput, userId: string, correlationId?: string): Promise<ReminderListOutput> {
    const corrId = correlationId ?? uuidv4();

    try {
      logger.info({ input, userId, correlationId: corrId }, 'Listing reminders');

      // Build query parameters
      const queryParams = new URLSearchParams();
      if (input.taskId) {
        queryParams.append('taskId', input.taskId);
      }
      if (input.pendingOnly !== false) {
        queryParams.append('pendingOnly', 'true');
      }

      const queryString = queryParams.toString();
      const path = queryString ? `reminders?${queryString}` : 'reminders';

      // Call Reminder Service via Dapr
      const response = await this.daprClient.invoker.invoke(
        'reminder-service',
        path,
        HttpMethod.GET,
        undefined,
        {
          headers: {
            'X-User-Id': userId,
            'X-Correlation-Id': corrId,
          },
        }
      );

      const result = response as {
        reminders: ReminderInfo[];
        total: number;
      };

      logger.info({
        taskId: input.taskId,
        reminderCount: result.total,
        userId,
        correlationId: corrId
      }, 'Reminders listed successfully');

      // Format output message
      let message: string;
      if (result.total === 0) {
        message = input.taskId
          ? 'No reminders found for this task'
          : 'No pending reminders found';
      } else {
        const taskFilter = input.taskId ? ` for task ${input.taskId}` : '';
        message = `Found ${String(result.total)} reminder${result.total > 1 ? 's' : ''}${taskFilter}`;
      }

      return {
        success: true,
        message,
        reminders: result.reminders,
        total: result.total,
      };
    } catch (error) {
      logger.error({ error, input, userId, correlationId: corrId }, 'Failed to list reminders');

      return {
        success: false,
        message: `Failed to list reminders: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

// MCP Tool Definition
export const reminderListToolDefinition = {
  name: 'reminder.list',
  description: 'List reminders. Can filter by task ID or show all pending reminders for the user.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Optional: Filter reminders for a specific task ID',
      },
      pendingOnly: {
        type: 'boolean',
        default: true,
        description: 'If true (default), only show pending reminders. If false, show all including triggered.',
      },
    },
  },
};
