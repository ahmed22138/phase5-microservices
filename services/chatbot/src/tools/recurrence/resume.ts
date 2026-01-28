/**
 * MCP Tool: recurrence.resume
 * Resumes a paused recurring task pattern
 * Reference: spec.md User Story 5, FR-021
 * Task: P5-T-084, P5-T-088
 */

import { DaprClient, HttpMethod } from '@dapr/dapr';
import { v4 as uuidv4 } from 'uuid';
import { getEventPublisher } from '../../events/publisher.js';
import { EventTypes } from '../../events/types.js';
import pino from 'pino';

const logger = pino({ name: 'mcp-recurrence-resume' });

export interface RecurrenceResumeInput {
  taskId: string;
}

export interface RecurrenceResumeOutput {
  success: boolean;
  message: string;
  status?: string;
  nextRunAt?: string;
}

export class RecurrenceResumeTool {
  private readonly daprClient: DaprClient;
  private readonly eventPublisher = getEventPublisher();

  constructor() {
    this.daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });
  }

  async execute(input: RecurrenceResumeInput, userId: string, correlationId?: string): Promise<RecurrenceResumeOutput> {
    const corrId = correlationId ?? uuidv4();

    try {
      logger.info({ input, userId, correlationId: corrId }, 'Resuming recurrence');

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
        `recurrence/${input.taskId}/resume`,
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
        nextRunAt: string;
        message: string;
      };

      // Emit recurrence.resumed event (P5-T-088)
      await this.eventPublisher.publishRecurrenceEvent(
        EventTypes.RECURRENCE_RESUMED,
        input.taskId,
        userId,
        { taskId: input.taskId },
        { correlationId: corrId, metadata: { toolName: 'recurrence.resume' } }
      );

      logger.info({ taskId: input.taskId, nextRunAt: result.nextRunAt, userId, correlationId: corrId }, 'Recurrence resumed successfully');

      // Format next run time for human-readable message
      const nextRunDate = new Date(result.nextRunAt);
      const formattedTime = nextRunDate.toLocaleString();

      return {
        success: true,
        message: `Recurrence resumed. Next occurrence scheduled for ${formattedTime}`,
        status: result.status,
        nextRunAt: result.nextRunAt,
      };
    } catch (error) {
      logger.error({ error, input, userId, correlationId: corrId }, 'Failed to resume recurrence');

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Handle specific error cases
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        return {
          success: false,
          message: 'No recurrence pattern found for this task. The task may not be recurring.',
        };
      }

      if (errorMessage.includes('Can only resume paused')) {
        return {
          success: false,
          message: 'This recurrence is not paused. It may be active or already completed.',
        };
      }

      return {
        success: false,
        message: `Failed to resume recurrence: ${errorMessage}`,
      };
    }
  }
}

// MCP Tool Definition
export const recurrenceResumeToolDefinition = {
  name: 'recurrence.resume',
  description: 'Resume a paused recurring task. The task will start repeating again from the next scheduled time.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The ID of the recurring task to resume (required)',
      },
    },
    required: ['taskId'],
  },
};
