# Tasks: Phase V Chatbot Task Management Extensions

**Input**: Design documents from `/specs/001-chatbot-task-extensions/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/
**Branch**: `001-chatbot-task-extensions`
**Date**: 2026-01-17

## Task ID Format

`P5-T-XXX` where P5 = Phase V, T = Task, XXX = sequential number

## Path Conventions

- **Chatbot**: `services/chatbot/src/`
- **Task Service**: `services/task-service/src/`
- **Reminder Service**: `services/reminder-service/src/`
- **Recurrence Service**: `services/recurrence-service/src/`
- **Audit Service**: `services/audit-service/src/`
- **Infrastructure**: `infrastructure/`

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Initialize service projects and shared infrastructure

- [x] P5-T-001 Create microservices directory structure per plan.md in services/
- [x] P5-T-002 [P] Initialize chatbot service TypeScript project in services/chatbot/
- [x] P5-T-003 [P] Initialize task-service TypeScript project in services/task-service/
- [x] P5-T-004 [P] Initialize reminder-service TypeScript project in services/reminder-service/
- [x] P5-T-005 [P] Initialize recurrence-service TypeScript project in services/recurrence-service/
- [x] P5-T-006 [P] Initialize audit-service TypeScript project in services/audit-service/
- [x] P5-T-007 Create infrastructure directory structure in infrastructure/
- [x] P5-T-008 [P] Configure shared ESLint and Prettier in root package.json
- [x] P5-T-009 [P] Create docker-compose.yaml for local development in infrastructure/docker/

**Checkpoint**: All service scaffolds created, ready for foundational infrastructure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### 2.1 Database Setup

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-010 | Create Task Service database schema migrations in services/task-service/src/persistence/migrations/ | P5-T-003 | Task Service | Task, Tag, TaskTag tables | Data Model |
| P5-T-011 | [P] Create Reminder Service database schema migrations in services/reminder-service/src/persistence/migrations/ | P5-T-004 | Reminder Service | Reminder table | Data Model |
| P5-T-012 | [P] Create Recurrence Service database schema migrations in services/recurrence-service/src/persistence/migrations/ | P5-T-005 | Recurrence Service | RecurrencePattern table | Data Model |
| P5-T-013 | [P] Create Audit Service database schema migrations in services/audit-service/src/persistence/migrations/ | P5-T-006 | Audit Service | DomainEvent hypertable | Data Model |

### 2.2 Dapr & Kafka Integration

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-014 | Create Dapr pub/sub component configuration for Kafka in infrastructure/dapr/components/pubsub.yaml | P5-T-007 | Infrastructure | Kafka pub/sub config | Architecture Constraints |
| P5-T-015 | Create Dapr resiliency policy configuration in infrastructure/dapr/components/resiliency.yaml | P5-T-014 | Infrastructure | Circuit breaker, retry policies | Quality Gates |
| P5-T-016 | Create Dapr configuration file in infrastructure/dapr/configuration/config.yaml | P5-T-014 | Infrastructure | Dapr runtime config | Deployment Topology |

### 2.3 Event Publishing Infrastructure

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-017 | Implement Dapr event publisher utility in services/chatbot/src/events/publisher.ts | P5-T-014 | Chatbot | Event publishing module | Event Flow |
| P5-T-018 | [P] Implement Dapr event publisher utility in services/task-service/src/events/publisher.ts | P5-T-014 | Task Service | Event publishing module | Event Flow |
| P5-T-019 | [P] Implement Dapr event publisher utility in services/reminder-service/src/events/publisher.ts | P5-T-014 | Reminder Service | Event publishing module | Event Flow |
| P5-T-020 | [P] Implement Dapr event publisher utility in services/recurrence-service/src/events/publisher.ts | P5-T-014 | Recurrence Service | Event publishing module | Event Flow |

### 2.4 Health Checks & Observability

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-021 | Implement health check endpoints (liveness/readiness) in services/chatbot/src/api/health.ts | P5-T-002 | Chatbot | /health, /ready endpoints | Quality Gates |
| P5-T-022 | [P] Implement health check endpoints in services/task-service/src/api/health.ts | P5-T-003 | Task Service | /health, /ready endpoints | Quality Gates |
| P5-T-023 | [P] Implement health check endpoints in services/reminder-service/src/api/health.ts | P5-T-004 | Reminder Service | /health, /ready endpoints | Quality Gates |
| P5-T-024 | [P] Implement health check endpoints in services/recurrence-service/src/api/health.ts | P5-T-005 | Recurrence Service | /health, /ready endpoints | Quality Gates |
| P5-T-025 | [P] Implement health check endpoints in services/audit-service/src/api/health.ts | P5-T-006 | Audit Service | /health, /ready endpoints | Quality Gates |
| P5-T-026 | Configure structured JSON logging for all services in shared logging config | P5-T-001 | All Services | Structured logging | Quality Gates |
| P5-T-027 | Configure OpenTelemetry tracing instrumentation in shared tracing config | P5-T-026 | All Services | Distributed tracing | Quality Gates |

### 2.5 Base Models

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-028 | Implement Task domain model in services/task-service/src/domain/task.ts | P5-T-010 | Task Service | Task entity with validation | Data Model |
| P5-T-029 | [P] Implement Tag domain model in services/task-service/src/domain/tag.ts | P5-T-010 | Task Service | Tag entity with normalization | Data Model |
| P5-T-030 | Implement Task repository in services/task-service/src/persistence/task-repository.ts | P5-T-028 | Task Service | Task CRUD operations | Data Model |
| P5-T-031 | [P] Implement Tag repository in services/task-service/src/persistence/tag-repository.ts | P5-T-029 | Task Service | Tag CRUD operations | Data Model |

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Task Priorities (Priority: P1) 🎯 MVP

**Goal**: Users can set and filter tasks by priority level (low, medium, high, urgent)

**Independent Test**: Create tasks with different priorities, query by priority level

### Implementation for US1

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-032 | [US1] Add priority field handling to Task domain model in services/task-service/src/domain/task.ts | P5-T-028 | Task Service | Priority enum, default medium | FR-001, FR-002 |
| P5-T-033 | [US1] Implement priority filter in Task repository in services/task-service/src/persistence/task-repository.ts | P5-T-032 | Task Service | Filter by priority | FR-003 |
| P5-T-034 | [US1] Implement Task Service API endpoints for priority in services/task-service/src/api/tasks.ts | P5-T-033 | Task Service | PATCH /tasks/{id} with priority | Contracts |
| P5-T-035 | [US1] Implement task.create MCP tool with priority parameter in services/chatbot/src/tools/task/create.ts | P5-T-034 | Chatbot | MCP tool registration | MCP Tools |
| P5-T-036 | [US1] Implement task.update MCP tool with priority parameter in services/chatbot/src/tools/task/update.ts | P5-T-034 | Chatbot | MCP tool registration | MCP Tools |
| P5-T-037 | [US1] Implement task.list MCP tool with priority filter in services/chatbot/src/tools/task/list.ts | P5-T-034 | Chatbot | MCP tool registration | MCP Tools |
| P5-T-038 | [US1] Emit task.priority.changed event from task.update tool in services/chatbot/src/tools/task/update.ts | P5-T-017, P5-T-036 | Chatbot | Domain event published | FR-022 |

**Checkpoint**: Priority management fully functional via chatbot

---

## Phase 4: User Story 2 - Tags (Priority: P1)

**Goal**: Users can categorize tasks with custom tags and filter by tag

**Independent Test**: Add tags to tasks, filter tasks by tag

### Implementation for US2

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-039 | [US2] Implement TaskTag join table operations in services/task-service/src/persistence/task-tag-repository.ts | P5-T-010 | Task Service | Tag association CRUD | Data Model |
| P5-T-040 | [US2] Implement tag normalization utility in services/task-service/src/domain/tag-normalizer.ts | P5-T-029 | Task Service | Lowercase, alphanumeric, hyphens | FR-005 |
| P5-T-041 | [US2] Implement addTags/removeTags in Task Service API in services/task-service/src/api/tasks.ts | P5-T-039, P5-T-040 | Task Service | PATCH /tasks/{id} with tags | Contracts |
| P5-T-042 | [US2] Implement tag filter in Task repository in services/task-service/src/persistence/task-repository.ts | P5-T-039 | Task Service | Filter by tags (any/all) | FR-009 |
| P5-T-043 | [US2] Implement tag.list API endpoint in services/task-service/src/api/tags.ts | P5-T-031 | Task Service | GET /tags | Contracts |
| P5-T-044 | [US2] Extend task.create MCP tool with tags parameter in services/chatbot/src/tools/task/create.ts | P5-T-041 | Chatbot | Tags in creation | MCP Tools |
| P5-T-045 | [US2] Extend task.update MCP tool with addTags/removeTags in services/chatbot/src/tools/task/update.ts | P5-T-041 | Chatbot | Tag management | MCP Tools |
| P5-T-046 | [US2] Extend task.list MCP tool with tags filter in services/chatbot/src/tools/task/list.ts | P5-T-042 | Chatbot | Filter by tags | MCP Tools |
| P5-T-047 | [US2] Implement tag.list MCP tool in services/chatbot/src/tools/tag/list.ts | P5-T-043 | Chatbot | List all tags | MCP Tools |
| P5-T-048 | [US2] Emit task.tags.added event from task.update tool in services/chatbot/src/tools/task/update.ts | P5-T-045 | Chatbot | Domain event published | FR-022 |
| P5-T-049 | [US2] Emit task.tags.removed event from task.update tool in services/chatbot/src/tools/task/update.ts | P5-T-045 | Chatbot | Domain event published | FR-022 |

**Checkpoint**: Tag management fully functional via chatbot

---

## Phase 5: User Story 3 - Search, Filter, Sort (Priority: P2)

**Goal**: Users can search tasks by text, apply combined filters, and sort results

**Independent Test**: Create varied tasks, apply search/filter/sort combinations

### Implementation for US3

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-050 | [US3] Implement full-text search index in Task Service in services/task-service/src/persistence/migrations/ | P5-T-010 | Task Service | GIN index on title+description | FR-008 |
| P5-T-051 | [US3] Implement search query builder in services/task-service/src/persistence/task-search.ts | P5-T-050 | Task Service | Text search + filters | FR-008, FR-011 |
| P5-T-052 | [US3] Implement sort parameter handling in Task repository in services/task-service/src/persistence/task-repository.ts | P5-T-051 | Task Service | Sort by priority, dueDate, createdAt, title | FR-010 |
| P5-T-053 | [US3] Implement POST /tasks/search API endpoint in services/task-service/src/api/tasks.ts | P5-T-051, P5-T-052 | Task Service | Search with filters and sort | Contracts |
| P5-T-054 | [US3] Implement task.search MCP tool in services/chatbot/src/tools/task/search.ts | P5-T-053 | Chatbot | Search tool registration | MCP Tools |
| P5-T-055 | [US3] Extend task.list MCP tool with sortBy/sortOrder in services/chatbot/src/tools/task/list.ts | P5-T-052 | Chatbot | Sorted list results | MCP Tools |
| P5-T-056 | [US3] Emit task.searched event from task.search tool in services/chatbot/src/tools/task/search.ts | P5-T-054 | Chatbot | Observability event published | Contracts |

**Checkpoint**: Search/filter/sort fully functional via chatbot

---

## Phase 6: User Story 4 - Due Dates & Reminders (Priority: P2)

**Goal**: Users can set due dates and receive reminder notifications through chatbot

**Independent Test**: Set due dates, create reminders, verify notification delivery

### 6.1 Due Dates

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-057 | [US4] Add dueDate field handling to Task domain model in services/task-service/src/domain/task.ts | P5-T-028 | Task Service | Timestamp field, UTC storage | FR-013 |
| P5-T-058 | [US4] Implement due date filters in Task repository in services/task-service/src/persistence/task-repository.ts | P5-T-057 | Task Service | dueBefore, dueAfter, overdue filters | FR-009 |
| P5-T-059 | [US4] Extend task.create MCP tool with dueDate parameter in services/chatbot/src/tools/task/create.ts | P5-T-057 | Chatbot | Due date in creation | MCP Tools |
| P5-T-060 | [US4] Extend task.update MCP tool with dueDate parameter in services/chatbot/src/tools/task/update.ts | P5-T-057 | Chatbot | Due date updates | MCP Tools |
| P5-T-061 | [US4] Extend task.list MCP tool with due date filters in services/chatbot/src/tools/task/list.ts | P5-T-058 | Chatbot | Filter by due dates, overdue | MCP Tools |
| P5-T-062 | [US4] Emit task.dueDate.set event from task.update tool in services/chatbot/src/tools/task/update.ts | P5-T-060 | Chatbot | Domain event published | FR-022 |

### 6.2 Reminder Service

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-063 | [US4] Implement Reminder domain model in services/reminder-service/src/domain/reminder.ts | P5-T-011 | Reminder Service | Reminder entity with validation | Data Model |
| P5-T-064 | [US4] Implement Reminder repository in services/reminder-service/src/persistence/reminder-repository.ts | P5-T-063 | Reminder Service | Reminder CRUD operations | Data Model |
| P5-T-065 | [US4] Implement Reminder Service API endpoints in services/reminder-service/src/api/reminders.ts | P5-T-064 | Reminder Service | POST, GET, DELETE /reminders | Contracts |
| P5-T-066 | [US4] Implement reminder scheduler using Dapr in services/reminder-service/src/scheduler/reminder-scheduler.ts | P5-T-064 | Reminder Service | Scheduled job execution | FR-015 |
| P5-T-067 | [US4] Implement task deletion event handler in services/reminder-service/src/events/handlers.ts | P5-T-019, P5-T-066 | Reminder Service | Cancel reminders on task delete | Event Flow |

### 6.3 Reminder MCP Tools & Notifications

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-068 | [US4] Implement reminder.create MCP tool in services/chatbot/src/tools/reminder/create.ts | P5-T-065 | Chatbot | Create reminder tool | MCP Tools |
| P5-T-069 | [US4] Implement reminder.delete MCP tool in services/chatbot/src/tools/reminder/delete.ts | P5-T-065 | Chatbot | Delete reminder tool | MCP Tools |
| P5-T-070 | [US4] Implement reminder.list MCP tool in services/chatbot/src/tools/reminder/list.ts | P5-T-065 | Chatbot | List reminders tool | MCP Tools |
| P5-T-071 | [US4] Emit reminder.created event from reminder.create tool in services/chatbot/src/tools/reminder/create.ts | P5-T-068 | Chatbot | Domain event published | FR-022 |
| P5-T-072 | [US4] Emit reminder.deleted event from reminder.delete tool in services/chatbot/src/tools/reminder/delete.ts | P5-T-069 | Chatbot | Domain event published | FR-022 |
| P5-T-073 | [US4] Implement reminder.triggered event handler for chatbot notifications in services/chatbot/src/handlers/reminder-handler.ts | P5-T-066 | Chatbot | User notification delivery | FR-015 |

**Checkpoint**: Due dates and reminders fully functional via chatbot

---

## Phase 7: User Story 5 - Recurring Tasks (Priority: P3)

**Goal**: Users can create recurring tasks that auto-regenerate on completion

**Independent Test**: Create recurring task, complete it, verify next occurrence

### 7.1 Recurrence Service

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-074 | [US5] Implement RecurrencePattern domain model in services/recurrence-service/src/domain/recurrence-pattern.ts | P5-T-012 | Recurrence Service | Pattern entity with validation | Data Model |
| P5-T-075 | [US5] Implement next run calculation logic in services/recurrence-service/src/domain/recurrence-calculator.ts | P5-T-074 | Recurrence Service | Daily, weekly, monthly, yearly logic | FR-017, FR-018 |
| P5-T-076 | [US5] Implement RecurrencePattern repository in services/recurrence-service/src/persistence/recurrence-repository.ts | P5-T-074 | Recurrence Service | Pattern CRUD operations | Data Model |
| P5-T-077 | [US5] Implement Recurrence Service API endpoints in services/recurrence-service/src/api/recurrence.ts | P5-T-076 | Recurrence Service | GET, PUT, DELETE /recurrence/{taskId} | Contracts |
| P5-T-078 | [US5] Implement recurrence scheduler using Dapr in services/recurrence-service/src/scheduler/recurrence-scheduler.ts | P5-T-075, P5-T-076 | Recurrence Service | Scheduled job execution | FR-019 |
| P5-T-079 | [US5] Implement task.completed event handler in services/recurrence-service/src/events/handlers.ts | P5-T-020, P5-T-078 | Recurrence Service | Generate next occurrence | Event Flow |

### 7.2 Recurrence MCP Tools

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-080 | [US5] Extend task.create MCP tool with recurrence parameter in services/chatbot/src/tools/task/create.ts | P5-T-077 | Chatbot | Recurrence in creation | MCP Tools |
| P5-T-081 | [US5] Extend task.update MCP tool with recurrence parameter in services/chatbot/src/tools/task/update.ts | P5-T-077 | Chatbot | Recurrence updates | MCP Tools |
| P5-T-082 | [US5] Extend task.list MCP tool with recurring filter in services/chatbot/src/tools/task/list.ts | P5-T-077 | Chatbot | Filter recurring tasks | MCP Tools |
| P5-T-083 | [US5] Implement recurrence.pause MCP tool in services/chatbot/src/tools/recurrence/pause.ts | P5-T-077 | Chatbot | Pause recurrence tool | MCP Tools |
| P5-T-084 | [US5] Implement recurrence.resume MCP tool in services/chatbot/src/tools/recurrence/resume.ts | P5-T-077 | Chatbot | Resume recurrence tool | MCP Tools |
| P5-T-085 | [US5] Emit task.recurrence.created event from task.create tool in services/chatbot/src/tools/task/create.ts | P5-T-080 | Chatbot | Domain event published | FR-022 |
| P5-T-086 | [US5] Emit task.recurrence.modified event from task.update tool in services/chatbot/src/tools/task/update.ts | P5-T-081 | Chatbot | Domain event published | FR-022 |
| P5-T-087 | [US5] Emit task.recurrence.paused event from recurrence.pause tool in services/chatbot/src/tools/recurrence/pause.ts | P5-T-083 | Chatbot | Domain event published | FR-022 |
| P5-T-088 | [US5] Emit task.recurrence.resumed event from recurrence.resume tool in services/chatbot/src/tools/recurrence/resume.ts | P5-T-084 | Chatbot | Domain event published | FR-022 |

**Checkpoint**: Recurring tasks fully functional via chatbot

---

## Phase 8: Audit Service & Event Logging

**Purpose**: Centralized event store for observability and audit trail

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-089 | Implement DomainEvent model in services/audit-service/src/domain/domain-event.ts | P5-T-013 | Audit Service | Event entity | Data Model |
| P5-T-090 | Implement DomainEvent repository with TimescaleDB in services/audit-service/src/persistence/event-repository.ts | P5-T-089 | Audit Service | Event storage with partitioning | Data Model |
| P5-T-091 | Implement Kafka consumer for task.events topic in services/audit-service/src/consumers/task-events-consumer.ts | P5-T-090 | Audit Service | Task event consumer | Event Flow |
| P5-T-092 | [P] Implement Kafka consumer for reminder.events topic in services/audit-service/src/consumers/reminder-events-consumer.ts | P5-T-090 | Audit Service | Reminder event consumer | Event Flow |
| P5-T-093 | [P] Implement Kafka consumer for recurrence.events topic in services/audit-service/src/consumers/recurrence-events-consumer.ts | P5-T-090 | Audit Service | Recurrence event consumer | Event Flow |
| P5-T-094 | Implement event query API endpoints in services/audit-service/src/api/events.ts | P5-T-090 | Audit Service | GET /events with filters | Observability |

**Checkpoint**: Audit service consuming and storing all domain events

---

## Phase 9: Local Deployment (Minikube)

**Purpose**: Local Kubernetes development environment

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-095 | Create Dockerfile for chatbot service in services/chatbot/Dockerfile | P5-T-002 | Chatbot | Container image | Deployment |
| P5-T-096 | [P] Create Dockerfile for task-service in services/task-service/Dockerfile | P5-T-003 | Task Service | Container image | Deployment |
| P5-T-097 | [P] Create Dockerfile for reminder-service in services/reminder-service/Dockerfile | P5-T-004 | Reminder Service | Container image | Deployment |
| P5-T-098 | [P] Create Dockerfile for recurrence-service in services/recurrence-service/Dockerfile | P5-T-005 | Recurrence Service | Container image | Deployment |
| P5-T-099 | [P] Create Dockerfile for audit-service in services/audit-service/Dockerfile | P5-T-006 | Audit Service | Container image | Deployment |
| P5-T-100 | Create Kubernetes base manifests for chatbot in infrastructure/kubernetes/base/chatbot/ | P5-T-095 | Infrastructure | Deployment, Service, ConfigMap | Deployment |
| P5-T-101 | [P] Create Kubernetes base manifests for task-service in infrastructure/kubernetes/base/task-service/ | P5-T-096 | Infrastructure | Deployment, Service, ConfigMap | Deployment |
| P5-T-102 | [P] Create Kubernetes base manifests for reminder-service in infrastructure/kubernetes/base/reminder-service/ | P5-T-097 | Infrastructure | Deployment, Service, ConfigMap | Deployment |
| P5-T-103 | [P] Create Kubernetes base manifests for recurrence-service in infrastructure/kubernetes/base/recurrence-service/ | P5-T-098 | Infrastructure | Deployment, Service, ConfigMap | Deployment |
| P5-T-104 | [P] Create Kubernetes base manifests for audit-service in infrastructure/kubernetes/base/audit-service/ | P5-T-099 | Infrastructure | Deployment, Service, ConfigMap | Deployment |
| P5-T-105 | Create Kustomize dev overlay in infrastructure/kubernetes/overlays/dev/ | P5-T-100 | Infrastructure | Local environment config | Deployment |
| P5-T-106 | Create Strimzi Kafka deployment for Minikube in infrastructure/kubernetes/base/kafka/ | P5-T-105 | Infrastructure | Kafka cluster manifest | Deployment |
| P5-T-107 | Create PostgreSQL StatefulSet for local dev in infrastructure/kubernetes/base/postgres/ | P5-T-105 | Infrastructure | Database pods | Deployment |
| P5-T-108 | Create local deployment script for Minikube in infrastructure/scripts/deploy-local.sh | P5-T-106, P5-T-107 | Infrastructure | Automated local deployment | Deployment |

**Checkpoint**: System deployable to local Minikube cluster

---

## Phase 10: Cloud Kubernetes Deployment

**Purpose**: Production-ready cloud deployment configuration

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-109 | Create Kustomize staging overlay in infrastructure/kubernetes/overlays/staging/ | P5-T-105 | Infrastructure | Staging environment config | Deployment |
| P5-T-110 | Configure HPA for chatbot service in infrastructure/kubernetes/overlays/staging/chatbot-hpa.yaml | P5-T-109 | Infrastructure | Horizontal Pod Autoscaler | Deployment Topology |
| P5-T-111 | [P] Configure HPA for task-service in infrastructure/kubernetes/overlays/staging/task-service-hpa.yaml | P5-T-109 | Infrastructure | Horizontal Pod Autoscaler | Deployment Topology |
| P5-T-112 | [P] Configure HPA for reminder-service in infrastructure/kubernetes/overlays/staging/reminder-service-hpa.yaml | P5-T-109 | Infrastructure | Horizontal Pod Autoscaler | Deployment Topology |
| P5-T-113 | [P] Configure HPA for audit-service in infrastructure/kubernetes/overlays/staging/audit-service-hpa.yaml | P5-T-109 | Infrastructure | Horizontal Pod Autoscaler | Deployment Topology |
| P5-T-114 | Configure leader election for recurrence-service in infrastructure/kubernetes/overlays/staging/recurrence-service-leader.yaml | P5-T-109 | Infrastructure | Single replica with leader election | Deployment Topology |
| P5-T-115 | Create external Secrets configuration template in infrastructure/kubernetes/overlays/staging/secrets.yaml | P5-T-109 | Infrastructure | Secret references | Cloud-Native Scalability |
| P5-T-116 | Create NetworkPolicy for service isolation in infrastructure/kubernetes/overlays/staging/network-policies.yaml | P5-T-109 | Infrastructure | Network isolation rules | Quality Gates |
| P5-T-117 | Create cloud deployment documentation in infrastructure/docs/cloud-deployment.md | P5-T-109 | Infrastructure | Deployment guide | Documentation |

**Checkpoint**: System ready for cloud Kubernetes deployment

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final quality improvements and validation

| Task ID | Description | Depends On | Components | Output | Plan Section |
|---------|-------------|------------|------------|--------|--------------|
| P5-T-118 | Configure Prometheus metrics export for all services | P5-T-027 | All Services | Metrics endpoints | Quality Gates |
| P5-T-119 | [P] Create Grafana dashboard definitions in infrastructure/observability/dashboards/ | P5-T-118 | Infrastructure | Service dashboards | Quality Gates |
| P5-T-120 | [P] Create alerting rules for SLO breaches in infrastructure/observability/alerts/ | P5-T-118 | Infrastructure | Alert definitions | Quality Gates |
| P5-T-121 | Configure dead-letter queue handling in Dapr in infrastructure/dapr/components/pubsub.yaml | P5-T-015 | Infrastructure | DLQ for failed events | Quality Gates |
| P5-T-122 | Validate quickstart.md end-to-end in local environment | P5-T-108 | All Services | Validated quickstart guide | Documentation |
| P5-T-123 | Run constitution compliance checklist validation | P5-T-117 | All Services | Compliance report | Constitution Check |

**Checkpoint**: Phase V complete - all features functional, observable, deployable

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) ─────────────────────┐
                                      │
Phase 2 (Foundation) ◄───────────────┘
         │
         ├── 2.1 Database Setup
         ├── 2.2 Dapr & Kafka
         ├── 2.3 Event Publishing
         ├── 2.4 Health & Observability
         └── 2.5 Base Models
                                      │
         ┌────────────────────────────┴────────────────────────────┐
         │                            │                            │
         ▼                            ▼                            ▼
Phase 3 (US1: Priority)    Phase 4 (US2: Tags)    [Can run in parallel]
         │                            │
         └────────────┬───────────────┘
                      │
                      ▼
         Phase 5 (US3: Search/Filter/Sort) ◄── Depends on US1 + US2 metadata
                      │
                      ▼
         Phase 6 (US4: Due Dates & Reminders)
                      │
                      ▼
         Phase 7 (US5: Recurring Tasks) ◄── Depends on due date handling
                      │
                      ▼
         Phase 8 (Audit Service) ◄── Can start after Phase 2, consumes all events
                      │
                      ▼
         Phase 9 (Local Deployment) ◄── After all services implemented
                      │
                      ▼
         Phase 10 (Cloud Deployment)
                      │
                      ▼
         Phase 11 (Polish)
```

