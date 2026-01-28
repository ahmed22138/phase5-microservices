# Phase 5 - Local Startup Guide

## Quick Start (All Commands)

### Step 1: Start Docker Infrastructure
```powershell
cd E:\phase_5\infrastructure\docker
docker-compose up -d
```

### Step 2: Start Services (4 Separate Terminals)

**Terminal 1 - Task Service (Port 3001)**
```powershell
cd E:\phase_5\services\task-service
npm run dev
```

**Terminal 2 - Reminder Service (Port 3002)**
```powershell
cd E:\phase_5\services\reminder-service
npm run dev
```

**Terminal 3 - Recurrence Service (Port 3003)**
```powershell
cd E:\phase_5\services\recurrence-service
npm run dev
```

**Terminal 4 - Chatbot Service (Port 3000)**
```powershell
cd E:\phase_5\services\chatbot
npm run dev
```

---

## Access Points

| Service | URL |
|---------|-----|
| **Chat UI** | http://localhost:3000 |
| Task API | http://localhost:3001 |
| Reminder API | http://localhost:3002 |
| Recurrence API | http://localhost:3003 |

---

## Stop Services

### Stop Docker
```powershell
cd E:\phase_5\infrastructure\docker
docker-compose down
```

### Stop Node Services
- Press `Ctrl+C` in each terminal

---

## One-Liner Start (PowerShell)

```powershell
# Start Docker
cd E:\phase_5\infrastructure\docker; docker-compose up -d

# Then open 4 new terminals and run each service
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port already in use | `netstat -ano | findstr :3000` then `taskkill /PID <pid> /F` |
| Docker not running | Start Docker Desktop |
| npm run dev fails | Run `npm install` first in each service folder |
| CORS errors | Restart the services |

---

## Chat UI Features

- **Create Task**: `Create task Buy milk`
- **Add Priority**: `Set task <id> priority high`
- **Add Tags**: `Add tag shopping to task <id>`
- **Set Due Date**: `Set task <id> due tomorrow`
- **Set Reminder**: `Remind task <id> 30 sec`
- **Recurring Task**: `Make task <id> recur daily`
- **Complete Task**: `Complete task <id>`
- **List Tasks**: `Show tasks` or `List all tasks`
- **Search**: `Search milk`
- **Filter**: `Show high priority tasks`
