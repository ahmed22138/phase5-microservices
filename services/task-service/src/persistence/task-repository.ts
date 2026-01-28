/**
 * Task Repository
 * Implements Task CRUD operations
 * Reference: data-model.md
 */

import pg from 'pg';
import { Task, TaskData, TaskPriority, TaskStatus } from '../domain/task.js';

const { Pool } = pg;

export interface TaskFilter {
  userId: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  isRecurring?: boolean;
  dueBefore?: Date;
  dueAfter?: Date;
  overdue?: boolean;
  tags?: string[];
  tagsMatchAll?: boolean;
}

export interface TaskSort {
  field: 'priority' | 'dueDate' | 'createdAt' | 'title';
  direction: 'asc' | 'desc';
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
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
}

export class TaskRepository {
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

  async create(task: Task): Promise<Task> {
    const data = task.toData();
    const result = await this.pool.query<TaskRow>(
      `INSERT INTO task (id, user_id, title, description, priority, status, due_date, created_at, updated_at, completed_at, is_recurring, parent_task_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        data.id,
        data.userId,
        data.title,
        data.description,
        data.priority,
        data.status,
        data.dueDate,
        data.createdAt,
        data.updatedAt,
        data.completedAt,
        data.isRecurring,
        data.parentTaskId,
      ]
    );

    return this.rowToTask(result.rows[0]);
  }

  async findById(id: string, userId: string): Promise<Task | null> {
    const result = await this.pool.query<TaskRow>(
      'SELECT * FROM task WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToTask(result.rows[0]);
  }

  async update(task: Task): Promise<Task> {
    const data = task.toData();
    const result = await this.pool.query<TaskRow>(
      `UPDATE task SET
        title = $3,
        description = $4,
        priority = $5,
        status = $6,
        due_date = $7,
        updated_at = $8,
        completed_at = $9,
        is_recurring = $10,
        parent_task_id = $11
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        data.id,
        data.userId,
        data.title,
        data.description,
        data.priority,
        data.status,
        data.dueDate,
        data.updatedAt,
        data.completedAt,
        data.isRecurring,
        data.parentTaskId,
      ]
    );

    if (result.rows.length === 0) {
      throw new Error(`Task ${data.id} not found`);
    }

    return this.rowToTask(result.rows[0]);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM task WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async findAll(
    filter: TaskFilter,
    sort?: TaskSort,
    pagination?: PaginationOptions
  ): Promise<Task[]> {
    const { query, params } = this.buildFilterQuery(filter, sort, pagination);
    const result = await this.pool.query<TaskRow>(query, params);
    return result.rows.map((row) => this.rowToTask(row));
  }

  async count(filter: TaskFilter): Promise<number> {
    const conditions: string[] = ['user_id = $1'];
    const params: unknown[] = [filter.userId];
    let paramIndex = 2;

    if (filter.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filter.status);
    }

    if (filter.priority) {
      conditions.push(`priority = $${paramIndex++}`);
      params.push(filter.priority);
    }

    if (filter.isRecurring !== undefined) {
      conditions.push(`is_recurring = $${paramIndex++}`);
      params.push(filter.isRecurring);
    }

    const query = `SELECT COUNT(*) as count FROM task WHERE ${conditions.join(' AND ')}`;
    const result = await this.pool.query<{ count: string }>(query, params);
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  private buildFilterQuery(
    filter: TaskFilter,
    sort?: TaskSort,
    pagination?: PaginationOptions
  ): { query: string; params: unknown[] } {
    const conditions: string[] = ['t.user_id = $1'];
    const params: unknown[] = [filter.userId];
    let paramIndex = 2;
    let _needsTagJoin = false;

    if (filter.status) {
      conditions.push(`t.status = $${paramIndex++}`);
      params.push(filter.status);
    }

    if (filter.priority) {
      conditions.push(`t.priority = $${paramIndex++}`);
      params.push(filter.priority);
    }

    if (filter.isRecurring !== undefined) {
      conditions.push(`t.is_recurring = $${paramIndex++}`);
      params.push(filter.isRecurring);
    }

    if (filter.dueBefore) {
      conditions.push(`t.due_date <= $${paramIndex++}`);
      params.push(filter.dueBefore);
    }

    if (filter.dueAfter) {
      conditions.push(`t.due_date >= $${paramIndex++}`);
      params.push(filter.dueAfter);
    }

    if (filter.overdue) {
      conditions.push(`t.due_date < NOW() AND t.status NOT IN ('completed', 'cancelled')`);
    }

    if (filter.tags && filter.tags.length > 0) {
      _needsTagJoin = true;
      if (filter.tagsMatchAll) {
        // Must have all tags
        conditions.push(`(
          SELECT COUNT(DISTINCT tg.name)
          FROM task_tag tt
          JOIN tag tg ON tt.tag_id = tg.id
          WHERE tt.task_id = t.id AND tg.name = ANY($${paramIndex++})
        ) = $${paramIndex++}`);
        params.push(filter.tags);
        params.push(filter.tags.length);
      } else {
        // Must have any of the tags
        conditions.push(`EXISTS (
          SELECT 1 FROM task_tag tt
          JOIN tag tg ON tt.tag_id = tg.id
          WHERE tt.task_id = t.id AND tg.name = ANY($${paramIndex++})
        )`);
        params.push(filter.tags);
      }
    }

    let query = `SELECT t.* FROM task t WHERE ${conditions.join(' AND ')}`;

    // Add sorting
    if (sort) {
      const sortColumn = this.getSortColumn(sort.field);
      const sortDir = sort.direction === 'desc' ? 'DESC' : 'ASC';
      // Handle NULL values for dueDate
      if (sort.field === 'dueDate') {
        query += ` ORDER BY t.${sortColumn} ${sortDir} NULLS LAST`;
      } else {
        query += ` ORDER BY t.${sortColumn} ${sortDir}`;
      }
    } else {
      query += ' ORDER BY t.created_at DESC';
    }

    // Add pagination
    if (pagination?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(pagination.limit);
    }

    if (pagination?.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(pagination.offset);
    }

    return { query, params };
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