### User Story Dependencies

- **US1 (Priority)**: Can start after Phase 2 - No dependencies on other stories
- **US2 (Tags)**: Can start after Phase 2 - Independent of US1
- **US3 (Search)**: Depends on US1 + US2 (needs priority and tags to filter)
- **US4 (Reminders)**: Can start after Phase 2 - Independent, introduces Reminder Service
- **US5 (Recurring)**: Depends on US4 (builds on due date handling)

### Parallel Opportunities

- Phase 2: All [P] tasks (T011-T013, T018-T020, T021-T025, T029, T031)
- Phase 3 + Phase 4: US1 and US2 can run in parallel
- Phase 8: Can start after Phase 2, independent of user stories
- Phase 9: All Dockerfiles (T095-T099), all K8s manifests (T100-T104)
- Phase 10: All HPA configs (T110-T113)
- Phase 11: Dashboard and alert creation (T119-T120)

---

## Summary

| Metric | Value |
|--------|-------|
| Total Tasks | 123 |
| Setup Phase | 9 tasks |
| Foundational Phase | 22 tasks |
| US1 (Priority) | 7 tasks |
| US2 (Tags) | 11 tasks |
| US3 (Search) | 7 tasks |
| US4 (Reminders) | 17 tasks |
| US5 (Recurring) | 15 tasks |
| Audit Service | 6 tasks |
| Local Deployment | 14 tasks |
| Cloud Deployment | 9 tasks |
| Polish | 6 tasks |
| Parallel Opportunities | 47 tasks marked [P] |

### MVP Scope

Complete Phases 1-4 (Setup + Foundation + US1 + US2) for MVP:
- 49 tasks
- Users can create tasks with priorities and tags
- Full event publishing to Kafka
- All features accessible via chatbot

### Implementation Strategy

1. **MVP First**: Setup → Foundation → US1 → US2 → Validate
2. **Incremental**: Add US3 → US4 → US5 sequentially
3. **Deploy**: Local (Phase 9) → Cloud (Phase 10)
4. **Harden**: Polish (Phase 11)
