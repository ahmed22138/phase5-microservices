/**
 * Domain event types for Phase V Chatbot Task Management
 * All events follow the constitution requirement for domain event publishing
 */

export interface DomainEventMetadata {
  toolName: string;
  traceId?: string;
  spanId?: string;
  userId: string;
}

export interface BaseDomainEvent<T = unknown> {
  id: string;
  eventType: string;
  aggregateType: 'task' | 'reminder' | 'recurrence';
  aggregateId: string;
  userId: string;
  correlationId: string;
  timestamp: string;
  payload: T;
  metadata: DomainEventMetadata;
}

// Task Events
export interface TaskCreatedPayload {
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  tags?: string[];
  isRecurring: boolean;
}

export interface TaskPriorityChangedPayload {
  taskId: string;
  previousPriority: 'low' | 'medium' | 'high' | 'urgent';
  newPriority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface TaskTagsAddedPayload {
  taskId: string;
  addedTags: string[];
}

export interface TaskTagsRemovedPayload {
  taskId: string;
  removedTags: string[];
}

export interface TaskDueDateSetPayload {
  taskId: string;
  dueDate: string;
  previousDueDate?: string;
}

export interface TaskCompletedPayload {
  taskId: string;
  completedAt: string;
}

export interface TaskSearchedPayload {
  query?: string;
  filters: Record<string, unknown>;
  resultCount: number;
}

// Reminder Events
export interface ReminderCreatedPayload {
  reminderId: string;
  taskId: string;
  reminderTime: string;
}

export interface ReminderTriggeredPayload {
  reminderId: string;
  taskId: string;
}

export interface ReminderDeletedPayload {
  reminderId: string;
  taskId: string;
}

// Recurrence Events
export interface RecurrenceCreatedPayload {
  taskId: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  startDate: string;
  endDate?: string;
}

export interface RecurrenceTriggeredPayload {
  originalTaskId: string;
  newTaskId: string;
}

export interface RecurrenceModifiedPayload {
  taskId: string;
  previousPattern: Record<string, unknown>;
  newPattern: Record<string, unknown>;
}

export interface RecurrencePausedPayload {
  taskId: string;
}

export interface RecurrenceResumedPayload {
  taskId: string;
}

export interface RecurrenceStoppedPayload {
  taskId: string;
  reason: 'manual' | 'end_date_reached';
}

// Event type constants
export const EventTypes = {
  // Task events
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_COMPLETED: 'task.completed',
  TASK_PRIORITY_CHANGED: 'task.priority.changed',
  TASK_TAGS_ADDED: 'task.tags.added',
  TASK_TAGS_REMOVED: 'task.tags.removed',
  TASK_DUE_DATE_SET: 'task.dueDate.set',
  TASK_SEARCHED: 'task.searched',

  // Reminder events
  REMINDER_CREATED: 'reminder.created',
  REMINDER_TRIGGERED: 'reminder.triggered',
  REMINDER_DELETED: 'reminder.deleted',

  // Recurrence events
  RECURRENCE_CREATED: 'task.recurrence.created',
  RECURRENCE_TRIGGERED: 'task.recurrence.triggered',
  RECURRENCE_MODIFIED: 'task.recurrence.modified',
  RECURRENCE_PAUSED: 'task.recurrence.paused',
  RECURRENCE_RESUMED: 'task.recurrence.resumed',
  RECURRENCE_STOPPED: 'task.recurrence.stopped',
} as const;

// Topic constants
export const Topics = {
  TASK_EVENTS: 'task.events',
  REMINDER_EVENTS: 'reminder.events',
  RECURRENCE_EVENTS: 'recurrence.events',
} as const;
