# Quickstart: Chatbot Task Management Extensions

**Feature**: 001-chatbot-task-extensions
**Date**: 2026-01-17

## Prerequisites

- Docker Desktop with Kubernetes enabled (or minikube)
- Dapr CLI installed (`dapr init`)
- Node.js 20 LTS
- PostgreSQL (or use Docker Compose)

## Local Development Setup

### 1. Start Infrastructure

```bash
# From repository root
cd infrastructure/docker
docker-compose up -d
```

This starts:
- Kafka (localhost:9092)
- PostgreSQL instances (ports 5432-5435)
- Redis (localhost:6379)

### 2. Initialize Dapr

```bash
# Initialize Dapr in self-hosted mode
dapr init

# Verify
dapr --version
```

### 3. Install Dependencies

```bash
# Install all service dependencies
cd services/chatbot && npm install
cd ../task-service && npm install
cd ../reminder-service && npm install
cd ../recurrence-service && npm install
cd ../audit-service && npm install
```

### 4. Run Database Migrations

```bash
# From each service directory
npm run db:migrate
```

### 5. Start Services with Dapr

Open separate terminals for each service:

```bash
# Terminal 1: Chatbot
cd services/chatbot
dapr run --app-id chatbot --app-port 3000 --dapr-http-port 3500 -- npm run dev

# Terminal 2: Task Service
cd services/task-service
dapr run --app-id task-service --app-port 3001 --dapr-http-port 3501 -- npm run dev

# Terminal 3: Reminder Service
cd services/reminder-service
dapr run --app-id reminder-service --app-port 3002 --dapr-http-port 3502 -- npm run dev

# Terminal 4: Recurrence Service
cd services/recurrence-service
dapr run --app-id recurrence-service --app-port 3003 --dapr-http-port 3503 -- npm run dev

# Terminal 5: Audit Service
cd services/audit-service
dapr run --app-id audit-service --app-port 3004 --dapr-http-port 3504 -- npm run dev
```

## Verify Setup

### Test Chatbot Connection

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

### Test Task Service via Dapr

```bash
curl http://localhost:3500/v1.0/invoke/task-service/method/health
# Expected: {"status":"ok"}
```

### Test Event Publishing

```bash
# Create a task and verify event in Kafka
curl -X POST http://localhost:3500/v1.0/invoke/task-service/method/tasks \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 00000000-0000-0000-0000-000000000001" \
  -d '{"title":"Test task","priority":"high"}'
```

Check Kafka UI at `localhost:8080` for `task.events` topic.

## Running Tests

```bash
# Unit tests
npm run test:unit

# Integration tests (requires running services)
npm run test:integration

# Contract tests (uses Testcontainers)
npm run test:contract
```

## Common Issues

### Dapr not connecting to Kafka
Check `infrastructure/dapr/components/pubsub.yaml` points to correct broker address.

### Database connection refused
Ensure PostgreSQL containers are running: `docker ps | grep postgres`

### Service discovery failing
Verify all services are registered with Dapr: `dapr list`

## Architecture Overview

```
User → Chatbot → MCP Tools → Task Service → Events → Kafka → Background Services
                    ↓
              [Dapr Sidecar]
```

## Key Files

| File | Purpose |
|------|---------|
| `spec.md` | Feature requirements |
| `plan.md` | Implementation architecture |
| `research.md` | Design decisions |
| `data-model.md` | Entity definitions |
| `contracts/*.yaml` | API specifications |

## Kubernetes Deployment (Minikube)

For Kubernetes-based local development:

```bash
# Using PowerShell (Windows)
.\infrastructure\scripts\deploy-local.ps1 deploy

# Using Bash (WSL/Linux)
./infrastructure/scripts/deploy-local.sh deploy

# Check status
.\infrastructure\scripts\deploy-local.ps1 status

# Cleanup
.\infrastructure\scripts\deploy-local.ps1 cleanup
```

This deploys:
- Strimzi Kafka Operator with phase5-kafka cluster
- PostgreSQL StatefulSets for each service
- All 5 microservices with Dapr sidecars
- Dapr pub/sub components with DLQ support

## Cloud Deployment

See `infrastructure/docs/cloud-deployment.md` for staging/production deployment.

## Observability

- Grafana dashboards: `infrastructure/observability/dashboards/`
- Alerting rules: `infrastructure/observability/alerts/`
- Metrics endpoint: `/metrics` on each service

## Next Steps

1. Review `plan.md` for architecture details
2. Run `/sp.tasks` to generate implementation tasks
3. Start with Task Service (P1 features)
4. Add MCP tools to chatbot
5. Implement background services
