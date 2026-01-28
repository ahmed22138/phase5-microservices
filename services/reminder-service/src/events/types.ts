/**
 * Domain event types for Reminder Service
 */

export interface DomainEventMetadata {
  serviceName: string;
  traceId?: string;
  spanId?: string;
  trigger?: string;
}

export interface BaseDomainEvent<T = unknown> {
  id: string;
  eventType: string;
  aggregateType: 'reminder';
  aggregateId: string;
  userId: string;
  correlationId: string;
  timestamp: string;
  payload: T;
  metadata: DomainEventMetadata;
}

export const EventTypes = {
  REMINDER_CREATED: 'reminder.created',
  REMINDER_TRIGGERED: 'reminder.triggered',
  REMINDER_DELETED: 'reminder.deleted',
  REMINDER_CANCELLED: 'reminder.cancelled',
} as const;

export const Topics = {
  REMINDER_EVENTS: 'reminder.events',
} as const;

// Subscribed topics
export const SubscribedTopics = {
  TASK_EVENTS: 'task.events',
} as const;
