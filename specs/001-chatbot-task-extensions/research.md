# Phase 0: Research & Architecture Decisions

**Feature**: Chatbot Task Management Extensions
**Branch**: `001-chatbot-task-extensions`
**Date**: 2026-01-17

## Overview

This document captures architectural research and decisions for extending the Phase III chatbot with task management features in a cloud-native, event-driven manner per the Phase V constitution.

---

## Decision 1: High-Level Architecture

### Decision
Adopt a layered event-driven architecture with four distinct tiers:
1. **Chatbot Service** (existing Phase III) — user interaction layer
2. **MCP Tools Layer** — stateless command handlers
3. **Event Bus** (Kafka via Dapr) — async communication backbone
4. **Background Services** — domain-specific event processors

### Rationale
- Constitution mandates event-driven architecture (Principle II)
- Constitution mandates stateless AI services (Principle III)
- Constitution mandates Kafka access only via Dapr (Architecture Constraint)
- Separation enables independent scaling and deployment of each tier

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Monolithic extension to chatbot | Violates loose coupling quality gate; prevents independent scaling |
| Direct Kafka clients | Explicitly prohibited by constitution; loses Dapr abstraction benefits |
| Synchronous RPC between services | Constitution mandates async event-driven where feasible |

---

## Decision 2: Service Boundaries

### Decision
Define five service boundaries:

| Service | Responsibility | Data Ownership |
|---------|---------------|----------------|
| **Chatbot Service** | NLU, user session, tool dispatch | User sessions, conversation history |
| **Task Service** | Task CRUD, priority, tags, due dates | Tasks, tags, task metadata |
| **Reminder Service** | Schedule reminders, trigger notifications | Reminders, delivery status |
| **Recurrence Service** | Process recurring patterns, generate instances | Recurrence patterns, schedules |
| **Audit Service** | Consume all events, maintain audit log | Event history, audit records |

### Rationale
- Each service owns its data (Loose Coupling quality gate)
- Single responsibility enables targeted scaling
- Services communicate via events, not shared databases
- Audit service provides cross-cutting observability

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Single Task Service handling everything | Would become monolith; reminder and recurrence have different scaling needs |
| Shared database for tasks and reminders | Violates constitution loose coupling gate |
| Notification service merged with Reminder | Notification delivery is chatbot's responsibility; reminder service only schedules |

---

## Decision 3: Event Flow Architecture

### Decision
Implement the following event flow:

```
User → Chatbot → MCP Tool → [State Change] → Dapr Pub/Sub → Kafka → Background Services
                    ↓
              Task Service DB
```

**Detailed Flow**:
1. User sends natural language request to Chatbot
2. Chatbot's NLU interprets intent and parameters
3. Chatbot invokes appropriate MCP tool
4. MCP tool executes operation against Task Service
5. Task Service persists change and publishes domain event via Dapr
6. Dapr routes event to Kafka topic
7. Subscribed services (Reminder, Recurrence, Audit) consume and process

### Rationale
- Synchronous path (1-5) provides immediate user feedback
- Async path (6-7) handles side effects without blocking user
- Dapr abstraction enables local development with in-memory pub/sub
- All events flow through single bus for observability

### Event Topics

| Topic | Publishers | Subscribers |
|-------|------------|-------------|
| `task.events` | Task Service | Reminder, Recurrence, Audit |
| `reminder.events` | Reminder Service | Chatbot (notifications), Audit |
| `recurrence.events` | Recurrence Service | Task Service (create instance), Audit |

---

## Decision 4: MCP Tool Design

### Decision
Extend existing MCP tool pattern with event emission decorator:

**Tool Categories**:
- **task.*** — Task CRUD and queries
- **tag.*** — Tag management
- **reminder.*** — Reminder CRUD
- **recurrence.*** — Recurrence control

**Tool Contract**:
- Input: Validated parameters from chatbot NLU
- Output: Operation result + confirmation message
- Side effect: Domain event published for state changes

### Rationale
- Constitution requires all MCP tools to publish domain events
- Existing tool pattern preserved (Phase III chatbot not rewritten)
- Tools remain stateless; state managed by backing services

### New/Modified Tools

| Tool | Action | Events Emitted |
|------|--------|----------------|
| `task.create` | Create task with optional priority, tags, due date, recurrence | `task.created` |
| `task.update` | Update task fields | `task.updated`, `task.priority.changed`, `task.tags.added/removed`, `task.dueDate.set` |
| `task.search` | Query with filters and sort | `task.searched` (observability) |
| `task.list` | List with filters | None (read-only) |
| `tag.list` | List all tags | None (read-only) |
| `reminder.create` | Schedule reminder | `reminder.created` |
| `reminder.delete` | Remove reminder | `reminder.deleted` |
| `reminder.list` | List reminders | None (read-only) |
| `recurrence.pause` | Pause recurrence | `task.recurrence.paused` |
| `recurrence.resume` | Resume recurrence | `task.recurrence.resumed` |

---

## Decision 5: Data Ownership Model

### Decision
Strict service-to-data-store mapping with no shared databases:

| Service | Data Store | Contents |
|---------|------------|----------|
| Chatbot | Session Store (Redis/Memory) | User sessions, conversation context |
| Task Service | Task DB (PostgreSQL) | Tasks, tags, task-tag associations |
| Reminder Service | Reminder DB (PostgreSQL) | Reminders, delivery status |
| Recurrence Service | Recurrence DB (PostgreSQL) | Patterns, next-run timestamps |
| Audit Service | Event Store (PostgreSQL/TimescaleDB) | All domain events |

