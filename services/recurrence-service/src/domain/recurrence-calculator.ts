/**
 * Recurrence Calculator
 * Advanced logic for calculating next occurrence dates
 * Reference: spec.md FR-017, FR-018
 * Task: P5-T-075
 */

import type { RecurrenceFrequency } from './recurrence-pattern';

export interface RecurrenceInput {
  frequency: RecurrenceFrequency;
  interval: number;
  daysOfWeek?: number[]; // 0-6, Sunday=0
  dayOfMonth?: number; // 1-31
  startDate: Date;
  endDate?: Date;
}

export interface NextRunResult {
  nextRun: Date;
  isCompleted: boolean;
}

export class RecurrenceCalculator {
  /**
   * Calculate the next run time from a given date
   */
  static calculateNextRun(input: RecurrenceInput, fromDate: Date): NextRunResult {
    let nextRun: Date;

    switch (input.frequency) {
      case 'daily':
        nextRun = this.calculateDaily(fromDate, input.interval);
        break;
      case 'weekly':
        nextRun = this.calculateWeekly(fromDate, input.interval, input.daysOfWeek ?? []);
        break;
      case 'monthly':
        nextRun = this.calculateMonthly(fromDate, input.interval, input.dayOfMonth ?? 1);
        break;
      case 'yearly':
        nextRun = this.calculateYearly(fromDate, input.interval);
        break;
      default:
        throw new Error(`Unknown frequency: ${input.frequency}`);
    }

    // Check if we've exceeded the end date
    if (input.endDate && nextRun > input.endDate) {
      return { nextRun, isCompleted: true };
    }

    return { nextRun, isCompleted: false };
  }

  /**
   * Calculate next daily occurrence
   */
  private static calculateDaily(fromDate: Date, interval: number): Date {
    const next = new Date(fromDate);
    next.setDate(next.getDate() + interval);
    return next;
  }

  /**
   * Calculate next weekly occurrence on specified days
   */
  private static calculateWeekly(fromDate: Date, interval: number, daysOfWeek: number[]): Date {
    if (daysOfWeek.length === 0) {
      throw new Error('Weekly recurrence requires at least one day of week');
    }

    // Sort days of week for consistent iteration
    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);

    const next = new Date(fromDate);
    next.setDate(next.getDate() + 1); // Start from next day

    let weeksToAdd = 0;
    let found = false;

    // Look for next occurrence in current week first
    const startDay = next.getDay();
    for (const day of sortedDays) {
      if (day >= startDay) {
        // Found a day in the current week
        const daysToAdd = day - startDay;
        next.setDate(next.getDate() + daysToAdd);
        found = true;
        break;
      }
    }

    if (!found) {
      // Move to next interval week and use first day
      weeksToAdd = interval;
      const firstDay = sortedDays[0];
      const currentDay = next.getDay();
      const daysToFirstDay = (firstDay - currentDay + 7) % 7 || 7;
      next.setDate(next.getDate() + daysToFirstDay + (weeksToAdd - 1) * 7);
    } else if (interval > 1) {
      // Apply interval to the found date
      next.setDate(next.getDate() + (interval - 1) * 7);
    }

