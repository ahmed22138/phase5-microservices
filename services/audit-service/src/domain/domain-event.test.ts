import { describe, it, expect, vi } from 'vitest';
import { DomainEvent } from './domain-event';

vi.mock('uuid', () => ({
  v4: () => 'test-event-uuid',
}));

describe('DomainEvent', () => {
  const validInput = {
    eventType: 'task.created',
    aggregateType: 'task' as const,
    aggregateId: 'task-1',
    userId: 'user-1',
    correlationId: 'corr-1',
    payload: { title: 'Buy milk' },
  };

  describe('constructor (new event)', () => {
    it('should create event with auto-generated id', () => {
      const event = new DomainEvent(validInput);
      expect(event.id).toBe('test-event-uuid');
      expect(event.eventType).toBe('task.created');
      expect(event.aggregateType).toBe('task');
      expect(event.aggregateId).toBe('task-1');
      expect(event.userId).toBe('user-1');
      expect(event.correlationId).toBe('corr-1');
      expect(event.payload).toEqual({ title: 'Buy milk' });
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should accept custom timestamp', () => {
      const ts = new Date('2026-01-01');
      const event = new DomainEvent({ ...validInput, timestamp: ts });
      expect(event.timestamp).toBe(ts);
    });

    it('should accept metadata', () => {
      const event = new DomainEvent({
        ...validInput,
        metadata: { serviceName: 'chatbot', toolName: 'task.create', traceId: 'trace-1' },
      });
      expect(event.metadata?.serviceName).toBe('chatbot');
      expect(event.metadata?.toolName).toBe('task.create');
      expect(event.metadata?.traceId).toBe('trace-1');
    });
  });

  describe('constructor (existing event from DB)', () => {
    it('should restore from data', () => {
      const event = new DomainEvent({
        id: 'existing-id',
        eventType: 'task.completed',
        aggregateType: 'task',
        aggregateId: 'task-2',
        userId: 'user-1',
        correlationId: 'corr-2',
        timestamp: new Date('2026-01-10'),
        payload: { status: 'completed' },
      });
      expect(event.id).toBe('existing-id');
      expect(event.eventType).toBe('task.completed');
    });
  });

  describe('toData', () => {
    it('should serialize all fields', () => {
      const event = new DomainEvent(validInput);
      const data = event.toData();
      expect(data.id).toBe('test-event-uuid');
      expect(data.eventType).toBe('task.created');
      expect(data.aggregateType).toBe('task');
      expect(data.aggregateId).toBe('task-1');
      expect(data.userId).toBe('user-1');
      expect(data.correlationId).toBe('corr-1');
      expect(data.payload).toEqual({ title: 'Buy milk' });
    });
  });

  describe('toJSON', () => {
    it('should return JSON-friendly object with ISO timestamp', () => {
      const ts = new Date('2026-01-15T12:00:00Z');
      const event = new DomainEvent({ ...validInput, timestamp: ts });
      const json = event.toJSON();
      expect(json.timestamp).toBe('2026-01-15T12:00:00.000Z');
      expect(json.eventType).toBe('task.created');
    });
  });

  describe('fromKafkaEvent', () => {
    it('should create event from Kafka message', () => {
      const event = DomainEvent.fromKafkaEvent({
        eventType: 'reminder.triggered',
        aggregateType: 'reminder',
        aggregateId: 'reminder-1',
        userId: 'user-1',
        correlationId: 'corr-3',
        timestamp: '2026-01-15T12:00:00.000Z',
        payload: { taskId: 'task-1' },
        metadata: { serviceName: 'reminder-service' },
      });
      expect(event.id).toBe('test-event-uuid');
      expect(event.eventType).toBe('reminder.triggered');
      expect(event.aggregateType).toBe('reminder');
      expect(event.timestamp).toEqual(new Date('2026-01-15T12:00:00.000Z'));
      expect(event.metadata?.serviceName).toBe('reminder-service');
    });

    it('should parse timestamp string correctly', () => {
      const event = DomainEvent.fromKafkaEvent({
        eventType: 'task.updated',
        aggregateType: 'task',
        aggregateId: 'task-5',
        userId: 'user-2',
        correlationId: 'corr-5',
        timestamp: '2026-06-15T08:30:00.000Z',
        payload: {},
      });
      expect(event.timestamp.getFullYear()).toBe(2026);
      expect(event.timestamp.getMonth()).toBe(5); // June
    });
  });

  describe('aggregate types', () => {
    it('should accept task aggregate', () => {
      const event = new DomainEvent({ ...validInput, aggregateType: 'task' });
      expect(event.aggregateType).toBe('task');
    });

    it('should accept reminder aggregate', () => {
      const event = new DomainEvent({ ...validInput, aggregateType: 'reminder' });
      expect(event.aggregateType).toBe('reminder');
    });

    it('should accept recurrence aggregate', () => {
      const event = new DomainEvent({ ...validInput, aggregateType: 'recurrence' });
      expect(event.aggregateType).toBe('recurrence');
    });
  });
});
