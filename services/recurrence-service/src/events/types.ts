/**
 * Domain event types for Recurrence Service
 */

export interface DomainEventMetadata {
  serviceName: string;
  traceId?: string;
  spanId?: string;
  trigger?: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface BaseDomainEvent<T = unknown> {
  id: string;
  eventType: string;
  aggregateType: 'recurrence';
  aggregateId: string;
  userId: string;
  correlationId: string;
  timestamp: string;
  payload: T;
  metadata: DomainEventMetadata;
}

export const EventTypes = {
  RECURRENCE_CREATED: 'task.recurrence.created',
  RECURRENCE_TRIGGERED: 'task.recurrence.triggered',
  RECURRENCE_MODIFIED: 'task.recurrence.modified',
  RECURRENCE_PAUSED: 'task.recurrence.paused',
  RECURRENCE_RESUMED: 'task.recurrence.resumed',
  RECURRENCE_STOPPED: 'task.recurrence.stopped',
} as const;

export const Topics = {
  RECURRENCE_EVENTS: 'recurrence.events',
} as const;

// Subscribed topics
export const SubscribedTopics = {
  TASK_EVENTS: 'task.events',
} as const;