    return next;
  }

  /**
   * Calculate next monthly occurrence
   */
  private static calculateMonthly(fromDate: Date, interval: number, dayOfMonth: number): Date {
    const next = new Date(fromDate);

    // Move to next month
    next.setMonth(next.getMonth() + interval);

    // Set to the specified day, handling month overflow
    const lastDayOfMonth = this.getLastDayOfMonth(next.getFullYear(), next.getMonth());
    next.setDate(Math.min(dayOfMonth, lastDayOfMonth));

    // Preserve the time from the original date
    next.setHours(fromDate.getHours(), fromDate.getMinutes(), fromDate.getSeconds(), fromDate.getMilliseconds());

    return next;
  }

  /**
   * Calculate next yearly occurrence
   */
  private static calculateYearly(fromDate: Date, interval: number): Date {
    const next = new Date(fromDate);
    next.setFullYear(next.getFullYear() + interval);

    // Handle Feb 29 in non-leap years
    if (fromDate.getMonth() === 1 && fromDate.getDate() === 29) {
      if (!this.isLeapYear(next.getFullYear())) {
        next.setDate(28);
      }
    }

    return next;
  }

  /**
   * Get the last day of a month
   */
  private static getLastDayOfMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
  }

  /**
   * Check if a year is a leap year
   */
  private static isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }

  /**
   * Generate multiple future occurrences
   */
  static generateOccurrences(input: RecurrenceInput, count: number, fromDate?: Date): Date[] {
    const occurrences: Date[] = [];
    let currentDate = fromDate ?? input.startDate;

    for (let i = 0; i < count; i++) {
      const result = this.calculateNextRun(input, currentDate);
      if (result.isCompleted) {
        break;
      }
      occurrences.push(result.nextRun);
      currentDate = result.nextRun;
    }

    return occurrences;
  }

  /**
   * Calculate the first occurrence from the start date
   */
  static calculateFirstRun(input: RecurrenceInput): Date {
    // For weekly, find the first matching day on or after start date
    if (input.frequency === 'weekly' && input.daysOfWeek && input.daysOfWeek.length > 0) {
      const start = new Date(input.startDate);
      const currentDay = start.getDay();

      // Check if start date matches any day
      if (input.daysOfWeek.includes(currentDay)) {
        return start;
      }

      // Find next matching day
      const sortedDays = [...input.daysOfWeek].sort((a, b) => a - b);
      for (const day of sortedDays) {
        if (day > currentDay) {
          start.setDate(start.getDate() + (day - currentDay));
          return start;
        }
      }

      // Next week's first day
      const daysUntilNextWeek = 7 - currentDay + sortedDays[0];
      start.setDate(start.getDate() + daysUntilNextWeek);
      return start;
    }

    // For monthly, adjust to the specified day
    if (input.frequency === 'monthly' && input.dayOfMonth) {
      const start = new Date(input.startDate);
      const lastDay = this.getLastDayOfMonth(start.getFullYear(), start.getMonth());
      const targetDay = Math.min(input.dayOfMonth, lastDay);

      if (start.getDate() <= targetDay) {
        start.setDate(targetDay);
        return start;
      } else {
        // Move to next month
        start.setMonth(start.getMonth() + 1);
        const nextLastDay = this.getLastDayOfMonth(start.getFullYear(), start.getMonth());
        start.setDate(Math.min(input.dayOfMonth, nextLastDay));
        return start;
      }
    }

    // For daily and yearly, the start date is the first run
    return new Date(input.startDate);
  }

  /**
   * Validate recurrence input
   */
  static validate(input: RecurrenceInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (input.interval < 1) {
      errors.push('Interval must be at least 1');
    }

    if (input.frequency === 'weekly') {
      if (!input.daysOfWeek || input.daysOfWeek.length === 0) {
        errors.push('Weekly recurrence requires at least one day of week');
      } else {
        for (const day of input.daysOfWeek) {
          if (day < 0 || day > 6) {
            errors.push(`Invalid day of week: ${day}. Must be 0-6 (Sunday-Saturday)`);
          }
        }
      }
    }

    if (input.frequency === 'monthly') {
      if (!input.dayOfMonth) {
        errors.push('Monthly recurrence requires day of month');
      } else if (input.dayOfMonth < 1 || input.dayOfMonth > 31) {
        errors.push('Day of month must be between 1 and 31');
      }
    }

    if (input.endDate && input.endDate <= input.startDate) {
      errors.push('End date must be after start date');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get human-readable description of recurrence
   */
  static describe(input: RecurrenceInput): string {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    switch (input.frequency) {
      case 'daily':
        if (input.interval === 1) return 'Every day';
        return `Every ${input.interval} days`;

      case 'weekly':
        const days = (input.daysOfWeek ?? []).map(d => dayNames[d]).join(', ');
        if (input.interval === 1) return `Every ${days}`;
        return `Every ${input.interval} weeks on ${days}`;

      case 'monthly':
        const ordinal = this.getOrdinal(input.dayOfMonth ?? 1);
        if (input.interval === 1) return `Every month on the ${ordinal}`;
        return `Every ${input.interval} months on the ${ordinal}`;

      case 'yearly':
        if (input.interval === 1) return 'Every year';
        return `Every ${input.interval} years`;

      default:
        return 'Unknown recurrence';
    }
  }

  private static getOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
}
