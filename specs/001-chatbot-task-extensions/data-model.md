# Phase 1: Data Model

**Feature**: Chatbot Task Management Extensions
**Branch**: `001-chatbot-task-extensions`
**Date**: 2026-01-17

## Overview

This document defines the canonical data model for the task management extension. Each entity is owned by a specific service per the data ownership rules in `research.md`.

---

## Entity: Task

**Owner**: Task Service
**Storage**: PostgreSQL (task_db)

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, immutable | Unique task identifier |
| `userId` | UUID | NOT NULL, indexed | Owner of the task |
| `title` | String | NOT NULL, max 500 chars | Task title |
| `description` | String | nullable, max 5000 chars | Detailed description |
| `priority` | Enum | NOT NULL, default: MEDIUM | low, medium, high, urgent |
| `status` | Enum | NOT NULL, default: PENDING | pending, in_progress, completed, cancelled |
| `dueDate` | Timestamp | nullable, UTC | When task is due |
| `createdAt` | Timestamp | NOT NULL, UTC | Creation timestamp |
| `updatedAt` | Timestamp | NOT NULL, UTC | Last modification timestamp |
| `completedAt` | Timestamp | nullable, UTC | When task was completed |
| `isRecurring` | Boolean | NOT NULL, default: false | Has active recurrence pattern |
| `parentTaskId` | UUID | nullable, FK→Task | For recurring instances, links to template task |

### Validation Rules

- `title` MUST NOT be empty or whitespace-only
- `dueDate` MAY be in the past (task marked overdue)
- `completedAt` MUST be set when status changes to `completed`
- `parentTaskId` MUST reference existing task if set

### State Transitions

```
PENDING → IN_PROGRESS → COMPLETED
    ↓         ↓
CANCELLED  CANCELLED
```

---

## Entity: Tag

**Owner**: Task Service
**Storage**: PostgreSQL (task_db)

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, immutable | Unique tag identifier |
| `userId` | UUID | NOT NULL, indexed | Owner of the tag |
| `name` | String | NOT NULL, max 50 chars | Normalized tag name |
| `usageCount` | Integer | NOT NULL, default: 0 | Number of tasks using this tag |
| `createdAt` | Timestamp | NOT NULL, UTC | Creation timestamp |

### Validation Rules

- `name` MUST be normalized: lowercase, alphanumeric + hyphens only
- `name` MUST be unique per user (userId + name is unique constraint)
- `usageCount` MUST be non-negative

### Normalization Rules

| Input | Normalized |
|-------|------------|
| "Backend" | "backend" |
| "Urgent Fix" | "urgent-fix" |
| "API_v2" | "api-v2" |
| "@special!" | "special" |

---

## Entity: TaskTag (Join Table)

**Owner**: Task Service
**Storage**: PostgreSQL (task_db)

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `taskId` | UUID | PK, FK→Task | Task reference |
| `tagId` | UUID | PK, FK→Tag | Tag reference |
| `addedAt` | Timestamp | NOT NULL, UTC | When tag was added to task |

### Constraints

- Composite PK on (taskId, tagId)
- ON DELETE CASCADE for both foreign keys

---

## Entity: Reminder

**Owner**: Reminder Service
**Storage**: PostgreSQL (reminder_db)

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, immutable | Unique reminder identifier |
| `taskId` | UUID | NOT NULL, indexed | Associated task (external reference) |
| `userId` | UUID | NOT NULL, indexed | Owner of the reminder |
| `reminderTime` | Timestamp | NOT NULL, UTC, indexed | When to trigger |
| `status` | Enum | NOT NULL, default: PENDING | pending, triggered, cancelled |
| `triggeredAt` | Timestamp | nullable, UTC | When reminder was actually sent |
| `createdAt` | Timestamp | NOT NULL, UTC | Creation timestamp |

### Validation Rules

- `reminderTime` MAY be in the past (will trigger immediately)
- `triggeredAt` MUST be set when status changes to `triggered`
- Only one `pending` reminder per (taskId, reminderTime) combination

### State Transitions

```
PENDING → TRIGGERED
    ↓
CANCELLED
```

---

## Entity: RecurrencePattern

**Owner**: Recurrence Service
**Storage**: PostgreSQL (recurrence_db)

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, immutable | Unique pattern identifier |
| `taskId` | UUID | NOT NULL, unique, indexed | Template task (external reference) |
| `userId` | UUID | NOT NULL, indexed | Owner |
| `frequency` | Enum | NOT NULL | daily, weekly, monthly, yearly |
| `interval` | Integer | NOT NULL, default: 1, min: 1 | Every N frequency units |
| `daysOfWeek` | Array[Integer] | nullable | 0-6 (Sun-Sat) for weekly |
| `dayOfMonth` | Integer | nullable, 1-31 | For monthly frequency |
| `startDate` | Timestamp | NOT NULL, UTC | Pattern start |
| `endDate` | Timestamp | nullable, UTC | Pattern end (optional) |
| `nextRunAt` | Timestamp | NOT NULL, UTC, indexed | Next scheduled generation |
| `status` | Enum | NOT NULL, default: ACTIVE | active, paused, completed |
| `lastTriggeredAt` | Timestamp | nullable, UTC | Last instance generated |
| `createdAt` | Timestamp | NOT NULL, UTC | Creation timestamp |
| `updatedAt` | Timestamp | NOT NULL, UTC | Last modification |

### Validation Rules

