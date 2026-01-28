/**
 * Tag Repository
 * Implements Tag CRUD operations
 * Reference: data-model.md
 */

import pg from 'pg';
import { Tag, TagData, normalizeTagName } from '../domain/tag.js';

const { Pool } = pg;

interface TagRow {
  id: string;
  user_id: string;
  name: string;
  usage_count: number;
  created_at: Date;
}

export class TagRepository {
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

  async create(tag: Tag): Promise<Tag> {
    const data = tag.toData();
    const result = await this.pool.query<TagRow>(
      `INSERT INTO tag (id, user_id, name, usage_count, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.id, data.userId, data.name, data.usageCount, data.createdAt]
    );

    return this.rowToTag(result.rows[0]);
  }

  async findById(id: string, userId: string): Promise<Tag | null> {
    const result = await this.pool.query<TagRow>(
      'SELECT * FROM tag WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToTag(result.rows[0]);
  }

  async findByName(name: string, userId: string): Promise<Tag | null> {
    const normalizedName = normalizeTagName(name);
    const result = await this.pool.query<TagRow>(
      'SELECT * FROM tag WHERE name = $1 AND user_id = $2',
      [normalizedName, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToTag(result.rows[0]);
  }

  async findOrCreate(name: string, userId: string): Promise<Tag> {
    const normalizedName = normalizeTagName(name);

    // Try to find existing tag
    const existing = await this.findByName(normalizedName, userId);
    if (existing) {
      return existing;
    }

    // Create new tag
    const tag = new Tag({ userId, name: normalizedName });
    return this.create(tag);
  }

  async findAllByUser(userId: string, orderByUsage = true): Promise<Tag[]> {
    const orderClause = orderByUsage ? 'ORDER BY usage_count DESC, name ASC' : 'ORDER BY name ASC';
    const result = await this.pool.query<TagRow>(
      `SELECT * FROM tag WHERE user_id = $1 ${orderClause}`,
      [userId]
    );

    return result.rows.map((row) => this.rowToTag(row));
  }

  async findByNames(names: string[], userId: string): Promise<Tag[]> {
    const normalizedNames = names.map((n) => normalizeTagName(n)).filter((n) => n.length > 0);
    if (normalizedNames.length === 0) {
      return [];
    }

    const result = await this.pool.query<TagRow>(
      'SELECT * FROM tag WHERE name = ANY($1) AND user_id = $2',
      [normalizedNames, userId]
    );

    return result.rows.map((row) => this.rowToTag(row));
  }

  async update(tag: Tag): Promise<Tag> {
    const data = tag.toData();
    const result = await this.pool.query<TagRow>(
      `UPDATE tag SET usage_count = $3 WHERE id = $1 AND user_id = $2 RETURNING *`,
      [data.id, data.userId, data.usageCount]
    );

    if (result.rows.length === 0) {
      throw new Error(`Tag ${data.id} not found`);
    }

    return this.rowToTag(result.rows[0]);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM tag WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async deleteUnused(userId: string): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM tag WHERE user_id = $1 AND usage_count = 0',
      [userId]
    );

    return result.rowCount ?? 0;
  }

  async getTagsForTask(taskId: string, userId: string): Promise<Tag[]> {
    const result = await this.pool.query<TagRow>(
      `SELECT t.* FROM tag t
       JOIN task_tag tt ON t.id = tt.tag_id
       WHERE tt.task_id = $1 AND t.user_id = $2
       ORDER BY t.name ASC`,
      [taskId, userId]
    );

    return result.rows.map((row) => this.rowToTag(row));
  }

  async addTagToTask(taskId: string, tagId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO task_tag (task_id, tag_id, added_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (task_id, tag_id) DO NOTHING`,
      [taskId, tagId]
    );
  }

  async removeTagFromTask(taskId: string, tagId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM task_tag WHERE task_id = $1 AND tag_id = $2',
      [taskId, tagId]
    );
  }

  async setTagsForTask(taskId: string, tagIds: string[]): Promise<void> {
    // Remove all existing tags
    await this.pool.query('DELETE FROM task_tag WHERE task_id = $1', [taskId]);

    // Add new tags
    if (tagIds.length > 0) {
      const values = tagIds.map((_, i) => `($1, $${i + 2}, NOW())`).join(', ');
      await this.pool.query(
        `INSERT INTO task_tag (task_id, tag_id, added_at) VALUES ${values}`,
        [taskId, ...tagIds]
      );
    }
  }

  private rowToTag(row: TagRow): Tag {
    const data: TagData = {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      usageCount: row.usage_count,
      createdAt: row.created_at,
    };
    return Tag.fromData(data);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
