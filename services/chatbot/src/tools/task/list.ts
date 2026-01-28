/**
 * MCP Tool: task.list
 * Lists tasks with filters for priority, tags, due dates, status
 * Reference: spec.md User Story 1, 2, 3, 4
 */

import { DaprClient, HttpMethod } from '@dapr/dapr';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

const logger = pino({ name: 'mcp-task-list' });

export interface TaskListInput {
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  tagsMatchAll?: boolean;
  dueBefore?: string;
  dueAfter?: string;
  overdue?: boolean;
  isRecurring?: boolean;
  sortBy?: 'priority' | 'dueDate' | 'createdAt' | 'title';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface TaskListOutput {
  success: boolean;
  message: string;
  tasks?: {
    id: string;
    title: string;
    priority: string;
    status: string;
    dueDate?: string;
    tags: string[];
    isRecurring: boolean;
    isOverdue: boolean;
  }[];
  total?: number;
}

export class TaskListTool {
  private readonly daprClient: DaprClient;

  constructor() {
    this.daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });
  }

  async execute(input: TaskListInput, userId: string, correlationId?: string): Promise<TaskListOutput> {
    const corrId = correlationId ?? uuidv4();

    try {
      logger.info({ input, userId, correlationId: corrId }, 'Listing tasks');

      // Build query parameters
      const queryParams = new URLSearchParams();

      if (input.status) queryParams.set('status', input.status);
      if (input.priority) queryParams.set('priority', input.priority);
      if (input.tags && input.tags.length > 0) {
        input.tags.forEach((tag) => { queryParams.append('tags', tag); });
      }
      if (input.tagsMatchAll) queryParams.set('tagsMatchAll', 'true');
      if (input.dueBefore) queryParams.set('dueBefore', input.dueBefore);
      if (input.dueAfter) queryParams.set('dueAfter', input.dueAfter);
      if (input.overdue) queryParams.set('overdue', 'true');
      if (input.isRecurring !== undefined) queryParams.set('isRecurring', String(input.isRecurring));
      if (input.sortBy) queryParams.set('sortBy', input.sortBy);
      if (input.sortOrder) queryParams.set('sortOrder', input.sortOrder);
      if (input.limit) queryParams.set('limit', String(input.limit));
      if (input.offset) queryParams.set('offset', String(input.offset));

      const queryString = queryParams.toString();
      const path = queryString ? `tasks?${queryString}` : 'tasks';

      // Call Task Service via Dapr
      const response = await this.daprClient.invoker.invoke(
        'task-service',
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

      const data = response as {
        tasks: {
          id: string;
          title: string;
          priority: string;
          status: string;
          dueDate?: string;
          tags: string[];
          isRecurring: boolean;
        }[];
        total: number;
      };

      // Add isOverdue flag
      const now = new Date();
      const tasksWithOverdue = data.tasks.map((task) => ({
        ...task,
        isOverdue: task.dueDate
          ? new Date(task.dueDate) < now && task.status !== 'completed' && task.status !== 'cancelled'
          : false,
      }));

      logger.info({ count: data.tasks.length, total: data.total, userId, correlationId: corrId }, 'Tasks listed');

      // Build message
      let message = '';
      if (data.tasks.length === 0) {
        message = 'No tasks found matching your criteria';
      } else {
        const filterDesc: string[] = [];
        if (input.priority) filterDesc.push(`${input.priority} priority`);
        if (input.status) filterDesc.push(input.status);
        if (input.tags && input.tags.length > 0) filterDesc.push(`tagged ${input.tags.join(', ')}`);
        if (input.overdue) filterDesc.push('overdue');

        message = filterDesc.length > 0
          ? `Found ${data.total} ${filterDesc.join(', ')} task(s)`
          : `Found ${data.total} task(s)`;

        if (data.tasks.length < data.total) {
          message += ` (showing ${data.tasks.length})`;
        }
      }

      return {
        success: true,
        message,
        tasks: tasksWithOverdue,
        total: data.total,
      };
    } catch (error) {
      logger.error({ error, input, userId, correlationId: corrId }, 'Failed to list tasks');
      return {
        success: false,
        message: `Failed to list tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

// MCP Tool Definition
export const taskListToolDefinition = {
  name: 'task.list',
  description: 'List tasks with optional filters for status, priority, tags, due dates, and sorting',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed', 'cancelled'],
        description: 'Filter by task status',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'Filter by priority level',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags',
      },
      tagsMatchAll: {
        type: 'boolean',
        description: 'If true, task must have ALL specified tags; if false, ANY tag matches',
      },
      dueBefore: {
        type: 'string',
        format: 'date-time',
        description: 'Filter tasks due before this date',
      },
      dueAfter: {
        type: 'string',
        format: 'date-time',
        description: 'Filter tasks due after this date',
      },
      overdue: {
        type: 'boolean',
        description: 'If true, only show overdue tasks',
      },
      isRecurring: {
        type: 'boolean',
        description: 'Filter by recurring status',
      },
      sortBy: {
        type: 'string',
        enum: ['priority', 'dueDate', 'createdAt', 'title'],
        description: 'Field to sort by',
      },
      sortOrder: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        description: 'Maximum number of tasks to return (default: 50)',
      },
      offset: {
        type: 'number',
        minimum: 0,
        description: 'Number of tasks to skip for pagination',
      },
    },
  },
};
