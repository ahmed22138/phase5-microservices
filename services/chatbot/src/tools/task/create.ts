/**
 * MCP Tool: task.create
 * Creates a new task with optional priority, tags, due date, and recurrence
 * Reference: spec.md User Story 1, 2, 4, 5
 */

import { DaprClient, HttpMethod } from '@dapr/dapr';
import { v4 as uuidv4 } from 'uuid';
import { getEventPublisher } from '../../events/publisher.js';
import { EventTypes } from '../../events/types.js';
import pino from 'pino';

const logger = pino({ name: 'mcp-task-create' });

export interface TaskCreateInput {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  tags?: string[];
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval?: number;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    endDate?: string;
  };
}

export interface TaskCreateOutput {
  success: boolean;
  taskId?: string;
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

export class TaskCreateTool {
  private readonly daprClient: DaprClient;
  private readonly eventPublisher = getEventPublisher();

  constructor() {
    this.daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });
  }

  async execute(input: TaskCreateInput, userId: string, correlationId?: string): Promise<TaskCreateOutput> {
    const corrId = correlationId ?? uuidv4();

    try {
      logger.info({ input, userId, correlationId: corrId }, 'Creating task');

      // Validate input
      if (!input.title || input.title.trim().length === 0) {
        return {
          success: false,
          message: 'Task title is required and cannot be empty',
        };
      }

      // Call Task Service via Dapr
      const response = await this.daprClient.invoker.invoke(
        'task-service',
        'tasks',
        HttpMethod.POST,
        {
          title: input.title,
          description: input.description,
          priority: input.priority ?? 'medium',
          dueDate: input.dueDate,
          tags: input.tags,
        },
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

      // Emit task.created event (P5-T-035)
      await this.eventPublisher.publishTaskEvent(
        EventTypes.TASK_CREATED,
        task.id,
        userId,
        {
          title: task.title,
          description: input.description,
          priority: task.priority as 'low' | 'medium' | 'high' | 'urgent',
          dueDate: task.dueDate,
          tags: task.tags,
          isRecurring: !!input.recurrence,
        },
        { correlationId: corrId, metadata: { toolName: 'task.create' } }
      );

      // Handle recurrence if specified (P5-T-080)
      if (input.recurrence) {
        await this.daprClient.invoker.invoke(
          'recurrence-service',
          `recurrence/${task.id}`,
          HttpMethod.PUT,
          {
            frequency: input.recurrence.frequency,
            interval: input.recurrence.interval ?? 1,
            daysOfWeek: input.recurrence.daysOfWeek,
            dayOfMonth: input.recurrence.dayOfMonth,
            endDate: input.recurrence.endDate,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-User-Id': userId,
              'X-Correlation-Id': corrId,
            },
          }
        );

        // Emit recurrence created event
        await this.eventPublisher.publishRecurrenceEvent(
          EventTypes.RECURRENCE_CREATED,
          task.id,
          userId,
          {
            taskId: task.id,
            ...input.recurrence,
          },
          { correlationId: corrId, metadata: { toolName: 'task.create' } }
        );
      }

      logger.info({ taskId: task.id, userId, correlationId: corrId }, 'Task created successfully');

      // Build confirmation message
      let message = `Created task "${task.title}"`;
      if (task.priority !== 'medium') {
        message += ` with ${task.priority} priority`;
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (task.tags && task.tags.length > 0) {
        message += ` tagged with ${task.tags.join(', ')}`;
      }
      if (task.dueDate) {
        message += ` due ${new Date(task.dueDate).toLocaleDateString()}`;
      }
      if (input.recurrence) {
        message += ` (recurring ${input.recurrence.frequency})`;
      }

      return {
        success: true,
        taskId: task.id,
        message,
        task,
      };
    } catch (error) {
      logger.error({ error, input, userId, correlationId: corrId }, 'Failed to create task');
      return {
        success: false,
        message: `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

// MCP Tool Definition
export const taskCreateToolDefinition = {
  name: 'task.create',
  description: 'Create a new task with optional priority, tags, due date, and recurrence pattern',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The title of the task (required)',
      },
      description: {
        type: 'string',
        description: 'Detailed description of the task',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'Priority level (default: medium)',
      },
      dueDate: {
        type: 'string',
        format: 'date-time',
        description: 'Due date in ISO 8601 format',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to categorize the task',
      },
      recurrence: {
        type: 'object',
        properties: {
          frequency: {
            type: 'string',
            enum: ['daily', 'weekly', 'monthly', 'yearly'],
          },
          interval: { type: 'number', minimum: 1 },
          daysOfWeek: {
            type: 'array',
            items: { type: 'number', minimum: 0, maximum: 6 },
          },
          dayOfMonth: { type: 'number', minimum: 1, maximum: 31 },
          endDate: { type: 'string', format: 'date-time' },
        },
        required: ['frequency'],
        description: 'Recurrence pattern for recurring tasks',
      },
    },
    required: ['title'],
  },
};
