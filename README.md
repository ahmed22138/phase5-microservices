# Phase 5 - Chatbot Task Management System

A microservices-based task management system with natural language chatbot interface.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────────┐
│   Chatbot   │────▶│ Task Service │────▶│ PostgreSQL (Task) │
│  (Port 3000)│     │  (Port 3001) │     │    (Port 5432)    │
└─────────────┘     └──────────────┘     └───────────────────┘
       │
       ├───────────▶┌──────────────────┐     ┌─────────────────────┐
       │            │ Reminder Service │────▶│ PostgreSQL (Reminder)│
       │            │   (Port 3002)    │     │     (Port 5433)      │
       │            └──────────────────┘     └─────────────────────┘
       │
       ├───────────▶┌────────────────────┐     ┌───────────────────────┐
       │            │ Recurrence Service │────▶│ PostgreSQL (Recurrence)│
       │            │    (Port 3003)     │     │      (Port 5434)       │
       │            └────────────────────┘     └───────────────────────┘
       │
       └───────────▶┌───────────────┐     ┌────────────────────┐
                    │ Audit Service │────▶│ TimescaleDB (Audit)│
                    │  (Port 3004)  │     │    (Port 5435)     │
                    └───────────────┘     └────────────────────┘

                    ┌─────────┐     ┌───────────┐
                    │  Kafka  │     │   Redis   │
                    │ (9092)  │     │  (6379)   │
                    └─────────┘     └───────────┘
```

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript
- **Framework:** Express.js
- **Messaging:** Apache Kafka
- **Databases:** PostgreSQL, TimescaleDB
- **Cache:** Redis
- **Observability:** OpenTelemetry, Pino
- **Orchestration:** Docker, Kubernetes, Dapr

## Quick Start

### Prerequisites

- Node.js 20+
- Docker Desktop
- Git

### Option 1: Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/ahmed22138/phase5-microservices.git
cd phase5-microservices

# Start all services with Docker
cd infrastructure/docker
docker-compose up -d

# Check status
docker ps
```

**Access Points:**
| Service | URL |
|---------|-----|
| Chat UI | http://localhost:3000 |
| Task API | http://localhost:3001 |
| Reminder API | http://localhost:3002 |
| Recurrence API | http://localhost:3003 |
| Audit API | http://localhost:3004 |
| Kafka UI | http://localhost:8080 |

### Option 2: Local Development

**Step 1: Start Infrastructure (Docker)**
```bash
cd infrastructure/docker
docker-compose up -d zookeeper kafka redis postgres-task postgres-reminder postgres-recurrence postgres-audit
```

**Step 2: Install Dependencies**
```bash
# From project root
npm install
```

**Step 3: Start Services (4 Terminals)**

```bash
# Terminal 1 - Task Service
cd services/task-service
npm run dev

# Terminal 2 - Reminder Service
cd services/reminder-service
npm run dev

# Terminal 3 - Recurrence Service
cd services/recurrence-service
npm run dev

# Terminal 4 - Chatbot Service
cd services/chatbot
npm run dev
```

## Chat Commands

Once running, open http://localhost:3000 and try these commands:

| Command | Description |
|---------|-------------|
| `Create task Buy groceries` | Create a new task |
| `Show tasks` | List all tasks |
| `Show high priority tasks` | Filter by priority |
| `Complete task <id>` | Mark task complete |
| `Set task <id> priority high` | Set priority (low/medium/high) |
| `Set task <id> due tomorrow` | Set due date |
| `Add tag shopping to task <id>` | Add a tag |
| `Remind task <id> 30 sec` | Set reminder |
| `Make task <id> recur daily` | Make recurring |
| `Search groceries` | Search tasks |

## API Endpoints

### Task Service (Port 3001)
```
GET    /health
GET    /tasks
POST   /tasks
GET    /tasks/:id
PUT    /tasks/:id
DELETE /tasks/:id
GET    /tasks/search?q=keyword
GET    /tags
```

### Reminder Service (Port 3002)
```
GET    /health
GET    /reminders
POST   /reminders
DELETE /reminders/:id
GET    /reminders/task/:taskId
```

### Recurrence Service (Port 3003)
```
GET    /health
GET    /recurrence
POST   /recurrence
PUT    /recurrence/:id/pause
PUT    /recurrence/:id/resume
DELETE /recurrence/:id
```

### Audit Service (Port 3004)
```
GET    /health
GET    /events
GET    /events/:entityType/:entityId
```

## Project Structure

```
phase5-microservices/
├── services/
│   ├── chatbot/          # NLU + Chat UI (Port 3000)
│   ├── task-service/     # Task CRUD (Port 3001)
│   ├── reminder-service/ # Reminders (Port 3002)
│   ├── recurrence-service/ # Recurring tasks (Port 3003)
│   ├── audit-service/    # Event logging (Port 3004)
│   └── shared/           # Shared utilities
├── infrastructure/
│   ├── docker/           # Docker Compose
│   ├── kubernetes/       # K8s manifests
│   ├── dapr/             # Dapr components
│   └── observability/    # Dashboards & alerts
├── specs/                # API specifications
└── package.json          # Monorepo config
```

## Scripts

```bash
# Run from project root
npm run build        # Build all services
npm run test         # Run all tests
npm run lint         # Lint code
npm run lint:fix     # Fix lint issues
npm run format       # Format code
npm run typecheck    # Type check
```

## Stop Services

```bash
# Stop Docker containers
cd infrastructure/docker
docker-compose down

# Stop Node services
# Press Ctrl+C in each terminal
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port already in use | `netstat -ano \| findstr :3000` then `taskkill /PID <pid> /F` |
| Docker not running | Start Docker Desktop |
| npm run dev fails | Run `npm install` first |
| Database connection error | Ensure Docker containers are running |

## License

MIT
