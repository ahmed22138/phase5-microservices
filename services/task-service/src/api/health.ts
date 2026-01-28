import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  checks: {
    name: string;
    status: 'pass' | 'fail';
    message?: string;
  }[];
}

let dbPool: Pool | null = null;

export function setDbPool(pool: Pool): void {
  dbPool = pool;
}

// Liveness probe
router.get('/health', (_req: Request, res: Response) => {
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'task-service',
    version: process.env.SERVICE_VERSION ?? '1.0.0',
    checks: [
      { name: 'process', status: 'pass' }
    ]
  };
  res.status(200).json(health);
});

// Readiness probe
router.get('/ready', async (_req: Request, res: Response) => {
  const checks: HealthStatus['checks'] = [];
  let isReady = true;

  // Check database connectivity
  if (dbPool) {
    try {
      await dbPool.query('SELECT 1');
      checks.push({ name: 'database', status: 'pass' });
    } catch {
      checks.push({ name: 'database', status: 'fail', message: 'Database unreachable' });
      isReady = false;
    }
  } else {
    checks.push({ name: 'database', status: 'fail', message: 'Pool not initialized' });
    isReady = false;
  }

  // Check Dapr sidecar
  try {
    const daprPort = process.env.DAPR_HTTP_PORT ?? '3500';
    const response = await fetch(`http://localhost:${daprPort}/v1.0/healthz`);
    if (response.ok) {
      checks.push({ name: 'dapr-sidecar', status: 'pass' });
    } else {
      checks.push({ name: 'dapr-sidecar', status: 'fail', message: 'Dapr not ready' });
      isReady = false;
    }
  } catch {
    checks.push({ name: 'dapr-sidecar', status: 'fail', message: 'Dapr unreachable' });
    isReady = false;
  }

  const health: HealthStatus = {
    status: isReady ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    service: 'task-service',
    version: process.env.SERVICE_VERSION ?? '1.0.0',
    checks
  };

  res.status(isReady ? 200 : 503).json(health);
});

export default router;
