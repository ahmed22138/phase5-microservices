# Feature Specification: Chatbot Task Management Extensions

**Feature Branch**: `001-chatbot-task-extensions`
**Created**: 2026-01-17
**Status**: Draft
**Input**: Extend Phase III chatbot with task priorities, tags, search/filter/sort, due dates, reminders, and recurring tasks

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set and Manage Task Priorities (Priority: P1)

A user wants to assign priority levels to tasks so they can focus on what matters most. They tell the chatbot to set a task as high priority, and later ask to see all high-priority tasks.

**Why this priority**: Priority is foundational for task triage. Without priorities, users cannot effectively manage workload. This feature enables all other organizational capabilities.

**Independent Test**: Can be fully tested by creating tasks with different priorities and querying by priority level. Delivers immediate value for workload management.

**Natural Language Examples**:
- "Set task 'Fix login bug' to high priority"
- "Make the deployment task urgent"
- "Change priority of task 5 to low"
- "What are my high priority tasks?"
- "Show me all urgent items"

**Required MCP Tool Changes**:
- `task.update`: Add `priority` parameter (enum: low, medium, high, urgent)
- `task.create`: Add optional `priority` parameter (default: medium)
- `task.list`: Add `priority` filter parameter

**Events Emitted**:
- `task.priority.changed` — payload: `{ taskId, previousPriority, newPriority, timestamp, correlationId }`

**Acceptance Scenarios**:

1. **Given** a task exists, **When** user says "set task X to high priority", **Then** the task priority updates to high and confirmation is returned
2. **Given** multiple tasks with different priorities, **When** user says "show my urgent tasks", **Then** only urgent-priority tasks are listed
3. **Given** a task with no explicit priority, **When** task is created, **Then** priority defaults to medium

---

### User Story 2 - Tag Tasks for Organization (Priority: P1)

A user wants to categorize tasks with custom tags to group related work. They can add multiple tags to a task and later filter tasks by tag.

**Why this priority**: Tags enable flexible categorization that complements priorities. Users can organize by project, context, or any custom taxonomy. Essential for managing diverse task types.

**Independent Test**: Can be fully tested by tagging tasks and filtering by tag. Delivers immediate value for task categorization.

**Natural Language Examples**:
- "Add tag 'backend' to task 3"
- "Tag the login task with 'security' and 'urgent-fix'"
- "Remove tag 'done' from task 7"
- "Show all tasks tagged 'frontend'"
- "What tags does task 5 have?"

**Required MCP Tool Changes**:
- `task.update`: Add `addTags` and `removeTags` array parameters
- `task.create`: Add optional `tags` array parameter
- `task.list`: Add `tags` filter parameter (match any/all)
- `tag.list`: New tool to list all tags in use

**Events Emitted**:
- `task.tags.added` — payload: `{ taskId, addedTags[], timestamp, correlationId }`
- `task.tags.removed` — payload: `{ taskId, removedTags[], timestamp, correlationId }`

**Acceptance Scenarios**:

1. **Given** a task exists, **When** user says "add tag 'backend' to task X", **Then** the tag is added and confirmation returned
2. **Given** tasks with various tags, **When** user says "show tasks tagged 'frontend'", **Then** only tasks with that tag are listed
3. **Given** a task has a tag, **When** user says "remove tag Y from task X", **Then** tag is removed and confirmation returned
4. **Given** multiple tags requested, **When** user says "tag task with A, B, C", **Then** all tags are added in one operation

---

### User Story 3 - Search, Filter, and Sort Tasks (Priority: P2)

A user wants to find specific tasks quickly using text search, apply filters to narrow results, and sort the output by various criteria.

**Why this priority**: Search and filtering builds on priorities and tags. Without the foundational metadata (P1 stories), there's less to search/filter. Enables power-user workflows.

**Independent Test**: Can be tested by creating tasks with varied content and applying search/filter/sort combinations. Delivers value for task discovery.

**Natural Language Examples**:
- "Search tasks for 'database migration'"
- "Find tasks containing 'API'"
- "Show tasks due this week sorted by priority"
- "List high priority backend tasks sorted by due date"
- "Filter tasks by tag 'frontend' and priority 'high'"

**Required MCP Tool Changes**:
- `task.search`: New tool with `query` (text search), `filters` (object), `sort` (field + direction)
- `task.list`: Add `sortBy` parameter (priority, dueDate, createdAt, title) and `sortOrder` (asc, desc)

**Events Emitted**:
- `task.searched` — payload: `{ query, filters, resultCount, timestamp, correlationId }` (for observability)

**Acceptance Scenarios**:

