/**
 * Dapr Secret Store - Shared Secrets Utility
 * Building Block: Secrets Management
 * Fetches secrets from Dapr Secret Store instead of reading env vars directly
 */

import { DaprClient } from '@dapr/dapr';
import pino from 'pino';

const logger = pino({ name: 'secrets' });

// Use kubernetes-secrets in K8s, local-secrets in dev
const SECRET_STORE_NAME = process.env.DAPR_SECRET_STORE ?? 'local-secrets';

export interface DbSecrets {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
}

let daprClient: DaprClient | null = null;

function getClient(): DaprClient {
  if (!daprClient) {
    daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });
  }
  return daprClient;
}

/**
 * Fetch a secret from the Dapr Secret Store
 * Falls back to environment variables if Dapr is unavailable
 */
export async function getSecret(secretName: string): Promise<Record<string, string>> {
  try {
    const client = getClient();
    const secret = await client.secret.get(SECRET_STORE_NAME, secretName);
    logger.debug({ secretName, store: SECRET_STORE_NAME }, 'Secret fetched from Dapr');
    return secret;
  } catch (error) {
    logger.warn({ error, secretName }, 'Failed to fetch secret from Dapr, using env vars fallback');
    return {};
  }
}

/**
 * Get database connection secrets for a specific service
 * @param secretKey - The secret key (e.g., 'task-db', 'reminder-db')
 */
export async function getDbSecrets(secretKey: string): Promise<DbSecrets> {
  const secret = await getSecret(secretKey);

  // If Dapr returned the secret, use it; otherwise fall back to env vars
  if (secret && Object.keys(secret).length > 0) {
    return {
      host: secret.host ?? process.env.DB_HOST ?? 'localhost',
      port: secret.port ?? process.env.DB_PORT ?? '5432',
      database: secret.database ?? process.env.DB_NAME ?? '',
      username: secret.username ?? process.env.DB_USER ?? '',
      password: secret.password ?? process.env.DB_PASSWORD ?? '',
    };
  }

  // Env var fallback (works without Dapr)
  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: process.env.DB_PORT ?? '5432',
    database: process.env.DB_NAME ?? '',
    username: process.env.DB_USER ?? '',
    password: process.env.DB_PASSWORD ?? '',
  };
}

/**
 * Get a bulk set of secrets
 */
export async function getBulkSecrets(): Promise<Record<string, Record<string, string>>> {
  try {
    const client = getClient();
    const secrets = await client.secret.getBulk(SECRET_STORE_NAME);
    logger.debug({ store: SECRET_STORE_NAME, count: Object.keys(secrets).length }, 'Bulk secrets fetched');
    return secrets;
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch bulk secrets from Dapr');
    return {};
  }
}
