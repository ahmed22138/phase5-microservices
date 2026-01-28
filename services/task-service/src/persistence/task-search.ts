/**
 * Task Search Query Builder
 * Implements full-text search with filters
 * Reference: spec.md FR-008, FR-011
 */

import pg from 'pg';
import { Task, TaskData, TaskPriority, TaskStatus } from '../domain/task.js';

const { Pool } = pg;

export interface SearchQuery {
  userId: string;
  query?: string;
  filters?: {
    status?: TaskStatus | TaskStatus[];
    priority?: TaskPriority | TaskPriority[];
    tags?: string[];
    tagsMatchAll?: boolean;
    dueBefore?: Date;
    dueAfter?: Date;
    overdue?: boolean;
    isRecurring?: boolean;
  };
  sort?: {
    field: 'priority' | 'dueDate' | 'createdAt' | 'title' | 'relevance';
    direction: 'asc' | 'desc';
  };
  pagination?: {
    limit: number;
    offset: number;
  };
}

export interface SearchResult {
  tasks: Task[];
  total: number;
  query?: string;
  filters: Record<string, unknown>;
}

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: Date | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  is_recurring: boolean;
  parent_task_id: string | null;
  rank?: number;
}

export class TaskSearchService {
  private readonly pool: pg.Pool;

  constructor(pool?: pg.Pool) {
    this.pool = pool ?? new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      database: process.env.DB_NAME ?? 'task_db',
      user: process.env.DB_USER ?? 'task_user',
      password: process.env.DB_PASSWORD ?? 'task_password',
    });
  }

  async search(searchQuery: SearchQuery): Promise<SearchResult> {
    const { query, params, countQuery, countParams } = this.buildSearchQuery(searchQuery);

    // Execute search query
    const result = await this.pool.query<TaskRow>(query, params);

    // Execute count query
    const countResult = await this.pool.query<{ count: string }>(countQuery, countParams);
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const tasks = result.rows.map((row) => this.rowToTask(row));

    return {
      tasks,
      total,
      query: searchQuery.query,
      filters: searchQuery.filters ?? {},
    };
  }

  private buildSearchQuery(searchQuery: SearchQuery): {
    query: string;
    params: unknown[];
    countQuery: string;
    countParams: unknown[];
  } {
    const conditions: string[] = ['t.user_id = $1'];
    const params: unknown[] = [searchQuery.userId];
    let paramIndex = 2;
    let hasFullText = false;

    // Full-text search
    if (searchQuery.query && searchQuery.query.trim().length > 0) {
      hasFullText = true;
      // Use plainto_tsquery for natural language queries
      conditions.push(`to_tsvector('english', t.title || ' ' || COALESCE(t.description, '')) @@ plainto_tsquery('english', $${paramIndex})`);
      params.push(searchQuery.query);
      paramIndex++;
    }

    // Apply filters
    const filters = searchQuery.filters ?? {};

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`t.status = ANY($${paramIndex})`);
        params.push(filters.status);
      } else {
        conditions.push(`t.status = $${paramIndex}`);
        params.push(filters.status);
      }
      paramIndex++;
    }

    if (filters.priority) {
      if (Array.isArray(filters.priority)) {
        conditions.push(`t.priority = ANY($${paramIndex})`);
        params.push(filters.priority);
      } else {
        conditions.push(`t.priority = $${paramIndex}`);
        params.push(filters.priority);
      }
      paramIndex++;
    }

    if (filters.dueBefore) {
      conditions.push(`t.due_date <= $${paramIndex}`);
      params.push(filters.dueBefore);
      paramIndex++;
    }

    if (filters.dueAfter) {
      conditions.push(`t.due_date >= $${paramIndex}`);
      params.push(filters.dueAfter);
      paramIndex++;
    }

    if (filters.overdue) {
      conditions.push(`t.due_date < NOW() AND t.status NOT IN ('completed', 'cancelled')`);
    }

    if (filters.isRecurring !== undefined) {
      conditions.push(`t.is_recurring = $${paramIndex}`);
      params.push(filters.isRecurring);
      paramIndex++;
    }

    if (filters.tags && filters.tags.length > 0) {
      if (filters.tagsMatchAll) {
        conditions.push(`(
          SELECT COUNT(DISTINCT tg.name)
          FROM task_tag tt
          JOIN tag tg ON tt.tag_id = tg.id
          WHERE tt.task_id = t.id AND tg.name = ANY($${paramIndex})
        ) = $${paramIndex + 1}`);
        params.push(filters.tags);
        params.push(filters.tags.length);
        paramIndex += 2;
      } else {
        conditions.push(`EXISTS (
          SELECT 1 FROM task_tag tt
          JOIN tag tg ON tt.tag_id = tg.id
          WHERE tt.task_id = t.id AND tg.name = ANY($${paramIndex})
        )`);
        params.push(filters.tags);
        paramIndex++;
      }
    }

    const whereClause = conditions.join(' AND ');

    // Build SELECT with optional ranking
    let selectClause = 't.*';
    if (hasFullText) {
      selectClause += `, ts_rank(to_tsvector('english', t.title || ' ' || COALESCE(t.description, '')), plainto_tsquery('english', $2)) as rank`;
    }

    // Build ORDER BY
    let orderClause = '';
    const sort = searchQuery.sort ?? { field: hasFullText ? 'relevance' : 'createdAt', direction: 'desc' };

    if (sort.field === 'relevance' && hasFullText) {
      orderClause = `ORDER BY rank ${sort.direction === 'asc' ? 'ASC' : 'DESC'}, t.created_at DESC`;
    } else {
      const sortColumn = this.getSortColumn(sort.field);
      const sortDir = sort.direction === 'desc' ? 'DESC' : 'ASC';
      if (sort.field === 'dueDate') {
        orderClause = `ORDER BY t.${sortColumn} ${sortDir} NULLS LAST, t.created_at DESC`;
      } else if (sort.field === 'priority') {
        // Custom priority ordering: urgent > high > medium > low
        orderClause = `ORDER BY CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END ${sortDir}, t.created_at DESC`;
      } else {
        orderClause = `ORDER BY t.${sortColumn} ${sortDir}`;
      }
    }

    // Build pagination
    const pagination = searchQuery.pagination ?? { limit: 50, offset: 0 };
    const limitClause = `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const paginationParams = [pagination.limit, pagination.offset];

    // Final queries
    const query = `SELECT ${selectClause} FROM task t WHERE ${whereClause} ${orderClause} ${limitClause}`;
    const countQuery = `SELECT COUNT(*) as count FROM task t WHERE ${whereClause}`;

    return {
      query,
      params: [...params, ...paginationParams],
      countQuery,
      countParams: params,
    };
  }

  private getSortColumn(field: string): string {
    const mapping: Record<string, string> = {
      priority: 'priority',
      dueDate: 'due_date',
      createdAt: 'created_at',
      title: 'title',
    };
    return mapping[field] ?? 'created_at';
  }

  private rowToTask(row: TaskRow): Task {
    const data: TaskData = {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      dueDate: row.due_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      isRecurring: row.is_recurring,
      parentTaskId: row.parent_task_id,
    };
    return Task.fromData(data);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
