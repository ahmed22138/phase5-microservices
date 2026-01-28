// Prometheus Metrics Module
// Task: P5-T-118
// Shared metrics configuration for all Phase 5 services

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create a shared registry
export const metricsRegistry = new Registry();

// Collect default Node.js metrics
collectDefaultMetrics({ register: metricsRegistry });

// HTTP Request metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

// Database metrics
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [metricsRegistry],
});

export const dbConnectionsActive = new Gauge({
  name: 'db_connections_active',
  help: 'Number of active database connections',
  registers: [metricsRegistry],
});

export const dbConnectionsIdle = new Gauge({
  name: 'db_connections_idle',
  help: 'Number of idle database connections',
  registers: [metricsRegistry],
});

// Event/Message metrics
export const eventsPublished = new Counter({
  name: 'events_published_total',
  help: 'Total number of events published',
  labelNames: ['event_type', 'topic'],
  registers: [metricsRegistry],
});

export const eventsConsumed = new Counter({
  name: 'events_consumed_total',
  help: 'Total number of events consumed',
  labelNames: ['event_type', 'topic', 'status'],
  registers: [metricsRegistry],
});

export const eventProcessingDuration = new Histogram({
  name: 'event_processing_duration_seconds',
  help: 'Event processing duration in seconds',
  labelNames: ['event_type', 'topic'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
  registers: [metricsRegistry],
});

// Business metrics
export const tasksCreated = new Counter({
  name: 'tasks_created_total',
  help: 'Total number of tasks created',
  labelNames: ['priority'],
  registers: [metricsRegistry],
});

export const tasksCompleted = new Counter({
  name: 'tasks_completed_total',
  help: 'Total number of tasks completed',
  labelNames: ['priority'],
  registers: [metricsRegistry],
});

export const remindersTriggered = new Counter({
  name: 'reminders_triggered_total',
  help: 'Total number of reminders triggered',
  registers: [metricsRegistry],
});

export const recurrencePatternsActive = new Gauge({
  name: 'recurrence_patterns_active',
  help: 'Number of active recurrence patterns',
  registers: [metricsRegistry],
});

// Error metrics
export const errorsTotal = new Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'operation'],
  registers: [metricsRegistry],
});

// Express middleware for metrics
export function metricsMiddleware(serviceName: string) {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = (Date.now() - startTime) / 1000;
      const route = req.route?.path || req.path || 'unknown';

      httpRequestsTotal.inc({
        method: req.method,
        route,
        status_code: res.statusCode,
      });

      httpRequestDuration.observe(
        {
          method: req.method,
          route,
          status_code: res.statusCode,
        },
        duration
      );
    });

    next();
  };
}

// Metrics endpoint handler
export function metricsHandler() {
  return async (_req: any, res: any) => {
    try {
      res.set('Content-Type', metricsRegistry.contentType);
      res.end(await metricsRegistry.metrics());
    } catch (error) {
      res.status(500).end('Error collecting metrics');
    }
  };
}

// Helper to measure async operations
export async function measureDuration<T>(
  histogram: Histogram,
  labels: Record<string, string>,
  operation: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    return await operation();
  } finally {
    const duration = (Date.now() - startTime) / 1000;
    histogram.observe(labels, duration);
  }
}
