/**
 * Reminder Repository
 * Implements Reminder CRUD operations
 * Reference: data-model.md
 */

import pg from 'pg';
import { Reminder, ReminderData, ReminderStatus } from '../domain/reminder.js';

const { Pool } = pg;

interface ReminderRow {
  id: string;
  task_id: string;
  user_id: string;
  reminder_time: Date;
  status: ReminderStatus;
  triggered_at: Date | null;
  created_at: Date;
}

export class ReminderRepository {
  private readonly pool: pg.Pool;

  constructor(pool?: pg.Pool) {
    this.pool = pool ?? new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5433', 10),
      database: process.env.DB_NAME ?? 'reminder_db',
      user: process.env.DB_USER ?? 'reminder_user',
      password: process.env.DB_PASSWORD ?? 'reminder_password',
    });
  }

  async create(reminder: Reminder): Promise<Reminder> {
    const data = reminder.toData();
    const result = await this.pool.query<ReminderRow>(
      `INSERT INTO reminder (id, task_id, user_id, reminder_time, status, triggered_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.id,
        data.taskId,
        data.userId,
        data.reminderTime,
        data.status,
        data.triggeredAt,
        data.createdAt,
      ]
    );

    return this.rowToReminder(result.rows[0]);
  }

  async findById(id: string, userId: string): Promise<Reminder | null> {
    const result = await this.pool.query<ReminderRow>(
      'SELECT * FROM reminder WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToReminder(result.rows[0]);
  }

  async findByTaskId(taskId: string, userId: string): Promise<Reminder[]> {
    const result = await this.pool.query<ReminderRow>(
      'SELECT * FROM reminder WHERE task_id = $1 AND user_id = $2 ORDER BY reminder_time ASC',
      [taskId, userId]
    );

    return result.rows.map((row) => this.rowToReminder(row));
  }

  async findPendingByUser(userId: string): Promise<Reminder[]> {
    const result = await this.pool.query<ReminderRow>(
      `SELECT * FROM reminder
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY reminder_time ASC`,
      [userId]
    );

    return result.rows.map((row) => this.rowToReminder(row));
  }

  async findDueReminders(limit = 100): Promise<Reminder[]> {
    const result = await this.pool.query<ReminderRow>(
      `SELECT * FROM reminder
       WHERE status = 'pending' AND reminder_time <= NOW()
       ORDER BY reminder_time ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => this.rowToReminder(row));
  }

  async update(reminder: Reminder): Promise<Reminder> {
    const data = reminder.toData();
    const result = await this.pool.query<ReminderRow>(
      `UPDATE reminder SET
        reminder_time = $3,
        status = $4,
        triggered_at = $5
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        data.id,
        data.userId,
        data.reminderTime,
        data.status,
        data.triggeredAt,
      ]
    );

    if (result.rows.length === 0) {
      throw new Error(`Reminder ${data.id} not found`);
    }

    return this.rowToReminder(result.rows[0]);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM reminder WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async deleteByTaskId(taskId: string): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM reminder WHERE task_id = $1',
      [taskId]
    );

    return result.rowCount ?? 0;
  }

  async cancelByTaskId(taskId: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE reminder SET status = 'cancelled'
       WHERE task_id = $1 AND status = 'pending'`,
      [taskId]
    );

    return result.rowCount ?? 0;
  }

  private rowToReminder(row: ReminderRow): Reminder {
    const data: ReminderData = {
      id: row.id,
      taskId: row.task_id,
      userId: row.user_id,
      reminderTime: row.reminder_time,
      status: row.status,
      triggeredAt: row.triggered_at,
      createdAt: row.created_at,
    };
    return Reminder.fromData(data);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
