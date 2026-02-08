import { describe, it, expect } from 'vitest';
import { RecurrenceCalculator } from './recurrence-calculator';

describe('RecurrenceCalculator', () => {
  describe('calculateNextRun', () => {
    it('should calculate daily', () => {
      const fromDate = new Date('2026-01-15T12:00:00Z');
      const result = RecurrenceCalculator.calculateNextRun(
        { frequency: 'daily', interval: 1, startDate: new Date('2026-01-01T00:00:00Z') },
        fromDate
      );
      expect(result.nextRun.getUTCDate()).toBe(16);
      expect(result.isCompleted).toBe(false);
    });

    it('should calculate daily with interval', () => {
      const fromDate = new Date('2026-01-15T12:00:00Z');
      const result = RecurrenceCalculator.calculateNextRun(
        { frequency: 'daily', interval: 3, startDate: new Date('2026-01-01T00:00:00Z') },
        fromDate
      );
      expect(result.nextRun.getUTCDate()).toBe(18);
    });

    it('should mark completed when past endDate', () => {
      const result = RecurrenceCalculator.calculateNextRun(
        {
          frequency: 'daily',
          interval: 1,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-01-16'),
        },
        new Date('2026-01-16')
      );
      expect(result.isCompleted).toBe(true);
    });

    it('should calculate weekly', () => {
      // Jan 15, 2026 is Thursday (day 4)
      const result = RecurrenceCalculator.calculateNextRun(
        {
          frequency: 'weekly',
          interval: 1,
          daysOfWeek: [1], // Monday
          startDate: new Date('2026-01-01'),
        },
        new Date('2026-01-15') // Thursday
      );
      // Next Monday after Thursday Jan 15 = Jan 19
      expect(result.nextRun.getDay()).toBe(1); // Monday
    });

    it('should throw for weekly without days', () => {
      expect(() =>
        RecurrenceCalculator.calculateNextRun(
          { frequency: 'weekly', interval: 1, daysOfWeek: [], startDate: new Date() },
          new Date()
        )
      ).toThrow('Weekly recurrence requires at least one day of week');
    });

    it('should calculate monthly', () => {
      const result = RecurrenceCalculator.calculateNextRun(
        {
          frequency: 'monthly',
          interval: 1,
          dayOfMonth: 20,
          startDate: new Date('2026-01-01'),
        },
        new Date('2026-01-15')
      );
      expect(result.nextRun.getMonth()).toBe(1); // February
      expect(result.nextRun.getDate()).toBe(20);
    });

    it('should handle monthly day overflow (31st in Feb)', () => {
      const result = RecurrenceCalculator.calculateNextRun(
        {
          frequency: 'monthly',
          interval: 1,
          dayOfMonth: 31,
          startDate: new Date('2026-01-01'),
        },
        new Date('2026-01-15')
      );
      expect(result.nextRun.getMonth()).toBe(1); // February
      expect(result.nextRun.getDate()).toBe(28); // Last day of Feb 2026
    });

    it('should calculate yearly', () => {
      const result = RecurrenceCalculator.calculateNextRun(
        { frequency: 'yearly', interval: 1, startDate: new Date('2026-01-01') },
        new Date('2026-06-15')
      );
      expect(result.nextRun.getFullYear()).toBe(2027);
    });

    it('should handle leap year (Feb 29)', () => {
      // 2028 is a leap year, 2029 is not
      const result = RecurrenceCalculator.calculateNextRun(
        { frequency: 'yearly', interval: 1, startDate: new Date('2028-02-29') },
        new Date('2028-02-29')
      );
      expect(result.nextRun.getFullYear()).toBe(2029);
      expect(result.nextRun.getMonth()).toBe(1); // Feb
      expect(result.nextRun.getDate()).toBe(28); // Not leap year
    });

    it('should throw on unknown frequency', () => {
      expect(() =>
        RecurrenceCalculator.calculateNextRun(
          { frequency: 'hourly' as any, interval: 1, startDate: new Date() },
          new Date()
        )
      ).toThrow('Unknown frequency');
    });
  });

  describe('generateOccurrences', () => {
    it('should generate multiple daily occurrences', () => {
      const occurrences = RecurrenceCalculator.generateOccurrences(
        { frequency: 'daily', interval: 1, startDate: new Date('2026-01-01T12:00:00Z') },
        5,
        new Date('2026-01-01T12:00:00Z')
      );
      expect(occurrences).toHaveLength(5);
      expect(occurrences[0].getUTCDate()).toBe(2);
      expect(occurrences[4].getUTCDate()).toBe(6);
    });

    it('should stop at endDate', () => {
      const occurrences = RecurrenceCalculator.generateOccurrences(
        {
          frequency: 'daily',
          interval: 1,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-01-04'),
        },
        10,
        new Date('2026-01-01')
      );
      expect(occurrences.length).toBeLessThanOrEqual(3);
    });

    it('should use startDate as default fromDate', () => {
      const occurrences = RecurrenceCalculator.generateOccurrences(
        { frequency: 'daily', interval: 1, startDate: new Date('2026-01-01T12:00:00Z') },
        3
      );
      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].getUTCDate()).toBe(2);
    });
  });

  describe('validate', () => {
    it('should pass valid daily input', () => {
      const result = RecurrenceCalculator.validate({
        frequency: 'daily',
        interval: 1,
        startDate: new Date(),
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail on interval < 1', () => {
      const result = RecurrenceCalculator.validate({
        frequency: 'daily',
        interval: 0,
        startDate: new Date(),
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Interval must be at least 1');
    });

    it('should fail on weekly without daysOfWeek', () => {
      const result = RecurrenceCalculator.validate({
        frequency: 'weekly',
        interval: 1,
        startDate: new Date(),
      });
      expect(result.valid).toBe(false);
    });

    it('should fail on invalid day of week', () => {
      const result = RecurrenceCalculator.validate({
        frequency: 'weekly',
        interval: 1,
        daysOfWeek: [8],
        startDate: new Date(),
      });
      expect(result.valid).toBe(false);
    });

    it('should fail on monthly without dayOfMonth', () => {
      const result = RecurrenceCalculator.validate({
        frequency: 'monthly',
        interval: 1,
        startDate: new Date(),
      });
      expect(result.valid).toBe(false);
    });

    it('should fail on invalid dayOfMonth', () => {
      const result = RecurrenceCalculator.validate({
        frequency: 'monthly',
        interval: 1,
        dayOfMonth: 0,
        startDate: new Date(),
      });
      expect(result.valid).toBe(false);
    });

    it('should fail on endDate before startDate', () => {
      const result = RecurrenceCalculator.validate({
        frequency: 'daily',
        interval: 1,
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-01-01'),
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('describe', () => {
    it('should describe daily', () => {
      expect(RecurrenceCalculator.describe({
        frequency: 'daily', interval: 1, startDate: new Date(),
      })).toBe('Every day');
    });

    it('should describe daily with interval', () => {
      expect(RecurrenceCalculator.describe({
        frequency: 'daily', interval: 3, startDate: new Date(),
      })).toBe('Every 3 days');
    });

    it('should describe weekly', () => {
      const desc = RecurrenceCalculator.describe({
        frequency: 'weekly', interval: 1, daysOfWeek: [1, 3], startDate: new Date(),
      });
      expect(desc).toBe('Every Monday, Wednesday');
    });

    it('should describe weekly with interval', () => {
      const desc = RecurrenceCalculator.describe({
        frequency: 'weekly', interval: 2, daysOfWeek: [5], startDate: new Date(),
      });
      expect(desc).toBe('Every 2 weeks on Friday');
    });

    it('should describe monthly', () => {
      expect(RecurrenceCalculator.describe({
        frequency: 'monthly', interval: 1, dayOfMonth: 15, startDate: new Date(),
      })).toBe('Every month on the 15th');
    });

    it('should describe yearly', () => {
      expect(RecurrenceCalculator.describe({
        frequency: 'yearly', interval: 1, startDate: new Date(),
      })).toBe('Every year');
    });

    it('should describe yearly with interval', () => {
      expect(RecurrenceCalculator.describe({
        frequency: 'yearly', interval: 2, startDate: new Date(),
      })).toBe('Every 2 years');
    });
  });

  describe('calculateFirstRun', () => {
    it('should return start date for daily', () => {
      const start = new Date('2026-01-15');
      const result = RecurrenceCalculator.calculateFirstRun({
        frequency: 'daily', interval: 1, startDate: start,
      });
      expect(result).toEqual(start);
    });

    it('should find first matching day for weekly', () => {
      // Jan 15, 2026 is Thursday (4)
      const result = RecurrenceCalculator.calculateFirstRun({
        frequency: 'weekly', interval: 1, daysOfWeek: [5], startDate: new Date('2026-01-15'),
      });
      // Next Friday is Jan 16
      expect(result.getDay()).toBe(5);
    });

    it('should return startDate if it matches weekly day', () => {
      // Jan 15, 2026 is Thursday (4)
      const result = RecurrenceCalculator.calculateFirstRun({
        frequency: 'weekly', interval: 1, daysOfWeek: [4], startDate: new Date('2026-01-15'),
      });
      expect(result.getDate()).toBe(15);
    });

    it('should adjust to dayOfMonth for monthly', () => {
      const result = RecurrenceCalculator.calculateFirstRun({
        frequency: 'monthly', interval: 1, dayOfMonth: 20, startDate: new Date('2026-01-15'),
      });
      expect(result.getDate()).toBe(20);
      expect(result.getMonth()).toBe(0); // Same month
    });

    it('should move to next month if dayOfMonth passed', () => {
      const result = RecurrenceCalculator.calculateFirstRun({
        frequency: 'monthly', interval: 1, dayOfMonth: 10, startDate: new Date('2026-01-15'),
      });
      expect(result.getMonth()).toBe(1); // February
      expect(result.getDate()).toBe(10);
    });
  });
});
