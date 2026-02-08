/**
 * Dapr State Store - User Session Management
 * Building Block: State Management
 * Stores user conversation context using Dapr state API
 */

import { DaprClient } from '@dapr/dapr';
import pino from 'pino';

const logger = pino({ name: 'session-store' });

const STATESTORE_NAME = 'statestore';

export interface UserSession {
  userId: string;
  lastTaskId?: string;
  lastAction?: string;
  lastSearchQuery?: string;
  conversationCount: number;
  lastActiveAt: string;
  preferences?: {
    defaultPriority?: string;
    defaultTags?: string[];
  };
}

export class SessionStore {
  private readonly daprClient: DaprClient;

  constructor() {
    this.daprClient = new DaprClient({
      daprHost: process.env.DAPR_HOST ?? 'localhost',
      daprPort: process.env.DAPR_HTTP_PORT ?? '3500',
    });
  }

  /**
   * Get user session from Dapr state store
   */
  async getSession(userId: string): Promise<UserSession | null> {
    try {
      const state = await this.daprClient.state.get(STATESTORE_NAME, `session-${userId}`);
      if (!state) return null;
      return state as unknown as UserSession;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get session from state store');
      return null;
    }
  }

  /**
   * Save user session to Dapr state store
   */
  async saveSession(session: UserSession): Promise<void> {
    try {
      await this.daprClient.state.save(STATESTORE_NAME, [
        {
          key: `session-${session.userId}`,
          value: session,
        },
      ]);
      logger.debug({ userId: session.userId }, 'Session saved to state store');
    } catch (error) {
      logger.error({ error, userId: session.userId }, 'Failed to save session to state store');
    }
  }

  /**
   * Update session with latest action context
   */
  async updateContext(userId: string, context: {
    lastTaskId?: string;
    lastAction?: string;
    lastSearchQuery?: string;
  }): Promise<void> {
    let session = await this.getSession(userId);

    if (!session) {
      session = {
        userId,
        conversationCount: 0,
        lastActiveAt: new Date().toISOString(),
      };
    }

    session.conversationCount += 1;
    session.lastActiveAt = new Date().toISOString();
    if (context.lastTaskId) session.lastTaskId = context.lastTaskId;
    if (context.lastAction) session.lastAction = context.lastAction;
    if (context.lastSearchQuery) session.lastSearchQuery = context.lastSearchQuery;

    await this.saveSession(session);
  }

  /**
   * Delete user session from state store
   */
  async deleteSession(userId: string): Promise<void> {
    try {
      await this.daprClient.state.delete(STATESTORE_NAME, `session-${userId}`);
      logger.debug({ userId }, 'Session deleted from state store');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to delete session from state store');
    }
  }
}

// Singleton
let instance: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  instance ??= new SessionStore();
  return instance;
}
