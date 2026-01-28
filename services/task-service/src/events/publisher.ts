/**
 * Dapr Event Publisher for Task Service
 */

import { DaprClient } from '@dapr/dapr';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import type { BaseDomainEvent, DomainEventMetadata } from './types';
import { Topics } from './types';

const logger = pino({ name: 'task-service-event-publisher' });

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
      daprPort: daprPort ?? process.env.DAPR_HTTP_PORT ?? '3501',
    });
    this.pubsubName = process.env.PUBSUB_NAME ?? 'pubsub';
  }

  async publishTaskEvent<T>(
    eventType: string,
    taskId: string,
    userId: string,
    payload: T,
    options: PublishOptions = {}
  ): Promise<void> {
    const correlationId = options.correlationId ?? uuidv4();
    const eventId = uuidv4();
    const timestamp = new Date().toISOString();

    const event: BaseDomainEvent<T> = {
      id: eventId,
      eventType,
      aggregateType: 'task',
      aggregateId: taskId,
      userId,
      correlationId,
      timestamp,
      payload,
      metadata: {
        serviceName: 'task-service',
        traceId: options.metadata?.traceId,
        spanId: options.metadata?.spanId,
      },
    };

    try {
      await this.daprClient.pubsub.publish(this.pubsubName, Topics.TASK_EVENTS, event);

      logger.info({
        eventId,
        eventType,
        taskId,
        correlationId,
      }, 'Task event published successfully');
    } catch (error) {
      logger.error({
        eventId,
        eventType,
        taskId,
        error,
      }, 'Failed to publish task event');
      throw error;
    }
  }
}

let publisherInstance: EventPublisher | null = null;

export function getEventPublisher(): EventPublisher {
  publisherInstance ??= new EventPublisher();
  return publisherInstance;
}
