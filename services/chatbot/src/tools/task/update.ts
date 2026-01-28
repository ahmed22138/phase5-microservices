/**
 * MCP Tool: task.update
 * Updates task fields including priority, tags, due date, status
 * Reference: spec.md User Story 1, 2, 4
 */

import { DaprClient, HttpMethod } from '@dapr/dapr';
import { v4 as uuidv4 } from 'uuid';
import { getEventPublisher } from '../../events/publisher.js';
import { EventTypes } from '../../events/types.js';
import pino from 'pino';

const logger = pino({ name: 'mcp-task-update' });

export interface TaskUpdateInput {
  taskId: string;
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  dueDate?: string | null;
  addTags?: string[];
  removeTags?: string[];
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval?: number;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    endDate?: string;
  } | null;
}

export interface TaskUpdateOutput {
  success: boolean;
  message: string;
  task?: {
    id: string;
    title: string;
    priority: string;
    status: string;
    dueDate?: string;
    tags: string[];
    isRecurring: boolean;
  };
}

export class TaskUpdateTool {
  private readonly daprClient: DaprClient;
  private readonly eventPublisher = getEventPublisher();

  constructor() {
    this.daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });
  }

  async execute(input: TaskUpdateInput, userId: string, correlationId?: string): Promise<TaskUpdateOutput> {
    const corrId = correlationId ?? uuidv4();

    try {
      logger.info({ input, userId, correlationId: corrId }, 'Updating task');

      if (!input.taskId) {
        return {
          success: false,
          message: 'Task ID is required',
        };
      }

      // Build update payload
      const updatePayload: Record<string, unknown> = {};
      const changes: string[] = [];

      if (input.title !== undefined) {
        updatePayload.title = input.title;
        changes.push('title');
      }
      if (input.description !== undefined) {
        updatePayload.description = input.description;
        changes.push('description');
      }
      if (input.priority !== undefined) {
        updatePayload.priority = input.priority;
        changes.push(`priority to ${input.priority}`);
      }
      if (input.status !== undefined) {
        updatePayload.status = input.status;
        changes.push(`status to ${input.status}`);
      }
      if (input.dueDate !== undefined) {
        updatePayload.dueDate = input.dueDate;
        changes.push(input.dueDate ? `due date to ${new Date(input.dueDate).toLocaleDateString()}` : 'removed due date');
      }
      if (input.addTags && input.addTags.length > 0) {
        updatePayload.addTags = input.addTags;
        changes.push(`added tags: ${input.addTags.join(', ')}`);
      }
      if (input.removeTags && input.removeTags.length > 0) {
        updatePayload.removeTags = input.removeTags;
        changes.push(`removed tags: ${input.removeTags.join(', ')}`);
      }

      if (Object.keys(updatePayload).length === 0 && input.recurrence === undefined) {
        return {
          success: false,
          message: 'No fields to update',
        };
      }

      // Call Task Service via Dapr
      const response = await this.daprClient.invoker.invoke(
        'task-service',
        `tasks/${input.taskId}`,
        HttpMethod.PATCH,
        updatePayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
            'X-Correlation-Id': corrId,
          },
        }
      );

      const task = response as {
        id: string;
        title: string;
        priority: string;
        status: string;
        dueDate?: string;
        tags: string[];
        isRecurring: boolean;
      };

      // Handle recurrence changes (P5-T-081)
      if (input.recurrence !== undefined) {
        if (input.recurrence === null) {
          // Remove recurrence
          await this.daprClient.invoker.invoke(
            'recurrence-service',
            `recurrence/${input.taskId}`,
            HttpMethod.DELETE,
            undefined,
            {
              headers: {
                'X-User-Id': userId,
                'X-Correlation-Id': corrId,
              },
            }
          );
          changes.push('removed recurrence');

          await this.eventPublisher.publishRecurrenceEvent(
            EventTypes.RECURRENCE_STOPPED,
            input.taskId,
            userId,
            { taskId: input.taskId, reason: 'manual' },
            { correlationId: corrId, metadata: { toolName: 'task.update' } }
          );
        } else {
          // Update recurrence
          await this.daprClient.invoker.invoke(
            'recurrence-service',
            `recurrence/${input.taskId}`,
            HttpMethod.PUT,
            input.recurrence,
            {
              headers: {
                'Content-Type': 'application/json',
                'X-User-Id': userId,
                'X-Correlation-Id': corrId,
              },
            }
          );
          changes.push(`recurrence to ${input.recurrence.frequency}`);

          await this.eventPublisher.publishRecurrenceEvent(
            EventTypes.RECURRENCE_MODIFIED,
            input.taskId,
            userId,
            { taskId: input.taskId, newPattern: input.recurrence },
            { correlationId: corrId, metadata: { toolName: 'task.update' } }
          );
        }
      }

      logger.info({ taskId: input.taskId, userId, correlationId: corrId, changes }, 'Task updated successfully');

      // Emit granular business events (P5-T-038, P5-T-048, P5-T-049, P5-T-062)
      if (input.priority !== undefined) {
        await this.eventPublisher.publishTaskEvent(
          EventTypes.TASK_PRIORITY_CHANGED,
          input.taskId,
          userId,
          { taskId: input.taskId, newPriority: input.priority },
          { correlationId: corrId, metadata: { toolName: 'task.update' } }
        );
      }

      if (input.addTags && input.addTags.length > 0) {
        await this.eventPublisher.publishTaskEvent(
          EventTypes.TASK_TAGS_ADDED,
          input.taskId,
          userId,
          { taskId: input.taskId, addedTags: input.addTags },
          { correlationId: corrId, metadata: { toolName: 'task.update' } }
        );
      }

      if (input.removeTags && input.removeTags.length > 0) {
        await this.eventPublisher.publishTaskEvent(
          EventTypes.TASK_TAGS_REMOVED,
          input.taskId,
          userId,
          { taskId: input.taskId, removedTags: input.removeTags },
          { correlationId: corrId, metadata: { toolName: 'task.update' } }
        );
      }

      if (input.dueDate !== undefined) {
        await this.eventPublisher.publishTaskEvent(
          EventTypes.TASK_DUE_DATE_SET,
          input.taskId,
          userId,
          { taskId: input.taskId, dueDate: input.dueDate },
          { correlationId: corrId, metadata: { toolName: 'task.update' } }
        );
      }

      if (input.status === 'completed') {
        await this.eventPublisher.publishTaskEvent(
          EventTypes.TASK_COMPLETED,
          input.taskId,
          userId,
          { taskId: input.taskId, completedAt: new Date().toISOString() },
          { correlationId: corrId, metadata: { toolName: 'task.update' } }
        );
      }

      // Build confirmation message
      const message = changes.length > 0
        ? `Updated task "${task.title}": ${changes.join(', ')}`
        : `Task "${task.title}" unchanged`;

      return {
        success: true,
        message,
        task,
      };
    } catch (error) {
      logger.error({ error, input, userId, correlationId: corrId }, 'Failed to update task');
      return {
        success: false,
        message: `Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

// MCP Tool Definition
export const taskUpdateToolDefinition = {
  name: 'task.update',
  description: 'Update a task - change priority, status, due date, add/remove tags, or modify recurrence',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The ID of the task to update (required)',
      },
      title: {
        type: 'string',
        description: 'New title for the task',
      },
      description: {
        type: 'string',
        description: 'New description for the task',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'New priority level',
      },
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed', 'cancelled'],
        description: 'New status',
      },
      dueDate: {
        type: ['string', 'null'],
        format: 'date-time',
        description: 'New due date (ISO 8601) or null to remove',
      },
      addTags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to add to the task',
      },
      removeTags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to remove from the task',
      },
      recurrence: {
        oneOf: [
          {
            type: 'object',
            properties: {
              frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'] },
              interval: { type: 'number', minimum: 1 },
              daysOfWeek: { type: 'array', items: { type: 'number' } },
              dayOfMonth: { type: 'number' },
              endDate: { type: 'string', format: 'date-time' },
            },
            required: ['frequency'],
          },
          { type: 'null' },
        ],
        description: 'New recurrence pattern or null to remove',
      },
    },
    required: ['taskId'],
  },
};
