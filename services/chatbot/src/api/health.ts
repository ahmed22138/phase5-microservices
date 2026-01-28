import { Router, Request, Response } from 'express';

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

// Liveness probe - is the service running?
router.get('/health', (_req: Request, res: Response) => {
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'chatbot',
    version: process.env.SERVICE_VERSION ?? '1.0.0',
    checks: [
      { name: 'process', status: 'pass' }
    ]
  };
  res.status(200).json(health);
});

// Readiness probe - is the service ready to accept traffic?
router.get('/ready', (_req: Request, res: Response): void => {
  void (async () => {
    const checks: HealthStatus['checks'] = [];
    let isReady = true;

    // Check Dapr sidecar connectivity
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
      service: 'chatbot',
      version: process.env.SERVICE_VERSION ?? '1.0.0',
      checks
    };

    res.status(isReady ? 200 : 503).json(health);
  })();
});

export default router;
