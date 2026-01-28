# Implementation Plan: Chatbot Task Management Extensions

**Branch**: `001-chatbot-task-extensions` | **Date**: 2026-01-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-chatbot-task-extensions/spec.md`

## Summary

Extend the existing Phase III chatbot with task management capabilities (priorities, tags, search/filter/sort, due dates/reminders, recurring tasks) using an event-driven, cloud-native architecture. The system introduces MCP tools that emit domain events via Dapr to Kafka, consumed by background services (Reminder, Recurrence, Audit) for async processing.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20 LTS) — aligns with existing chatbot
**Primary Dependencies**: Dapr SDK, MCP SDK, PostgreSQL driver, Kafka (via Dapr)
**Storage**: PostgreSQL per service (task_db, reminder_db, recurrence_db, audit_db)
**Testing**: Vitest (unit), Supertest (integration), Testcontainers (contract)
**Target Platform**: Kubernetes (cloud-managed) with Dapr sidecars
**Project Type**: Microservices (event-driven)
**Performance Goals**: p95 latency ≤500ms for chatbot responses; 2s search for 10k tasks
**Constraints**: Stateless services; Kafka only via Dapr; no shared databases
**Scale/Scope**: 1,000 concurrent users; 5 services; 14 event types

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Spec-Driven Development | ✅ PASS | spec.md approved before planning |
| II. Event-Driven Architecture | ✅ PASS | 14 domain events defined; Kafka via Dapr |
| III. Stateless AI Services | ✅ PASS | All services stateless; context in requests |
| IV. Cloud-Native Scalability | ✅ PASS | K8s deployment; HPA; health checks planned |

| Hard Rule | Status | Evidence |
|-----------|--------|----------|
| No Manual Coding | ✅ PASS | Following spec→plan→tasks workflow |
| Extend Phase 3 Chatbot | ✅ PASS | MCP tools extend; no rewrite |
| Features via Chatbot | ✅ PASS | All 5 features accessible via NL |

| Architecture Constraint | Status | Evidence |
|------------------------|--------|----------|
| MCP Tools Emit Events | ✅ PASS | All state-change tools emit events |
| Kafka via Dapr Only | ✅ PASS | No direct Kafka clients |

| Quality Gate | Status | Evidence |
|-------------|--------|----------|
| Reliability | ✅ PLANNED | Circuit breakers, DLQ, retry policies |
| Observability | ✅ PLANNED | OpenTelemetry, structured logging |
| Loose Coupling | ✅ PASS | Separate DBs; event-based integration |

## Project Structure

### Documentation (this feature)

```text
specs/001-chatbot-task-extensions/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: Architecture decisions
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Developer onboarding
├── contracts/           # Phase 1: API specifications
│   ├── mcp-tools.asyncapi.yaml
│   ├── task-service.openapi.yaml
│   ├── reminder-service.openapi.yaml
│   └── recurrence-service.openapi.yaml
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2: Implementation tasks (via /sp.tasks)
```

### Source Code (repository root)

```text
services/
├── chatbot/                    # Existing Phase III chatbot (extended)
│   ├── src/
│   │   ├── tools/              # MCP tool implementations
│   │   │   ├── task/
│   │   │   │   ├── create.ts
│   │   │   │   ├── update.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── search.ts
│   │   │   ├── tag/
│   │   │   │   └── list.ts
│   │   │   ├── reminder/
│   │   │   │   ├── create.ts
│   │   │   │   ├── delete.ts
│   │   │   │   └── list.ts
│   │   │   └── recurrence/
│   │   │       ├── pause.ts
│   │   │       └── resume.ts
│   │   ├── events/             # Event publishing utilities
│   │   │   └── publisher.ts
│   │   └── handlers/           # Event handlers (reminder notifications)
│   └── tests/
│
├── task-service/               # Task domain service
│   ├── src/
│   │   ├── api/
│   │   ├── domain/
│   │   ├── events/
│   │   └── persistence/
│   └── tests/
│
├── reminder-service/           # Reminder scheduling service
│   ├── src/
│   │   ├── api/
│   │   ├── scheduler/
│   │   ├── events/
│   │   └── persistence/
│   └── tests/
│
├── recurrence-service/         # Recurring task generator
│   ├── src/
│   │   ├── api/
│   │   ├── scheduler/
│   │   ├── events/
│   │   └── persistence/
│   └── tests/
│
└── audit-service/              # Event store and audit log
    ├── src/
    │   ├── consumers/
    │   ├── persistence/
    │   └── query/
    └── tests/

infrastructure/
├── dapr/
│   ├── components/
│   │   ├── pubsub.yaml         # Kafka pub/sub component
│   │   ├── statestore.yaml     # State store (if needed)
│   │   └── resiliency.yaml     # Circuit breakers, retries
│   └── configuration/
│       └── config.yaml
├── kubernetes/
│   ├── base/
│   │   ├── chatbot/
│   │   ├── task-service/
│   │   ├── reminder-service/
│   │   ├── recurrence-service/
│   │   └── audit-service/
│   └── overlays/
│       ├── dev/
│       └── staging/
└── docker/
    └── docker-compose.yaml     # Local development
