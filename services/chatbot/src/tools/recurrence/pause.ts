/**
 * MCP Tool: recurrence.pause
 * Temporarily pauses a recurring task pattern
 * Reference: spec.md User Story 5, FR-021
 * Task: P5-T-083, P5-T-087
 */

import { DaprClient, HttpMethod } from '@dapr/dapr';
import { v4 as uuidv4 } from 'uuid';
import { getEventPublisher } from '../../events/publisher.js';
import { EventTypes } from '../../events/types.js';
import pino from 'pino';

const logger = pino({ name: 'mcp-recurrence-pause' });

export interface RecurrencePauseInput {
  taskId: string;
}

export interface RecurrencePauseOutput {
  success: boolean;
  message: string;
  status?: string;
}

export class RecurrencePauseTool {
  private readonly daprClient: DaprClient;
  private readonly eventPublisher = getEventPublisher();

  constructor() {
    this.daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });
  }

  async execute(input: RecurrencePauseInput, userId: string, correlationId?: string): Promise<RecurrencePauseOutput> {
    const corrId = correlationId ?? uuidv4();

    try {
      logger.info({ input, userId, correlationId: corrId }, 'Pausing recurrence');

      // Validate required fields
      if (!input.taskId) {
        return {
          success: false,
          message: 'Task ID is required',
        };
      }

      // Call Recurrence Service via Dapr
      const response = await this.daprClient.invoker.invoke(
        'recurrence-service',
        `recurrence/${input.taskId}/pause`,
        HttpMethod.POST,
        undefined,
        {
          headers: {
            'X-User-Id': userId,
            'X-Correlation-Id': corrId,
          },
        }
      );

      const result = response as {
        id: string;
        taskId: string;
        status: string;
        message: string;
      };

      // Emit recurrence.paused event (P5-T-087)
      await this.eventPublisher.publishRecurrenceEvent(
        EventTypes.RECURRENCE_PAUSED,
        input.taskId,
        userId,
        { taskId: input.taskId },
        { correlationId: corrId, metadata: { toolName: 'recurrence.pause' } }
      );

      logger.info({ taskId: input.taskId, userId, correlationId: corrId }, 'Recurrence paused successfully');

      return {
        success: true,
        message: 'Recurrence paused. Task will no longer repeat until resumed.',
        status: result.status,
      };
    } catch (error) {
      logger.error({ error, input, userId, correlationId: corrId }, 'Failed to pause recurrence');

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Handle specific error cases
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        return {
          success: false,
          message: 'No recurrence pattern found for this task. The task may not be recurring.',
        };
      }

      if (errorMessage.includes('Can only pause active')) {
        return {
          success: false,
          message: 'This recurrence is not active. It may already be paused or completed.',
        };
      }

      return {
        success: false,
        message: `Failed to pause recurrence: ${errorMessage}`,
      };
    }
  }
}

// MCP Tool Definition
export const recurrencePauseToolDefinition = {
  name: 'recurrence.pause',
  description: 'Temporarily pause a recurring task. The task will stop repeating until resumed.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The ID of the recurring task to pause (required)',
      },
    },
    required: ['taskId'],
  },
};