1. **Given** tasks exist with varied titles/descriptions, **When** user searches for a keyword, **Then** matching tasks are returned
2. **Given** tasks with priorities and tags, **When** user applies multiple filters, **Then** only tasks matching all criteria are returned
3. **Given** a task list, **When** user requests sorting by due date ascending, **Then** tasks are ordered earliest due date first
4. **Given** no matches found, **When** user searches, **Then** empty result with helpful message is returned

---

### User Story 4 - Set Due Dates and Receive Reminders (Priority: P2)

A user wants to assign due dates to tasks and receive reminders before deadlines. Reminders notify the user through the chatbot at configured intervals.

**Why this priority**: Due dates add time dimension to task management. Depends on basic task operations being solid. Enables deadline-driven workflows.

**Independent Test**: Can be tested by setting due dates and verifying reminder delivery at expected times. Delivers value for deadline management.

**Natural Language Examples**:
- "Set task 'Submit report' due Friday"
- "Make task 3 due tomorrow at 5pm"
- "Remind me about task 5 one day before it's due"
- "Set a reminder for the deployment task 2 hours before deadline"
- "What tasks are due this week?"
- "Show overdue tasks"

**Required MCP Tool Changes**:
- `task.update`: Add `dueDate` (ISO 8601 datetime) parameter
- `task.create`: Add optional `dueDate` parameter
- `reminder.create`: New tool with `taskId`, `reminderTime` (ISO 8601 or relative like "1 day before")
- `reminder.delete`: New tool to remove a reminder
- `reminder.list`: New tool to show reminders for a task or all tasks
- `task.list`: Add `dueBefore`, `dueAfter`, `overdue` filter parameters

**Events Emitted**:
- `task.dueDate.set` — payload: `{ taskId, dueDate, previousDueDate, timestamp, correlationId }`
- `reminder.created` — payload: `{ reminderId, taskId, reminderTime, timestamp, correlationId }`
- `reminder.triggered` — payload: `{ reminderId, taskId, timestamp, correlationId }`
- `reminder.deleted` — payload: `{ reminderId, taskId, timestamp, correlationId }`

**Acceptance Scenarios**:

1. **Given** a task exists, **When** user sets a due date, **Then** due date is stored and confirmation returned
2. **Given** a task with due date, **When** user creates a reminder, **Then** reminder is scheduled and confirmation returned
3. **Given** a reminder is due, **When** reminder time arrives, **Then** user receives notification through chatbot
4. **Given** tasks with various due dates, **When** user asks for overdue tasks, **Then** only past-due tasks are listed
5. **Given** natural language date input, **When** user says "due Friday", **Then** system interprets as next Friday and sets accordingly

---

### User Story 5 - Create Recurring Tasks (Priority: P3)

A user wants to create tasks that automatically regenerate on a schedule, such as weekly reports or daily standups. When a recurring task is completed, the next occurrence is created.

**Why this priority**: Recurring tasks are an advanced feature building on due dates. Requires robust date handling from P2. Enables automation of repetitive work.

**Independent Test**: Can be tested by creating a recurring task, completing it, and verifying the next occurrence is generated. Delivers value for routine task automation.

**Natural Language Examples**:
- "Create a recurring task 'Weekly standup' every Monday at 9am"
- "Make task 'Monthly report' repeat on the first of each month"
- "Set up a daily task to check deployments"
- "Stop the recurring task 'Old meeting'"
- "Show all my recurring tasks"
- "Change 'Weekly review' to occur every two weeks"

**Required MCP Tool Changes**:
- `task.create`: Add optional `recurrence` object with `frequency` (daily, weekly, monthly, yearly), `interval` (number), `daysOfWeek` (for weekly), `dayOfMonth` (for monthly), `endDate` (optional)
- `task.update`: Add `recurrence` parameter to modify or remove recurrence
- `recurrence.pause`: New tool to temporarily stop recurrence
- `recurrence.resume`: New tool to resume paused recurrence
- `task.list`: Add `recurring` boolean filter

**Events Emitted**:
- `task.recurrence.created` — payload: `{ taskId, recurrencePattern, timestamp, correlationId }`
- `task.recurrence.triggered` — payload: `{ originalTaskId, newTaskId, timestamp, correlationId }`
- `task.recurrence.modified` — payload: `{ taskId, previousPattern, newPattern, timestamp, correlationId }`
- `task.recurrence.stopped` — payload: `{ taskId, timestamp, correlationId }`

**Acceptance Scenarios**:

1. **Given** user requests recurring task, **When** chatbot processes request, **Then** task is created with recurrence pattern stored
2. **Given** recurring task is completed, **When** completion is processed, **Then** next occurrence is automatically created with updated due date
3. **Given** recurring task exists, **When** user modifies recurrence pattern, **Then** future occurrences follow new pattern
4. **Given** recurring task exists, **When** user stops recurrence, **Then** no further occurrences are generated
5. **Given** paused recurring task, **When** user resumes, **Then** recurrence continues from current date

