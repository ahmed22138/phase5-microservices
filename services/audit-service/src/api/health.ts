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
    service: 'audit-service',
    version: process.env.SERVICE_VERSION ?? '1.0.0',
    checks: [
      { name: 'process', status: 'pass' }
    ]
  };
  res.status(200).json(health);
});

// Readiness probe
router.get('/ready', (_req: Request, res: Response): void => {
  void (async () => {
    const checks: HealthStatus['checks'] = [];
    let isReady = true;

    // Check TimescaleDB connectivity
    if (dbPool) {
      try {
        await dbPool.query('SELECT 1');
        checks.push({ name: 'timescaledb', status: 'pass' });
      } catch {
        checks.push({ name: 'timescaledb', status: 'fail', message: 'Database unreachable' });
        isReady = false;
      }
    } else {
      checks.push({ name: 'timescaledb', status: 'fail', message: 'Pool not initialized' });
      isReady = false;
    }

    // Check Dapr sidecar
    const daprPort = process.env.DAPR_HTTP_PORT ?? '3500';
    try {
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
      service: 'audit-service',
      version: process.env.SERVICE_VERSION ?? '1.0.0',
      checks
    };

    res.status(isReady ? 200 : 503).json(health);
  })();
});

export default router;
