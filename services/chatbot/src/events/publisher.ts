/**
 * Dapr Event Publisher for Chatbot Service
 * Implements constitution requirement: All MCP tools emit domain events via Dapr pub/sub
 */

import { DaprClient } from '@dapr/dapr';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import type { BaseDomainEvent, DomainEventMetadata } from './types.js';
import { Topics } from './types.js';

const logger = pino({ name: 'chatbot-event-publisher' });

export interface PublishOptions {
  correlationId?: string;
  metadata?: Partial<DomainEventMetadata>;
}

export class EventPublisher {
  private readonly daprClient: DaprClient;
  private readonly pubsubName: string;

  constructor(daprHost?: string, daprPort?: string) {
    this.daprClient = new DaprClient({
      daprHost: daprHost ?? process.env.DAPR_HOST ?? 'localhost',
      daprPort: daprPort ?? process.env.DAPR_HTTP_PORT ?? '3500',
    });
    this.pubsubName = process.env.PUBSUB_NAME ?? 'pubsub';
  }

  /**
   * Publish a domain event to Kafka via Dapr
   */
  async publish(
    eventType: string,
    aggregateType: 'task' | 'reminder' | 'recurrence',
    aggregateId: string,
    userId: string,
    payload: unknown,
    options: PublishOptions = {}
  ): Promise<void> {
    const correlationId = options.correlationId ?? uuidv4();
    const eventId = uuidv4();
    const timestamp = new Date().toISOString();

    const event: BaseDomainEvent = {
      id: eventId,
      eventType,
      aggregateType,
      aggregateId,
      userId,
      correlationId,
      timestamp,
      payload,
      metadata: {
        toolName: options.metadata?.toolName ?? 'unknown',
        traceId: options.metadata?.traceId,
        spanId: options.metadata?.spanId,
        userId,
      },
    };

    // Determine topic based on aggregate type
    const topic = this.getTopicForAggregate(aggregateType);

    try {
      await this.daprClient.pubsub.publish(this.pubsubName, topic, event);

      logger.info({
        eventId,
        eventType,
        aggregateType,
        aggregateId,
        topic,
        correlationId,
      }, 'Event published successfully');
    } catch (error) {
      logger.error({
        eventId,
        eventType,
        aggregateType,
        aggregateId,
        topic,
        error,
      }, 'Failed to publish event');
      throw error;
    }
  }

  /**
   * Publish a task domain event
   */
  async publishTaskEvent(
    eventType: string,
    taskId: string,
    userId: string,
    payload: unknown,
    options: PublishOptions = {}
  ): Promise<void> {
    return this.publish(eventType, 'task', taskId, userId, payload, options);
  }

  /**
   * Publish a reminder domain event
   */
  async publishReminderEvent(
    eventType: string,
    reminderId: string,
    userId: string,
    payload: unknown,
    options: PublishOptions = {}
  ): Promise<void> {
    return this.publish(eventType, 'reminder', reminderId, userId, payload, options);
  }

  /**
   * Publish a recurrence domain event
   */
  async publishRecurrenceEvent(
    eventType: string,
    taskId: string,
    userId: string,
    payload: unknown,
    options: PublishOptions = {}
  ): Promise<void> {
    return this.publish(eventType, 'recurrence', taskId, userId, payload, options);
  }

  private getTopicForAggregate(aggregateType: 'task' | 'reminder' | 'recurrence'): string {
    switch (aggregateType) {
      case 'task':
        return Topics.TASK_EVENTS;
      case 'reminder':
        return Topics.REMINDER_EVENTS;
      case 'recurrence':
        return Topics.RECURRENCE_EVENTS;
      default:
        return Topics.TASK_EVENTS;
    }
  }
}

// Singleton instance
let publisherInstance: EventPublisher | null = null;

export function getEventPublisher(): EventPublisher {
  publisherInstance ??= new EventPublisher();
  return publisherInstance;
}