- `interval` MUST be >= 1
- `daysOfWeek` MUST contain values 0-6 only; required if frequency = weekly
- `dayOfMonth` MUST be 1-31; required if frequency = monthly
- `endDate` MUST be after `startDate` if set
- `nextRunAt` MUST be calculated based on frequency and interval

### State Transitions

```
ACTIVE ↔ PAUSED
   ↓
COMPLETED (when endDate reached)
```

### Frequency Calculation Examples

| Frequency | Interval | Additional | Next Run Logic |
|-----------|----------|------------|----------------|
| daily | 1 | - | +1 day |
| daily | 3 | - | +3 days |
| weekly | 1 | daysOfWeek: [1,3,5] | Next Mon/Wed/Fri |
| weekly | 2 | daysOfWeek: [1] | Every other Monday |
| monthly | 1 | dayOfMonth: 15 | 15th of next month |
| yearly | 1 | dayOfMonth: 1 | Same date next year |

---

## Entity: DomainEvent

**Owner**: Audit Service
**Storage**: TimescaleDB (audit_db)

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, immutable | Unique event identifier |
| `eventType` | String | NOT NULL, indexed | e.g., "task.created", "reminder.triggered" |
| `aggregateType` | String | NOT NULL, indexed | Entity type: task, reminder, recurrence |
| `aggregateId` | UUID | NOT NULL, indexed | Entity ID |
| `userId` | UUID | NOT NULL, indexed | Actor who triggered event |
| `correlationId` | UUID | NOT NULL, indexed | Request correlation |
| `timestamp` | Timestamp | NOT NULL, UTC, indexed | Event time |
| `payload` | JSONB | NOT NULL | Event-specific data |
| `metadata` | JSONB | nullable | Additional context (tool name, trace ID) |

### Partitioning

- Time-series partitioned by `timestamp` (monthly partitions)
- Retention policy: 90 days hot, archive to cold storage

### Event Types

| Event Type | Aggregate | Trigger |
|------------|-----------|---------|
| `task.created` | task | task.create tool |
| `task.updated` | task | task.update tool |
| `task.completed` | task | task.update (status→completed) |
| `task.priority.changed` | task | task.update (priority change) |
| `task.tags.added` | task | task.update (addTags) |
| `task.tags.removed` | task | task.update (removeTags) |
| `task.dueDate.set` | task | task.update (dueDate) |
| `task.searched` | task | task.search tool |
| `reminder.created` | reminder | reminder.create tool |
| `reminder.triggered` | reminder | Reminder service scheduler |
| `reminder.deleted` | reminder | reminder.delete tool |
| `task.recurrence.created` | recurrence | task.create (with recurrence) |
| `task.recurrence.triggered` | recurrence | Recurrence service scheduler |
| `task.recurrence.modified` | recurrence | task.update (recurrence change) |
| `task.recurrence.paused` | recurrence | recurrence.pause tool |
| `task.recurrence.resumed` | recurrence | recurrence.resume tool |
| `task.recurrence.stopped` | recurrence | recurrence stop or endDate reached |

---

## Entity Relationships

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    Task     │──────<│   TaskTag   │>──────│     Tag     │
│  (task_db)  │       │  (task_db)  │       │  (task_db)  │
└──────┬──────┘       └─────────────┘       └─────────────┘
       │
       │ taskId (external ref)
       │
       ├──────────────────────────────────────────────┐
       │                                              │
       ▼                                              ▼
┌─────────────┐                              ┌─────────────────┐
│  Reminder   │                              │RecurrencePattern│
│(reminder_db)│                              │ (recurrence_db) │
└─────────────┘                              └─────────────────┘
       │                                              │
       │ Events                                       │ Events
       ▼                                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       DomainEvent                            │
│                       (audit_db)                             │
└─────────────────────────────────────────────────────────────┘
```

**Note**: Cross-database references (taskId in Reminder and RecurrencePattern) are logical references, not foreign keys. Consistency is maintained through events.

---

## Indexes

### Task Service (task_db)

```sql
-- Task indexes
CREATE INDEX idx_task_user_status ON task(userId, status);
CREATE INDEX idx_task_user_priority ON task(userId, priority);
CREATE INDEX idx_task_user_due ON task(userId, dueDate) WHERE dueDate IS NOT NULL;
CREATE INDEX idx_task_fulltext ON task USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- Tag indexes
CREATE UNIQUE INDEX idx_tag_user_name ON tag(userId, name);

-- TaskTag indexes (composite PK serves as index)
CREATE INDEX idx_tasktag_tag ON task_tag(tagId);
```

### Reminder Service (reminder_db)

```sql
CREATE INDEX idx_reminder_user ON reminder(userId);
CREATE INDEX idx_reminder_task ON reminder(taskId);
CREATE INDEX idx_reminder_pending ON reminder(reminderTime, status) WHERE status = 'PENDING';
```

### Recurrence Service (recurrence_db)

```sql
CREATE UNIQUE INDEX idx_recurrence_task ON recurrence_pattern(taskId);
CREATE INDEX idx_recurrence_next ON recurrence_pattern(nextRunAt, status) WHERE status = 'ACTIVE';
```

### Audit Service (audit_db)

```sql
-- TimescaleDB hypertable with automatic partitioning
CREATE INDEX idx_event_correlation ON domain_event(correlationId);
CREATE INDEX idx_event_aggregate ON domain_event(aggregateType, aggregateId);
CREATE INDEX idx_event_user ON domain_event(userId);
CREATE INDEX idx_event_type ON domain_event(eventType);
```
