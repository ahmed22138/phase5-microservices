import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RecurrencePattern } from './recurrence-pattern';

vi.mock('uuid', () => ({
  v4: () => 'test-recurrence-uuid',
}));

describe('RecurrencePattern', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor (new pattern)', () => {
    it('should create daily recurrence', () => {
      const pattern = new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
      });
      expect(pattern.id).toBe('test-recurrence-uuid');
      expect(pattern.frequency).toBe('daily');
      expect(pattern.interval).toBe(1);
      expect(pattern.status).toBe('active');
    });

    it('should create weekly recurrence', () => {
      const pattern = new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'weekly',
        daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
      });
      expect(pattern.frequency).toBe('weekly');
      expect(pattern.daysOfWeek).toEqual([1, 3, 5]);
    });

    it('should create monthly recurrence', () => {
      const pattern = new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'monthly',
        dayOfMonth: 15,
      });
      expect(pattern.frequency).toBe('monthly');
      expect(pattern.dayOfMonth).toBe(15);
    });

    it('should throw if weekly without daysOfWeek', () => {
      expect(() => new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'weekly',
      })).toThrow('Weekly recurrence requires at least one day of week');
    });

    it('should throw if monthly without dayOfMonth', () => {
      expect(() => new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'monthly',
      })).toThrow('Monthly recurrence requires day of month');
    });

    it('should throw on invalid interval', () => {
      expect(() => new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
        interval: 0,
      })).toThrow('Interval must be at least 1');
    });

    it('should throw on invalid day of week', () => {
      expect(() => new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'weekly',
        daysOfWeek: [7],
      })).toThrow('Days of week must be between 0 (Sunday) and 6 (Saturday)');
    });

    it('should throw on invalid dayOfMonth', () => {
      expect(() => new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'monthly',
        dayOfMonth: 32,
      })).toThrow('Day of month must be between 1 and 31');
    });

    it('should throw if endDate before startDate', () => {
      expect(() => new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-01-01'),
      })).toThrow('End date must be after start date');
    });
  });

  describe('constructor (from DB)', () => {
    it('should restore from existing data', () => {
      const pattern = new RecurrencePattern({
        id: 'existing-id',
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
        interval: 2,
        startDate: new Date('2026-01-01'),
        nextRunAt: new Date('2026-01-17'),
        status: 'active',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-15'),
      });
      expect(pattern.id).toBe('existing-id');
      expect(pattern.interval).toBe(2);
      expect(pattern.status).toBe('active');
    });
  });

  describe('calculateNextRun', () => {
    it('should calculate daily next run', () => {
      const pattern = new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
        interval: 3,
      });
      const fromDate = new Date('2026-01-15T12:00:00Z');
      const next = pattern.calculateNextRun(fromDate);
      expect(next.getUTCDate()).toBe(18);
    });

    it('should calculate monthly with day overflow', () => {
      const pattern = new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'monthly',
        dayOfMonth: 31,
      });
      // From Jan 15 -> next month Feb, but Feb doesn't have 31 days
      const fromDate = new Date('2026-01-15');
      const next = pattern.calculateNextRun(fromDate);
      expect(next.getMonth()).toBe(1); // February
      expect(next.getDate()).toBe(28); // Last day of Feb 2026
    });

    it('should calculate yearly', () => {
      const pattern = new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'yearly',
      });
      const fromDate = new Date('2026-01-15');
      const next = pattern.calculateNextRun(fromDate);
      expect(next.getFullYear()).toBe(2027);
    });
  });

  describe('trigger', () => {
    it('should update lastTriggeredAt and calculate next run', () => {
      const pattern = new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
      });
      const result = pattern.trigger();
      expect(result.isCompleted).toBe(false);
      expect(result.nextRunAt).toBeDefined();
      expect(pattern.lastTriggeredAt).toEqual(new Date('2026-01-15T12:00:00Z'));
    });

    it('should complete when next run exceeds endDate', () => {
      const pattern = new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
        endDate: new Date('2026-01-16T00:00:00Z'),
      });
      const result = pattern.trigger();
      expect(result.isCompleted).toBe(true);
      expect(pattern.status).toBe('completed');
    });
  });

  describe('pause / resume', () => {
    it('should pause active pattern', () => {
      const pattern = new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
      });
      pattern.pause();
      expect(pattern.status).toBe('paused');
    });

    it('should throw if pausing non-active', () => {
      const pattern = new RecurrencePattern({
        id: 'id',
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
        interval: 1,
        startDate: new Date(),
        nextRunAt: new Date(),
        status: 'paused',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(() => pattern.pause()).toThrow('Can only pause active recurrence');
    });

    it('should resume paused pattern', () => {
      const pattern = new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
      });
      pattern.pause();
      pattern.resume();
      expect(pattern.status).toBe('active');
    });

    it('should throw if resuming non-paused', () => {
      const pattern = new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
      });
      expect(() => pattern.resume()).toThrow('Can only resume paused recurrence');
    });
  });

  describe('isDue', () => {
    it('should return true when active and past nextRunAt', () => {
      const pattern = new RecurrencePattern({
        id: 'id',
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
        interval: 1,
        startDate: new Date('2026-01-01'),
        nextRunAt: new Date('2026-01-10'), // Past
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(pattern.isDue()).toBe(true);
    });

    it('should return false when paused', () => {
      const pattern = new RecurrencePattern({
        id: 'id',
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
        interval: 1,
        startDate: new Date('2026-01-01'),
        nextRunAt: new Date('2026-01-10'),
        status: 'paused',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(pattern.isDue()).toBe(false);
    });
  });

  describe('update', () => {
    it('should update frequency and recalculate', () => {
      const pattern = new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
      });
      pattern.update({ frequency: 'yearly' });
      expect(pattern.frequency).toBe('yearly');
    });

    it('should return previous pattern data', () => {
      const pattern = new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
        interval: 1,
      });
      const prev = pattern.update({ interval: 3 });
      expect(prev.interval).toBe(1);
      expect(pattern.interval).toBe(3);
    });
  });

  describe('toData', () => {
    it('should serialize all fields', () => {
      const pattern = new RecurrencePattern({
        taskId: 'task-1',
        userId: 'user-1',
        frequency: 'daily',
      });
      const data = pattern.toData();
      expect(data.id).toBe('test-recurrence-uuid');
      expect(data.taskId).toBe('task-1');
      expect(data.frequency).toBe('daily');
      expect(data.status).toBe('active');
    });
  });
});
