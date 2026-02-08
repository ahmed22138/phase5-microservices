import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Reminder, parseRelativeTime } from './reminder';

vi.mock('uuid', () => ({
  v4: () => 'test-reminder-uuid',
}));

describe('Reminder', () => {
  const validProps = {
    taskId: 'task-1',
    userId: 'user-1',
    reminderTime: new Date('2026-02-01T10:00:00Z'),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create reminder with defaults', () => {
      const reminder = new Reminder(validProps);
      expect(reminder.id).toBe('test-reminder-uuid');
      expect(reminder.taskId).toBe('task-1');
      expect(reminder.userId).toBe('user-1');
      expect(reminder.status).toBe('pending');
      expect(reminder.triggeredAt).toBeNull();
      expect(reminder.isPending).toBe(true);
    });

    it('should create with custom status', () => {
      const reminder = new Reminder({ ...validProps, status: 'triggered' });
      expect(reminder.status).toBe('triggered');
      expect(reminder.isPending).toBe(false);
    });
  });

  describe('isDue', () => {
    it('should return false when reminder time is in the future', () => {
      const reminder = new Reminder(validProps);
      expect(reminder.isDue).toBe(false);
    });

    it('should return true when reminder time has passed', () => {
      const reminder = new Reminder({
        ...validProps,
        reminderTime: new Date('2026-01-01T10:00:00Z'),
      });
      expect(reminder.isDue).toBe(true);
    });

    it('should return false when already triggered', () => {
      const reminder = new Reminder({
        ...validProps,
        reminderTime: new Date('2026-01-01T10:00:00Z'),
        status: 'triggered',
      });
      expect(reminder.isDue).toBe(false);
    });
  });

  describe('updateReminderTime', () => {
    it('should update time when pending', () => {
      const reminder = new Reminder(validProps);
      const newTime = new Date('2026-03-01T10:00:00Z');
      reminder.updateReminderTime(newTime);
      expect(reminder.reminderTime).toBe(newTime);
    });

    it('should throw when triggered', () => {
      const reminder = new Reminder({ ...validProps, status: 'triggered' });
      expect(() => reminder.updateReminderTime(new Date())).toThrow(
        'Cannot update reminder time for non-pending reminder'
      );
    });

    it('should throw when cancelled', () => {
      const reminder = new Reminder({ ...validProps, status: 'cancelled' });
      expect(() => reminder.updateReminderTime(new Date())).toThrow(
        'Cannot update reminder time for non-pending reminder'
      );
    });
  });

  describe('trigger', () => {
    it('should trigger pending reminder', () => {
      const reminder = new Reminder(validProps);
      reminder.trigger();
      expect(reminder.status).toBe('triggered');
      expect(reminder.triggeredAt).toEqual(new Date('2026-01-15T12:00:00Z'));
    });

    it('should throw when already triggered', () => {
      const reminder = new Reminder({ ...validProps, status: 'triggered' });
      expect(() => reminder.trigger()).toThrow('Cannot trigger reminder in triggered status');
    });

    it('should throw when cancelled', () => {
      const reminder = new Reminder({ ...validProps, status: 'cancelled' });
      expect(() => reminder.trigger()).toThrow('Cannot trigger reminder in cancelled status');
    });
  });

  describe('cancel', () => {
    it('should cancel pending reminder', () => {
      const reminder = new Reminder(validProps);
      reminder.cancel();
      expect(reminder.status).toBe('cancelled');
    });

    it('should throw when triggered', () => {
      const reminder = new Reminder({ ...validProps, status: 'triggered' });
      expect(() => reminder.cancel()).toThrow('Cannot cancel reminder in triggered status');
    });

    it('should throw when already cancelled', () => {
      const reminder = new Reminder({ ...validProps, status: 'cancelled' });
      expect(() => reminder.cancel()).toThrow('Cannot cancel reminder in cancelled status');
    });
  });

  describe('toData / fromData', () => {
    it('should round-trip correctly', () => {
      const reminder = new Reminder(validProps);
      const data = reminder.toData();
      const restored = Reminder.fromData(data);
      expect(restored.id).toBe(reminder.id);
      expect(restored.taskId).toBe('task-1');
      expect(restored.status).toBe('pending');
    });
  });
});

describe('parseRelativeTime', () => {
  const referenceDate = new Date('2026-02-01T10:00:00Z');

  it('should parse "30 minutes before"', () => {
    const result = parseRelativeTime('30 minutes before', referenceDate);
    expect(result).toEqual(new Date('2026-02-01T09:30:00Z'));
  });

  it('should parse "1 hour before"', () => {
    const result = parseRelativeTime('1 hour before', referenceDate);
    expect(result).toEqual(new Date('2026-02-01T09:00:00Z'));
  });

  it('should parse "2 hours before"', () => {
    const result = parseRelativeTime('2 hours before', referenceDate);
    expect(result).toEqual(new Date('2026-02-01T08:00:00Z'));
  });

  it('should parse "1 day before"', () => {
    const result = parseRelativeTime('1 day before', referenceDate);
    expect(result).toEqual(new Date('2026-01-31T10:00:00Z'));
  });

  it('should parse "2 days before"', () => {
    const result = parseRelativeTime('2 days before', referenceDate);
    expect(result).toEqual(new Date('2026-01-30T10:00:00Z'));
  });

  it('should parse "1 week before"', () => {
    const result = parseRelativeTime('1 week before', referenceDate);
    expect(result).toEqual(new Date('2026-01-25T10:00:00Z'));
  });

  it('should be case insensitive', () => {
    const result = parseRelativeTime('1 Hour Before', referenceDate);
    expect(result).toEqual(new Date('2026-02-01T09:00:00Z'));
  });

  it('should throw on invalid format', () => {
    expect(() => parseRelativeTime('invalid', referenceDate)).toThrow('Invalid relative time format');
  });

  it('should throw on unsupported format', () => {
    expect(() => parseRelativeTime('tomorrow', referenceDate)).toThrow('Invalid relative time format');
  });
});
