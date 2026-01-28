/**
 * DomainEvent Repository
 * Implements event storage and query operations with TimescaleDB
 * Reference: data-model.md
 * Task: P5-T-090
 */

import pg from 'pg';
import {
  DomainEvent,
  DomainEventData,
  AggregateType,
  DomainEventMetadata,
} from '../domain/domain-event.js';

const { Pool } = pg;

interface EventRow {
  id: string;
  event_type: string;
  aggregate_type: AggregateType;
  aggregate_id: string;
  user_id: string;
  correlation_id: string;
  timestamp: Date;
  payload: Record<string, unknown>;
  metadata: DomainEventMetadata | null;
}

export interface EventFilter {
  eventType?: string;
  eventTypes?: string[];
  aggregateType?: AggregateType;
  aggregateId?: string;
  userId?: string;
  correlationId?: string;
  fromTimestamp?: Date;
  toTimestamp?: Date;
}

export interface EventPagination {
  limit?: number;
  offset?: number;
}

export interface EventQueryResult {
  events: DomainEvent[];
  total: number;
  limit: number;
  offset: number;
}

export class EventRepository {
  private readonly pool: pg.Pool;

  constructor(pool?: pg.Pool) {
    this.pool = pool ?? new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5435', 10),
      database: process.env.DB_NAME ?? 'audit_db',
      user: process.env.DB_USER ?? 'audit_user',
      password: process.env.DB_PASSWORD ?? 'audit_password',
    });
  }

  /**
   * Store a domain event
   */
  async store(event: DomainEvent): Promise<DomainEvent> {
    const data = event.toData();
    const result = await this.pool.query<EventRow>(
      `INSERT INTO domain_event (
        id, event_type, aggregate_type, aggregate_id,
        user_id, correlation_id, timestamp, payload, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        data.id,
        data.eventType,
        data.aggregateType,
        data.aggregateId,
        data.userId,
        data.correlationId,
        data.timestamp,
        JSON.stringify(data.payload),
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );

    const row = result.rows[0];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!row) {
      throw new Error('Failed to store event: no row returned');
    }
    return this.rowToEvent(row);
  }

  /**
   * Store multiple events in a batch
   */
  async storeBatch(events: DomainEvent[]): Promise<number> {
    if (events.length === 0) return 0;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const event of events) {
        const data = event.toData();
        await client.query(
          `INSERT INTO domain_event (
            id, event_type, aggregate_type, aggregate_id,
            user_id, correlation_id, timestamp, payload, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id, timestamp) DO NOTHING`,
          [
            data.id,
            data.eventType,
            data.aggregateType,
            data.aggregateId,
            data.userId,
            data.correlationId,
            data.timestamp,
            JSON.stringify(data.payload),
            data.metadata ? JSON.stringify(data.metadata) : null,
          ]
        );
      }

      await client.query('COMMIT');
      return events.length;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find event by ID
   */
  async findById(id: string): Promise<DomainEvent | null> {
    const result = await this.pool.query<EventRow>(
      'SELECT * FROM domain_event WHERE id = $1',
      [id]
    );

    const row = result.rows[0];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!row) {
      return null;
    }

    return this.rowToEvent(row);
  }

  /**
   * Query events with filters and pagination
   */
  async query(filter: EventFilter, pagination: EventPagination = {}): Promise<EventQueryResult> {
    const { limit = 50, offset = 0 } = pagination;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filter.eventType) {
      conditions.push(`event_type = $${String(paramIndex)}`);
      params.push(filter.eventType);
      paramIndex++;
    }

    if (filter.eventTypes && filter.eventTypes.length > 0) {
      conditions.push(`event_type = ANY($${String(paramIndex)})`);
      params.push(filter.eventTypes);
      paramIndex++;
    }

    if (filter.aggregateType) {
      conditions.push(`aggregate_type = $${String(paramIndex)}`);
      params.push(filter.aggregateType);
      paramIndex++;
    }

    if (filter.aggregateId) {
      conditions.push(`aggregate_id = $${String(paramIndex)}`);
      params.push(filter.aggregateId);
      paramIndex++;
    }

    if (filter.userId) {
      conditions.push(`user_id = $${String(paramIndex)}`);
      params.push(filter.userId);
      paramIndex++;
    }

    if (filter.correlationId) {
      conditions.push(`correlation_id = $${String(paramIndex)}`);
      params.push(filter.correlationId);
      paramIndex++;
    }

    if (filter.fromTimestamp) {
      conditions.push(`timestamp >= $${String(paramIndex)}`);
      params.push(filter.fromTimestamp);
      paramIndex++;
    }

    if (filter.toTimestamp) {
      conditions.push(`timestamp <= $${String(paramIndex)}`);
      params.push(filter.toTimestamp);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM domain_event ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    // Get events with pagination
    const eventsResult = await this.pool.query<EventRow>(
      `SELECT * FROM domain_event ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${String(paramIndex)} OFFSET $${String(paramIndex + 1)}`,
      [...params, limit, offset]
    );

    return {
      events: eventsResult.rows.map((row) => this.rowToEvent(row)),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get events for a specific aggregate (entity history)
   */
  async getAggregateHistory(
    aggregateType: AggregateType,
    aggregateId: string,
    pagination: EventPagination = {}
  ): Promise<EventQueryResult> {
    return this.query({ aggregateType, aggregateId }, pagination);
  }

  /**
   * Get events by correlation ID (request trace)
   */
  async getByCorrelationId(correlationId: string): Promise<DomainEvent[]> {
    const result = await this.pool.query<EventRow>(
      `SELECT * FROM domain_event
       WHERE correlation_id = $1
       ORDER BY timestamp ASC`,
      [correlationId]
    );

    return result.rows.map((row) => this.rowToEvent(row));
  }

  /**
   * Get event counts by type (for dashboards)
   */
  async getEventCounts(
    fromTimestamp: Date,
    toTimestamp: Date,
    groupBy: 'hour' | 'day' = 'hour'
  ): Promise<{ bucket: Date; eventType: string; count: number }[]> {
    const interval = groupBy === 'hour' ? '1 hour' : '1 day';

    const result = await this.pool.query<{
      bucket: Date;
      event_type: string;
      count: string;
    }>(
      `SELECT
        time_bucket($1::interval, timestamp) AS bucket,
        event_type,
        COUNT(*) as count
       FROM domain_event
       WHERE timestamp >= $2 AND timestamp <= $3
       GROUP BY bucket, event_type
       ORDER BY bucket DESC, event_type`,
      [interval, fromTimestamp, toTimestamp]
    );

    return result.rows.map((row) => ({
      bucket: row.bucket,
      eventType: row.event_type,
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * Get recent events
   */
  async getRecent(limit = 100): Promise<DomainEvent[]> {
    const result = await this.pool.query<EventRow>(
      `SELECT * FROM domain_event
       ORDER BY timestamp DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => this.rowToEvent(row));
  }

  private rowToEvent(row: EventRow): DomainEvent {
    const data: DomainEventData = {
      id: row.id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      userId: row.user_id,
      correlationId: row.correlation_id,
      timestamp: row.timestamp,
      payload: row.payload,
      metadata: row.metadata ?? undefined,
    };
    return new DomainEvent(data);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