---

### Edge Cases

- What happens when a due date is set in the past? System accepts but marks task as overdue immediately
- How does system handle invalid recurrence patterns (e.g., "every 0 days")? Returns validation error with corrective guidance
- What happens when user searches with empty query? Returns all tasks (equivalent to list)
- How does system handle timezone differences for due dates? All dates stored in UTC; displayed in user's configured timezone
- What happens when a recurring task's end date is reached? Final occurrence is created; recurrence stops; user notified
- How does system handle tag names with special characters? Tags are normalized (lowercase, alphanumeric + hyphens only)
- What happens when reminder time is after the due date? System warns user but allows it (user may want post-deadline follow-up)

## Requirements *(mandatory)*

### Functional Requirements

**Priority Management**:
- **FR-001**: System MUST support four priority levels: low, medium, high, urgent
- **FR-002**: System MUST default new tasks to medium priority if not specified
- **FR-003**: System MUST allow priority to be changed at any time via natural language

**Tag Management**:
- **FR-004**: System MUST support multiple tags per task (no limit)
- **FR-005**: System MUST normalize tag names to lowercase alphanumeric with hyphens
- **FR-006**: System MUST support adding and removing multiple tags in a single request
- **FR-007**: System MUST provide a way to list all tags currently in use

**Search, Filter, Sort**:
- **FR-008**: System MUST support full-text search across task titles and descriptions
- **FR-009**: System MUST support filtering by: priority, tags, due date range, overdue status, recurring status
- **FR-010**: System MUST support sorting by: priority, due date, creation date, title
- **FR-011**: System MUST support combining multiple filters in a single query

**Due Dates and Reminders**:
- **FR-012**: System MUST accept due dates in natural language (e.g., "tomorrow", "next Friday", "Jan 15")
- **FR-013**: System MUST store all dates in UTC and display in user's timezone
- **FR-014**: System MUST support multiple reminders per task
- **FR-015**: System MUST deliver reminders through the chatbot interface
- **FR-016**: System MUST support relative reminder times (e.g., "1 hour before", "1 day before")

**Recurring Tasks**:
- **FR-017**: System MUST support recurrence frequencies: daily, weekly, monthly, yearly
- **FR-018**: System MUST support custom intervals (e.g., every 2 weeks, every 3 months)
- **FR-019**: System MUST automatically create next occurrence when recurring task is completed
- **FR-020**: System MUST support optional end date for recurrence
- **FR-021**: System MUST allow pausing and resuming recurrence without deleting the pattern

**Event Publishing (Constitution Compliance)**:
- **FR-022**: All MCP tool invocations that modify task state MUST emit domain events via Dapr pub/sub
- **FR-023**: All events MUST include: tool name, timestamp, correlation ID, affected entity, outcome
- **FR-024**: Events MUST be published to Kafka exclusively through Dapr building blocks

**Chatbot Integration (Constitution Compliance)**:
- **FR-025**: All features MUST be accessible through natural language via the existing Phase III chatbot
- **FR-026**: System MUST NOT require users to learn new command syntax; natural language is primary interface
- **FR-027**: Chatbot MUST provide confirmation messages for all state-changing operations

### Key Entities

- **Task**: Core work item with title, description, priority, tags, due date, recurrence pattern, status
- **Tag**: Label for categorization; normalized name, usage count
- **Reminder**: Scheduled notification linked to a task; reminder time, delivery status
- **RecurrencePattern**: Definition of repetition; frequency, interval, constraints, end date
- **DomainEvent**: Audit record of state changes; event type, payload, timestamp, correlation ID

## Assumptions

- The existing Phase III chatbot supports extensible tool registration (MCP tools can be added)
- User timezone is available from existing user profile or session context
- Dapr sidecar is deployed alongside the chatbot service for pub/sub access
- Natural language understanding capabilities exist in the chatbot for date/time parsing
- The existing task entity can be extended with new fields without breaking changes

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can set task priority using natural language in under 5 seconds (end-to-end)
- **SC-002**: Users can filter tasks by any combination of priority, tags, and due date in a single query
- **SC-003**: Search results return within 2 seconds for task lists up to 10,000 items
- **SC-004**: Reminders are delivered within 1 minute of scheduled time (p95)
- **SC-005**: Recurring task next occurrence is created within 30 seconds of marking complete
- **SC-006**: 100% of state-changing operations emit corresponding domain events
- **SC-007**: All five features (priority, tags, search, due dates, recurring) are accessible via chatbot natural language
- **SC-008**: Zero breaking changes to existing Phase III chatbot commands and responses
- **SC-009**: System handles 1,000 concurrent users managing tasks without degradation
- **SC-010**: 90% of users successfully complete a task organization workflow on first attempt
