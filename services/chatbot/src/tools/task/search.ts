/**
 * MCP Tool: task.search
 * Search tasks with full-text query and combined filters
 * Reference: spec.md User Story 3 (FR-008, FR-009, FR-010, FR-011)
 */

import { DaprClient, HttpMethod } from '@dapr/dapr';
import { v4 as uuidv4 } from 'uuid';
import { getEventPublisher } from '../../events/publisher.js';
import { EventTypes } from '../../events/types.js';
import pino from 'pino';

const logger = pino({ name: 'mcp-task-search' });

export interface TaskSearchInput {
  query?: string;
  filters?: {
    status?: 'pending' | 'in_progress' | 'completed' | 'cancelled' | string[];
    priority?: 'low' | 'medium' | 'high' | 'urgent' | string[];
    tags?: string[];
    tagsMatchAll?: boolean;
    dueBefore?: string;
    dueAfter?: string;
    overdue?: boolean;
    isRecurring?: boolean;
  };
  sort?: {
    field: 'priority' | 'dueDate' | 'createdAt' | 'title' | 'relevance';
    direction: 'asc' | 'desc';
  };
  limit?: number;
  offset?: number;
}

export interface TaskSearchOutput {
  success: boolean;
  message: string;
  tasks?: {
    id: string;
    title: string;
    description?: string;
    priority: string;
    status: string;
    dueDate?: string;
    tags: string[];
    isRecurring: boolean;
    isOverdue: boolean;
  }[];
  total?: number;
  query?: string;
}

export class TaskSearchTool {
  private readonly daprClient: DaprClient;
  private readonly eventPublisher = getEventPublisher();

  constructor() {
    this.daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });
  }

  async execute(input: TaskSearchInput, userId: string, correlationId?: string): Promise<TaskSearchOutput> {
    const corrId = correlationId ?? uuidv4();

    try {
      logger.info({ input, userId, correlationId: corrId }, 'Searching tasks');

      // Call Task Service via Dapr
      const response = await this.daprClient.invoker.invoke(
        'task-service',
        'tasks/search',
        HttpMethod.POST,
        {
          query: input.query,
          filters: input.filters,
          sort: input.sort,
          limit: input.limit ?? 50,
          offset: input.offset ?? 0,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
            'X-Correlation-Id': corrId,
          },
        }
      );

      const data = response as {
        tasks: {
          id: string;
          title: string;
          description?: string;
          priority: string;
          status: string;
          dueDate?: string;
          tags: string[];
          isRecurring: boolean;
        }[];
        total: number;
        query?: string;
      };

      // Add isOverdue flag
      const now = new Date();
      const tasksWithOverdue = data.tasks.map((task) => ({
        ...task,
        isOverdue: task.dueDate
          ? new Date(task.dueDate) < now && task.status !== 'completed' && task.status !== 'cancelled'
          : false,
      }));

      // Emit search event
      await this.eventPublisher.publishTaskEvent(
        EventTypes.TASK_SEARCHED,
        'search',
        userId,
        {
          query: input.query,
          filters: input.filters ?? {},
          resultCount: data.total,
        },
        { correlationId: corrId, metadata: { toolName: 'task.search' } }
      );

      logger.info({ query: input.query, resultCount: data.total, userId, correlationId: corrId }, 'Task search completed');

      // Build message
      let message = '';
      if (data.tasks.length === 0) {
        if (input.query) {
          message = `No tasks found matching "${input.query}"`;
        } else {
          message = 'No tasks found matching your criteria';
        }
      } else {
        if (input.query) {
          message = `Found ${String(data.total)} task(s) matching "${input.query}"`;
        } else {
          const filterDesc: string[] = [];
          if (input.filters?.priority) {
            const priority = Array.isArray(input.filters.priority)
              ? input.filters.priority.join(', ')
              : input.filters.priority;
            filterDesc.push(`${priority} priority`);
          }
          if (input.filters?.status) {
            const status = Array.isArray(input.filters.status)
              ? input.filters.status.join(', ')
              : input.filters.status;
            filterDesc.push(status);
          }
          if (input.filters?.tags) filterDesc.push(`tagged ${input.filters.tags.join(', ')}`);
          if (input.filters?.overdue) filterDesc.push('overdue');

          message = filterDesc.length > 0
            ? `Found ${String(data.total)} ${filterDesc.join(', ')} task(s)`
            : `Found ${String(data.total)} task(s)`;
        }

        if (data.tasks.length < data.total) {
          message += ` (showing ${data.tasks.length})`;
        }
      }

      return {
        success: true,
        message,
        tasks: tasksWithOverdue,
        total: data.total,
        query: data.query,
      };
    } catch (error) {
      logger.error({ error, input, userId, correlationId: corrId }, 'Failed to search tasks');
      return {
        success: false,
        message: `Failed to search tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

// MCP Tool Definition
export const taskSearchToolDefinition = {
  name: 'task.search',
  description: 'Search tasks using text search and/or filters. Supports full-text search across titles and descriptions, combined with priority, status, tag, and date filters.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Text to search for in task titles and descriptions',
      },
      filters: {
        type: 'object',
        properties: {
          status: {
            oneOf: [
              { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
              { type: 'array', items: { type: 'string' } },
            ],
            description: 'Filter by status (single or multiple)',
          },
          priority: {
            oneOf: [
              { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
              { type: 'array', items: { type: 'string' } },
            ],
            description: 'Filter by priority (single or multiple)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by tags',
          },
          tagsMatchAll: {
            type: 'boolean',
            description: 'If true, task must have ALL tags; if false, ANY tag matches',
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
            description: 'Filter to only overdue tasks',
          },
          isRecurring: {
            type: 'boolean',
            description: 'Filter by recurring status',
          },
        },
        description: 'Filters to apply to search results',
      },
      sort: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['priority', 'dueDate', 'createdAt', 'title', 'relevance'],
            description: 'Field to sort by (relevance only available with text search)',
          },
          direction: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction',
          },
        },
        description: 'Sort options',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        description: 'Maximum results to return (default: 50)',
      },
      offset: {
        type: 'number',
        minimum: 0,
        description: 'Offset for pagination',
      },
    },
  },
};
