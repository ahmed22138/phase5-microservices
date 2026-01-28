/**
 * RecurrencePattern Repository
 * Implements RecurrencePattern CRUD operations
 * Reference: data-model.md
 * Task: P5-T-076
 */

import pg from 'pg';
import {
  RecurrencePattern,
  RecurrencePatternData,
  RecurrenceFrequency,
  RecurrenceStatus,
} from '../domain/recurrence-pattern.js';

const { Pool } = pg;

interface RecurrenceRow {
  id: string;
  task_id: string;
  user_id: string;
  frequency: RecurrenceFrequency;
  interval: number;
  days_of_week: number[] | null;
  day_of_month: number | null;
  start_date: Date;
  end_date: Date | null;
  next_run_at: Date;
  status: RecurrenceStatus;
  last_triggered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class RecurrenceRepository {
  private readonly pool: pg.Pool;

  constructor(pool?: pg.Pool) {
    this.pool = pool ?? new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5434', 10),
      database: process.env.DB_NAME ?? 'recurrence_db',
      user: process.env.DB_USER ?? 'recurrence_user',
      password: process.env.DB_PASSWORD ?? 'recurrence_password',
    });
  }

  async create(pattern: RecurrencePattern): Promise<RecurrencePattern> {
    const data = pattern.toData();
    const result = await this.pool.query<RecurrenceRow>(
      `INSERT INTO recurrence_pattern (
        id, task_id, user_id, frequency, interval,
        days_of_week, day_of_month, start_date, end_date,
        next_run_at, status, last_triggered_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        data.id,
        data.taskId,
        data.userId,
        data.frequency,
        data.interval,
        data.daysOfWeek ?? null,
        data.dayOfMonth ?? null,
        data.startDate,
        data.endDate ?? null,
        data.nextRunAt,
        data.status,
        data.lastTriggeredAt ?? null,
        data.createdAt,
        data.updatedAt,
      ]
    );

    return this.rowToPattern(result.rows[0]);
  }

  async findById(id: string, userId?: string): Promise<RecurrencePattern | null> {
    let query = 'SELECT * FROM recurrence_pattern WHERE id = $1';
    const params: (string | undefined)[] = [id];

    if (userId) {
      query += ' AND user_id = $2';
      params.push(userId);
    }

    const result = await this.pool.query<RecurrenceRow>(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToPattern(result.rows[0]);
  }

  async findByTaskId(taskId: string, userId?: string): Promise<RecurrencePattern | null> {
    let query = 'SELECT * FROM recurrence_pattern WHERE task_id = $1';
    const params: (string | undefined)[] = [taskId];

    if (userId) {
      query += ' AND user_id = $2';
      params.push(userId);
    }

    const result = await this.pool.query<RecurrenceRow>(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToPattern(result.rows[0]);
  }

  async findByUser(userId: string, status?: RecurrenceStatus): Promise<RecurrencePattern[]> {
    let query = 'SELECT * FROM recurrence_pattern WHERE user_id = $1';
    const params: string[] = [userId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY next_run_at ASC';

    const result = await this.pool.query<RecurrenceRow>(query, params);

    return result.rows.map((row) => this.rowToPattern(row));
  }

  async findDuePatterns(limit = 100): Promise<RecurrencePattern[]> {
    const result = await this.pool.query<RecurrenceRow>(
      `SELECT * FROM recurrence_pattern
       WHERE status = 'active' AND next_run_at <= NOW()
       ORDER BY next_run_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => this.rowToPattern(row));
  }

  async findActivePatterns(limit = 1000): Promise<RecurrencePattern[]> {
    const result = await this.pool.query<RecurrenceRow>(
      `SELECT * FROM recurrence_pattern
       WHERE status = 'active'
       ORDER BY next_run_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => this.rowToPattern(row));
  }

  async update(pattern: RecurrencePattern): Promise<RecurrencePattern> {
    const data = pattern.toData();
    const result = await this.pool.query<RecurrenceRow>(
      `UPDATE recurrence_pattern SET
        frequency = $3,
        interval = $4,
        days_of_week = $5,
        day_of_month = $6,
        end_date = $7,
        next_run_at = $8,
        status = $9,
        last_triggered_at = $10,
        updated_at = $11
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
      [
        data.id,
        data.userId,
        data.frequency,
        data.interval,
        data.daysOfWeek ?? null,
        data.dayOfMonth ?? null,
        data.endDate ?? null,
        data.nextRunAt,
        data.status,
        data.lastTriggeredAt ?? null,
        data.updatedAt,
      ]
    );

    if (result.rows.length === 0) {
      throw new Error(`RecurrencePattern ${data.id} not found`);
    }

    return this.rowToPattern(result.rows[0]);
  }

  async updateNextRun(id: string, nextRunAt: Date, lastTriggeredAt: Date): Promise<void> {
    await this.pool.query(
      `UPDATE recurrence_pattern SET
        next_run_at = $2,
        last_triggered_at = $3,
        updated_at = NOW()
      WHERE id = $1`,
      [id, nextRunAt, lastTriggeredAt]
    );
  }

  async updateStatus(id: string, status: RecurrenceStatus): Promise<void> {
    await this.pool.query(
      `UPDATE recurrence_pattern SET
        status = $2,
        updated_at = NOW()
      WHERE id = $1`,
      [id, status]
    );
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM recurrence_pattern WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async deleteByTaskId(taskId: string, userId?: string): Promise<boolean> {
    let query = 'DELETE FROM recurrence_pattern WHERE task_id = $1';
    const params: (string | undefined)[] = [taskId];

    if (userId) {
      query += ' AND user_id = $2';
      params.push(userId);
    }

    const result = await this.pool.query(query, params);

    return (result.rowCount ?? 0) > 0;
  }

  async count(userId?: string, status?: RecurrenceStatus): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM recurrence_pattern WHERE 1=1';
    const params: string[] = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
    }

    const result = await this.pool.query<{ count: string }>(query, params);
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  private rowToPattern(row: RecurrenceRow): RecurrencePattern {
    const data: RecurrencePatternData = {
      id: row.id,
      taskId: row.task_id,
      userId: row.user_id,
      frequency: row.frequency,
      interval: row.interval,
      daysOfWeek: row.days_of_week ?? undefined,
      dayOfMonth: row.day_of_month ?? undefined,
      startDate: row.start_date,
      endDate: row.end_date ?? undefined,
      nextRunAt: row.next_run_at,
      status: row.status,
      lastTriggeredAt: row.last_triggered_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return new RecurrencePattern(data);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
