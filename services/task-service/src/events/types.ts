/**
 * Domain event types for Task Service
 */

export interface DomainEventMetadata {
  serviceName: string;
  traceId?: string;
  spanId?: string;
}

export interface BaseDomainEvent<T = unknown> {
  id: string;
  eventType: string;
  aggregateType: 'task';
  aggregateId: string;
  userId: string;
  correlationId: string;
  timestamp: string;
  payload: T;
  metadata: DomainEventMetadata;
}

// Event type constants
export const EventTypes = {
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_COMPLETED: 'task.completed',
  TASK_PRIORITY_CHANGED: 'task.priority.changed',
  TASK_TAGS_ADDED: 'task.tags.added',
  TASK_TAGS_REMOVED: 'task.tags.removed',
  TASK_DUE_DATE_SET: 'task.dueDate.set',
  TASK_DELETED: 'task.deleted',
} as const;

export const Topics = {
  TASK_EVENTS: 'task.events',
} as const;
