/**
 * MCP Tool: tag.list
 * Lists all tags for the user with usage counts
 * Reference: spec.md User Story 2 (FR-007)
 */

import { DaprClient, HttpMethod } from '@dapr/dapr';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

const logger = pino({ name: 'mcp-tag-list' });

export interface TagListInput {
  orderBy?: 'usage' | 'name';
}

export interface TagListOutput {
  success: boolean;
  message: string;
  tags?: {
    id: string;
    name: string;
    usageCount: number;
  }[];
  total?: number;
}

export class TagListTool {
  private readonly daprClient: DaprClient;

  constructor() {
    this.daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });
  }

  async execute(input: TagListInput, userId: string, correlationId?: string): Promise<TagListOutput> {
    const corrId = correlationId ?? uuidv4();

    try {
      logger.info({ input, userId, correlationId: corrId }, 'Listing tags');

      const queryParams = new URLSearchParams();
      if (input.orderBy === 'name') {
        queryParams.set('orderBy', 'name');
      }

      const queryString = queryParams.toString();
      const path = queryString ? `tags?${queryString}` : 'tags';

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
        tags: {
          id: string;
          name: string;
          usageCount: number;
          createdAt: string;
        }[];
        total: number;
      };

      logger.info({ count: data.total, userId, correlationId: corrId }, 'Tags listed');

      // Build message
      let message = '';
      if (data.tags.length === 0) {
        message = 'You have no tags yet. Tags are created when you add them to tasks.';
      } else {
        const topTags = data.tags.slice(0, 5).map((t) => t.name);
        message = `You have ${String(data.total)} tag(s): ${topTags.join(', ')}`;
        if (data.total > 5) {
          message += ` and ${String(data.total - 5)} more`;
        }
      }

      return {
        success: true,
        message,
        tags: data.tags.map((t) => ({
          id: t.id,
          name: t.name,
          usageCount: t.usageCount,
        })),
        total: data.total,
      };
    } catch (error) {
      logger.error({ error, input, userId, correlationId: corrId }, 'Failed to list tags');
      return {
        success: false,
        message: `Failed to list tags: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

// MCP Tool Definition
export const tagListToolDefinition = {
  name: 'tag.list',
  description: 'List all tags you have used to categorize tasks, with usage counts',
  inputSchema: {
    type: 'object',
    properties: {
      orderBy: {
        type: 'string',
        enum: ['usage', 'name'],
        description: 'Order tags by usage count (default) or alphabetically by name',
      },
    },
  },
};