```

**Structure Decision**: Microservices architecture with dedicated service directories. Each service is independently deployable with its own database. Chatbot extended with new MCP tools; background services handle async processing.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER                                        │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ Natural Language
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CHATBOT SERVICE                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │
│  │  NLU Layer  │──│  MCP Tools  │──│Event Publish│                      │
│  └─────────────┘  └──────┬──────┘  └──────┬──────┘                      │
│                          │                 │                             │
│                          │ Dapr Invoke     │ Dapr Pub/Sub               │
└──────────────────────────┼─────────────────┼────────────────────────────┘
                           │                 │
           ┌───────────────┼─────────────────┼───────────────┐
           │               │                 │               │
           ▼               ▼                 ▼               │
┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│ TASK SERVICE │  │   REMINDER   │  │  RECURRENCE  │        │
│              │  │   SERVICE    │  │   SERVICE    │        │
│ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │        │
│ │ task_db  │ │  │ │reminder_ │ │  │ │recurrence│ │        │
│ │(Postgres)│ │  │ │   db     │ │  │ │   _db    │ │        │
│ └──────────┘ │  │ └──────────┘ │  │ └──────────┘ │        │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
       │                 │                 │                │
       │     Events      │     Events      │    Events      │
       └────────┬────────┴────────┬────────┴────────────────┘
                │                 │
                ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    KAFKA (via Dapr Pub/Sub)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │
│  │task.events  │  │reminder.    │  │recurrence.  │                      │
│  │             │  │events       │  │events       │                      │
│  └─────────────┘  └─────────────┘  └─────────────┘                      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         AUDIT SERVICE                                    │
│  ┌──────────────────────────────────────────────────────────┐           │
│  │                      audit_db (TimescaleDB)               │           │
│  │                      All domain events stored             │           │
│  └──────────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Service Responsibilities

| Service | Responsibilities | Owns | Subscribes To |
|---------|-----------------|------|---------------|
| **Chatbot** | NLU, tool dispatch, user notifications | Sessions | `reminder.events` (triggered) |
| **Task Service** | Task CRUD, tags, priority, search | Tasks, Tags | `recurrence.events` (new instance) |
| **Reminder Service** | Schedule reminders, trigger at time | Reminders | `task.events` (task deleted → cancel reminders) |
| **Recurrence Service** | Manage patterns, generate instances | Patterns | `task.events` (completed → generate next) |
| **Audit Service** | Store all events, provide audit trail | Event history | All topics |

## Event Flow Examples

### Flow 1: Set Task Priority

```
1. User: "Set task 'Deploy API' to urgent"
2. Chatbot NLU → intent: update_priority, task: "Deploy API", priority: urgent
3. Chatbot invokes task.update MCP tool
4. Tool calls Task Service PATCH /tasks/{id}
5. Task Service updates DB, publishes task.priority.changed
6. Dapr routes to Kafka topic task.events
7. Audit Service consumes and stores event
8. Chatbot returns: "Updated 'Deploy API' to urgent priority"
```

### Flow 2: Reminder Triggered

```
1. Reminder Service scheduler finds due reminder
2. Scheduler publishes reminder.triggered event
3. Dapr routes to Kafka topic reminder.events
4. Chatbot subscribes, receives event
5. Chatbot sends notification to user: "Reminder: 'Deploy API' is due in 1 hour"
6. Audit Service also stores the event
```

### Flow 3: Recurring Task Completed

```
1. User: "Mark 'Weekly standup' as done"
2. Chatbot invokes task.update (status: completed)
3. Task Service publishes task.completed
4. Recurrence Service receives event, sees task is recurring
5. Recurrence Service generates next instance via Task Service
6. Recurrence Service publishes task.recurrence.triggered
7. Task Service creates new task instance
8. Chatbot returns: "Completed 'Weekly standup'. Next occurrence scheduled for Monday"
```

## Data Ownership Rules

| Data | Owner | Access Pattern |
|------|-------|----------------|
| Tasks | Task Service | Direct writes; events for cross-service reads |
| Tags | Task Service | Direct writes; exposed via Task API |
| Reminders | Reminder Service | Direct writes; task reference by ID |
| Recurrence Patterns | Recurrence Service | Direct writes; task reference by ID |
| Domain Events | Audit Service | Append-only; query for history |
| User Sessions | Chatbot | In-memory/Redis; not shared |

**Cross-Service Data Access**:
- Services reference other services' entities by ID only
- No foreign key constraints across databases
- Eventual consistency via events
- Audit Service provides historical view

## Stateless Execution Model

| Aspect | Implementation |
|--------|----------------|
| **Request Context** | User ID, timezone, correlation ID in headers |
| **Session State** | None; chatbot may use Redis for conversation context |
| **Task State** | Always fetched from Task Service DB |
| **Instance Identity** | Any pod replica can handle any request |
| **Scaling** | Kubernetes HPA based on CPU/request metrics |

## Deployment Topology

| Component | Replicas | Scaling Strategy | Notes |
|-----------|----------|------------------|-------|
| Chatbot | 3+ | HPA on latency | Main user entry point |
| Task Service | 2+ | HPA on request rate | Primary CRUD service |
| Reminder Service | 2+ | HPA on queue depth | Background scheduler |
| Recurrence Service | 1 | Leader election | Scheduler pattern |
| Audit Service | 2+ | HPA on event lag | High-throughput consumer |
| Kafka | 3 (Strimzi) | Partition scaling | Managed by operator |
| PostgreSQL | 1 per service | Vertical scaling | Consider managed DB |

## Complexity Tracking

> No constitution violations requiring justification.

## Artifacts Generated

| Artifact | Path | Description |
|----------|------|-------------|
| Research | `research.md` | Architecture decisions |
| Data Model | `data-model.md` | Entity definitions |
| AsyncAPI | `contracts/mcp-tools.asyncapi.yaml` | Event schemas |
| Task API | `contracts/task-service.openapi.yaml` | Task Service REST |
| Reminder API | `contracts/reminder-service.openapi.yaml` | Reminder Service REST |
| Recurrence API | `contracts/recurrence-service.openapi.yaml` | Recurrence Service REST |
| Quickstart | `quickstart.md` | Developer onboarding |

## Next Steps

Run `/sp.tasks` to generate implementation tasks based on this plan.
