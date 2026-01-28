/**
 * OpenTelemetry Tracing Configuration
 * Constitution requirement: Distributed tracing (OpenTelemetry) MUST propagate correlation IDs
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } from '@opentelemetry/semantic-conventions';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// Enable diagnostic logging in development
if (process.env.NODE_ENV === 'development') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
}

const serviceName = process.env.SERVICE_NAME ?? 'chatbot';
const serviceVersion = process.env.SERVICE_VERSION ?? '1.0.0';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317';

const traceExporter = new OTLPTraceExporter({
  url: otlpEndpoint,
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
  }),
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Disable filesystem instrumentation (noisy)
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-pg': {
        enabled: true,
      },
    }),
  ],
  textMapPropagator: new W3CTraceContextPropagator(),
});

/**
 * Initialize OpenTelemetry tracing
 * Call this at the very start of your application
 */
export function initTracing(): void {
  sdk.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => { console.log('Tracing terminated'); })
      .catch((error: unknown) => { console.error('Error terminating tracing', error); })
      .finally(() => process.exit(0));
  });
}

export { sdk };