### Rationale
- Constitution requires no shared databases (Loose Coupling gate)
- Each service can choose optimal storage for its domain
- Event sourcing in Audit Service provides complete history

### Cross-Service Data Access
- Services query their own stores for write operations
- Read-only aggregations served by Task Service (owns canonical task data)
- Historical queries served by Audit Service

---

## Decision 6: Stateless Execution Model

### Decision
All services follow stateless execution pattern:

**Stateless Guarantees**:
- No in-memory session state between requests
- All context passed in request or retrieved from stores
- Any instance can handle any request
- Horizontal scaling via replica count

**State Management**:
- User context: Passed in request headers (user ID, timezone)
- Task context: Retrieved from Task Service DB
- Correlation: UUID generated per request, propagated in events

### Rationale
- Constitution Principle III mandates stateless AI services
- Enables Kubernetes HPA for elastic scaling
- Simplifies deployment (rolling updates, canary)

---

## Decision 7: Deployment Topology

### Decision
Kubernetes deployment with Dapr sidecars:

```
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐   ┌─────────────────┐                  │
│  │ Chatbot Pod     │   │ Task Service Pod│                  │
│  │ ┌─────────────┐ │   │ ┌─────────────┐ │                  │
│  │ │ Chatbot App │ │   │ │ Task App    │ │                  │
│  │ └──────┬──────┘ │   │ └──────┬──────┘ │                  │
│  │ ┌──────┴──────┐ │   │ ┌──────┴──────┐ │                  │
│  │ │ Dapr Sidecar│ │   │ │ Dapr Sidecar│ │                  │
│  │ └─────────────┘ │   │ └─────────────┘ │                  │
│  └─────────────────┘   └─────────────────┘                  │
│                                                              │
│  ┌─────────────────┐   ┌─────────────────┐                  │
│  │ Reminder Pod    │   │ Recurrence Pod  │                  │
│  │ ┌─────────────┐ │   │ ┌─────────────┐ │                  │
│  │ │ Reminder App│ │   │ │ Recurrence  │ │                  │
│  │ └──────┬──────┘ │   │ └──────┬──────┘ │                  │
│  │ ┌──────┴──────┐ │   │ ┌──────┴──────┐ │                  │
│  │ │ Dapr Sidecar│ │   │ │ Dapr Sidecar│ │                  │
│  │ └─────────────┘ │   │ └─────────────┘ │                  │
│  └─────────────────┘   └─────────────────┘                  │
│                                                              │
│  ┌─────────────────┐   ┌─────────────────┐                  │
│  │ Audit Pod       │   │ Kafka (Strimzi) │                  │
│  │ ┌─────────────┐ │   │                 │                  │
│  │ │ Audit App   │ │   │                 │                  │
│  │ └──────┬──────┘ │   │                 │                  │
│  │ ┌──────┴──────┐ │   │                 │                  │
│  │ │ Dapr Sidecar│ │   │                 │                  │
│  │ └─────────────┘ │   │                 │                  │
│  └─────────────────┘   └─────────────────┘                  │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Databases                             ││
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐ ││
│  │  │ Task DB   │ │Reminder DB│ │Recurrence │ │ Audit DB │ ││
│  │  │(PostgreSQL│ │(PostgreSQL│ │DB         │ │(Timescale│ ││
│  │  └───────────┘ └───────────┘ └───────────┘ └──────────┘ ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Pod Scaling**:
- Chatbot: HPA based on request latency and CPU
- Task Service: HPA based on request rate
- Reminder Service: HPA based on queue depth
- Recurrence Service: Single replica (scheduler pattern) with leader election
- Audit Service: HPA based on event lag

### Rationale
- Each service independently scalable
- Dapr sidecars handle service mesh concerns
- Kafka managed via Strimzi operator for cloud-native operation
- Separate databases ensure data isolation

---

## Decision 8: Observability Stack

### Decision
Implement three pillars with OpenTelemetry:

| Pillar | Tool | Integration |
|--------|------|-------------|
| Logging | Structured JSON → Loki | Dapr log format, correlation IDs |
| Tracing | OpenTelemetry → Jaeger/Tempo | W3C Trace Context propagation |
| Metrics | Prometheus → Grafana | Dapr metrics + custom SLIs |

**Key SLIs**:
- Request latency (p50, p95, p99)
- Event processing latency
- Error rates by service
- Event throughput
- Reminder delivery time

### Rationale
- Constitution requires observability quality gate
- OpenTelemetry provides vendor-neutral collection
- Correlation IDs enable end-to-end tracing

---

## Decision 9: Reliability Patterns

### Decision
Implement resilience at multiple layers:

| Pattern | Implementation | Scope |
|---------|----------------|-------|
| Circuit Breaker | Dapr resiliency policies | Inter-service calls |
| Retry with Backoff | Dapr pub/sub retry | Event delivery |
| Dead Letter Queue | Kafka DLQ topic | Failed events |
| Health Checks | Kubernetes probes | All pods |
| Graceful Shutdown | SIGTERM handlers | All services |

### Rationale
- Constitution requires reliability quality gate (99.9% SLO)
- Dapr provides built-in resiliency policies
- DLQ ensures no event loss

---

## Summary of Technical Stack

| Component | Technology |
|-----------|------------|
| Runtime | Kubernetes (cloud-managed) |
| Service Mesh | Dapr |
| Message Broker | Kafka (via Strimzi) |
| Databases | PostgreSQL (per-service), TimescaleDB (audit) |
| Caching | Redis (session store) |
| Observability | OpenTelemetry, Prometheus, Grafana, Loki |
| CI/CD | GitOps (ArgoCD recommended) |

---

## Open Items

None. All architectural decisions made based on constitution requirements and specification.
