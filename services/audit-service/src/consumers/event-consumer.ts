/**
 * Unified Event Consumer
 * Consumes events from all topics (task, reminder, recurrence) and stores them
 * Reference: plan.md Event Flow
 * Task: P5-T-091, P5-T-092, P5-T-093
 */

import { DaprServer, CommunicationProtocolEnum } from '@dapr/dapr';
import { DomainEvent, AggregateType } from '../domain/domain-event.js';
import { EventRepository } from '../persistence/event-repository.js';
import pino from 'pino';

const logger = pino({ name: 'event-consumer' });

// Topics to subscribe to
const TOPICS = {
  TASK_EVENTS: 'task.events',
  REMINDER_EVENTS: 'reminder.events',
  RECURRENCE_EVENTS: 'recurrence.events',
} as const;

// Map topic to aggregate type (used for dynamic routing if needed)
const _TOPIC_TO_AGGREGATE: Record<string, AggregateType> = {
  [TOPICS.TASK_EVENTS]: 'task',
  [TOPICS.REMINDER_EVENTS]: 'reminder',
  [TOPICS.RECURRENCE_EVENTS]: 'recurrence',
};

interface IncomingEvent {
  id?: string;
  eventType: string;
  aggregateType?: AggregateType;
  aggregateId: string;
  userId: string;
  correlationId: string;
  timestamp: string;
  payload: Record<string, unknown>;
  metadata?: {
    serviceName?: string;
    toolName?: string;
    traceId?: string;
    spanId?: string;
    trigger?: string;
  };
}

export class EventConsumer {
  private readonly daprServer: DaprServer;
  private readonly eventRepository: EventRepository;
  private readonly pubsubName: string;
  private isRunning = false;
  private eventCount = 0;
  private errorCount = 0;

  constructor(eventRepository?: EventRepository) {
    this.eventRepository = eventRepository ?? new EventRepository();

    this.daprServer = new DaprServer({
      serverHost: process.env.SERVER_HOST ?? '127.0.0.1',
      serverPort: process.env.DAPR_APP_PORT ?? '3015', // Different port for Dapr subscriptions
      communicationProtocol: CommunicationProtocolEnum.HTTP,
      clientOptions: {
        daprHost: process.env.DAPR_HOST ?? 'localhost',
        daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
      },
    });

    this.pubsubName = process.env.PUBSUB_NAME ?? 'pubsub';
  }

  /**
   * Start consuming events from all topics
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Event consumer already running');
      return;
    }

    logger.info('Starting event consumer');

    // Subscribe to task.events (P5-T-091)
    await this.daprServer.pubsub.subscribe(
      this.pubsubName,
      TOPICS.TASK_EVENTS,
      async (event: IncomingEvent) => {
        await this.handleEvent(event, 'task');
      }
    );

    // Subscribe to reminder.events (P5-T-092)
    await this.daprServer.pubsub.subscribe(
      this.pubsubName,
      TOPICS.REMINDER_EVENTS,
      async (event: IncomingEvent) => {
        await this.handleEvent(event, 'reminder');
      }
    );

    // Subscribe to recurrence.events (P5-T-093)
    await this.daprServer.pubsub.subscribe(
      this.pubsubName,
      TOPICS.RECURRENCE_EVENTS,
      async (event: IncomingEvent) => {
        await this.handleEvent(event, 'recurrence');
      }
    );

    await this.daprServer.start();
    this.isRunning = true;

    logger.info({
      pubsub: this.pubsubName,
      topics: Object.values(TOPICS),
    }, 'Event consumer started - subscribed to all topics');
  }

  /**
   * Stop the consumer
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info({
      eventCount: this.eventCount,
      errorCount: this.errorCount,
    }, 'Stopping event consumer');

    await this.daprServer.stop();
    this.isRunning = false;
  }

  /**
   * Handle an incoming event
   */
  private async handleEvent(event: IncomingEvent, defaultAggregateType: AggregateType): Promise<void> {
    const startTime = Date.now();

    try {
      // Determine aggregate type
      const aggregateType = event.aggregateType ?? defaultAggregateType;

      // Create domain event
      const domainEvent = new DomainEvent({
        eventType: event.eventType,
        aggregateType,
        aggregateId: event.aggregateId,
        userId: event.userId,
        correlationId: event.correlationId,
        timestamp: new Date(event.timestamp),
        payload: event.payload,
        metadata: event.metadata,
      });

      // Store the event
      await this.eventRepository.store(domainEvent);

      this.eventCount++;
      const duration = Date.now() - startTime;

      logger.info({
        eventId: domainEvent.id,
        eventType: event.eventType,
        aggregateType,
        aggregateId: event.aggregateId,
        correlationId: event.correlationId,
        duration,
      }, 'Event stored');
    } catch (error) {
      this.errorCount++;

      logger.error({
        error,
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        correlationId: event.correlationId,
      }, 'Failed to store event');

      // Don't throw - we don't want to nack the message and cause infinite retries
      // The error is logged for observability
    }
  }

  /**
   * Get consumer statistics
   */
  getStats(): { eventCount: number; errorCount: number; isRunning: boolean } {
    return {
      eventCount: this.eventCount,
      errorCount: this.errorCount,
      isRunning: this.isRunning,
    };
  }
}

// Singleton instance
let consumerInstance: EventConsumer | null = null;

export function getEventConsumer(): EventConsumer {
  consumerInstance ??= new EventConsumer();
  return consumerInstance;
}
