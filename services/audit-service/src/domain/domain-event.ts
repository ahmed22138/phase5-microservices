/**
 * DomainEvent Model
 * Represents a stored domain event for audit purposes
 * Reference: data-model.md
 * Task: P5-T-089
 */

import { v4 as uuidv4 } from 'uuid';

export type AggregateType = 'task' | 'reminder' | 'recurrence';

export interface DomainEventMetadata {
  serviceName?: string;
  toolName?: string;
  traceId?: string;
  spanId?: string;
  trigger?: string;
}

export interface DomainEventData {
  id: string;
  eventType: string;
  aggregateType: AggregateType;
  aggregateId: string;
  userId: string;
  correlationId: string;
  timestamp: Date;
  payload: Record<string, unknown>;
  metadata?: DomainEventMetadata;
}

export interface CreateDomainEventInput {
  eventType: string;
  aggregateType: AggregateType;
  aggregateId: string;
  userId: string;
  correlationId: string;
  timestamp?: Date;
  payload: Record<string, unknown>;
  metadata?: DomainEventMetadata;
}

export class DomainEvent {
  private readonly _id: string;
  private readonly _eventType: string;
  private readonly _aggregateType: AggregateType;
  private readonly _aggregateId: string;
  private readonly _userId: string;
  private readonly _correlationId: string;
  private readonly _timestamp: Date;
  private readonly _payload: Record<string, unknown>;
  private readonly _metadata?: DomainEventMetadata;

  constructor(data: CreateDomainEventInput | DomainEventData) {
    if ('id' in data) {
      // Existing event from DB
      this._id = data.id;
      this._eventType = data.eventType;
      this._aggregateType = data.aggregateType;
      this._aggregateId = data.aggregateId;
      this._userId = data.userId;
      this._correlationId = data.correlationId;
      this._timestamp = data.timestamp;
      this._payload = data.payload;
      this._metadata = data.metadata;
    } else {
      // New event
      this._id = uuidv4();
      this._eventType = data.eventType;
      this._aggregateType = data.aggregateType;
      this._aggregateId = data.aggregateId;
      this._userId = data.userId;
      this._correlationId = data.correlationId;
      this._timestamp = data.timestamp ?? new Date();
      this._payload = data.payload;
      this._metadata = data.metadata;
    }
  }

  // Getters
  get id(): string { return this._id; }
  get eventType(): string { return this._eventType; }
  get aggregateType(): AggregateType { return this._aggregateType; }
  get aggregateId(): string { return this._aggregateId; }
  get userId(): string { return this._userId; }
  get correlationId(): string { return this._correlationId; }
  get timestamp(): Date { return this._timestamp; }
  get payload(): Record<string, unknown> { return this._payload; }
  get metadata(): DomainEventMetadata | undefined { return this._metadata; }

  /**
   * Convert to plain data object
   */
  toData(): DomainEventData {
    return {
      id: this._id,
      eventType: this._eventType,
      aggregateType: this._aggregateType,
      aggregateId: this._aggregateId,
      userId: this._userId,
      correlationId: this._correlationId,
      timestamp: this._timestamp,
      payload: this._payload,
      metadata: this._metadata,
    };
  }

  /**
   * Convert to JSON-friendly format
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this._id,
      eventType: this._eventType,
      aggregateType: this._aggregateType,
      aggregateId: this._aggregateId,
      userId: this._userId,
      correlationId: this._correlationId,
      timestamp: this._timestamp.toISOString(),
      payload: this._payload,
      metadata: this._metadata,
    };
  }

  /**
   * Create from incoming Kafka event
   */
  static fromKafkaEvent(event: {
    id?: string;
    eventType: string;
    aggregateType: AggregateType;
    aggregateId: string;
    userId: string;
    correlationId: string;
    timestamp: string;
    payload: Record<string, unknown>;
    metadata?: DomainEventMetadata;
  }): DomainEvent {
    return new DomainEvent({
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      userId: event.userId,
      correlationId: event.correlationId,
      timestamp: new Date(event.timestamp),
      payload: event.payload,
      metadata: event.metadata,
    });
  }
}
