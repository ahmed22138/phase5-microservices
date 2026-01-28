/**
 * RecurrencePattern Domain Model
 * Defines recurrence patterns for tasks
 * Reference: spec.md User Story 5, FR-017 to FR-021
 * Task: P5-T-074
 */

import { v4 as uuidv4 } from 'uuid';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type RecurrenceStatus = 'active' | 'paused' | 'completed';

export interface RecurrencePatternData {
  id: string;
  taskId: string;
  userId: string;
  frequency: RecurrenceFrequency;
  interval: number;
  daysOfWeek?: number[]; // 0-6, Sunday=0
  dayOfMonth?: number; // 1-31
  startDate: Date;
  endDate?: Date;
  nextRunAt: Date;
  status: RecurrenceStatus;
  lastTriggeredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRecurrencePatternInput {
  taskId: string;
  userId: string;
  frequency: RecurrenceFrequency;
  interval?: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  startDate?: Date;
  endDate?: Date;
}

export class RecurrencePattern {
  private readonly _id: string;
  private readonly _taskId: string;
  private readonly _userId: string;
  private _frequency: RecurrenceFrequency;
  private _interval: number;
  private _daysOfWeek?: number[];
  private _dayOfMonth?: number;
  private _startDate: Date;
  private _endDate?: Date;
  private _nextRunAt: Date;
  private _status: RecurrenceStatus;
  private _lastTriggeredAt?: Date;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  constructor(data: CreateRecurrencePatternInput | RecurrencePatternData) {
    if ('createdAt' in data) {
      // Existing pattern from DB
      this._id = data.id;
      this._taskId = data.taskId;
      this._userId = data.userId;
      this._frequency = data.frequency;
      this._interval = data.interval;
      this._daysOfWeek = data.daysOfWeek;
      this._dayOfMonth = data.dayOfMonth;
      this._startDate = data.startDate;
      this._endDate = data.endDate;
      this._nextRunAt = data.nextRunAt;
      this._status = data.status;
      this._lastTriggeredAt = data.lastTriggeredAt;
      this._createdAt = data.createdAt;
      this._updatedAt = data.updatedAt;
    } else {
      // New pattern
      this._id = uuidv4();
      this._taskId = data.taskId;
      this._userId = data.userId;
      this._frequency = data.frequency;
      this._interval = data.interval ?? 1;
      this._daysOfWeek = data.daysOfWeek;
      this._dayOfMonth = data.dayOfMonth;
      this._startDate = data.startDate ?? new Date();
      this._endDate = data.endDate;
      this._status = 'active';
      this._createdAt = new Date();
      this._updatedAt = new Date();

      // Validate and set initial next run
      this.validate();
      this._nextRunAt = this.calculateNextRun(this._startDate);
    }
  }

  // Getters
  get id(): string { return this._id; }
  get taskId(): string { return this._taskId; }
  get userId(): string { return this._userId; }
  get frequency(): RecurrenceFrequency { return this._frequency; }
  get interval(): number { return this._interval; }
  get daysOfWeek(): number[] | undefined { return this._daysOfWeek; }
  get dayOfMonth(): number | undefined { return this._dayOfMonth; }
  get startDate(): Date { return this._startDate; }
  get endDate(): Date | undefined { return this._endDate; }
  get nextRunAt(): Date { return this._nextRunAt; }
  get status(): RecurrenceStatus { return this._status; }
  get lastTriggeredAt(): Date | undefined { return this._lastTriggeredAt; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  /**
   * Validate the recurrence pattern
   */
  private validate(): void {
    if (this._interval < 1) {
      throw new Error('Interval must be at least 1');
    }

    if (this._frequency === 'weekly' && (!this._daysOfWeek || this._daysOfWeek.length === 0)) {
      throw new Error('Weekly recurrence requires at least one day of week');
    }

    if (this._daysOfWeek) {
      for (const day of this._daysOfWeek) {
        if (day < 0 || day > 6) {
          throw new Error('Days of week must be between 0 (Sunday) and 6 (Saturday)');
        }
      }
    }

    if (this._frequency === 'monthly' && !this._dayOfMonth) {
      throw new Error('Monthly recurrence requires day of month');
    }

    if (this._dayOfMonth !== undefined && (this._dayOfMonth < 1 || this._dayOfMonth > 31)) {
      throw new Error('Day of month must be between 1 and 31');
    }

    if (this._endDate && this._endDate <= this._startDate) {
      throw new Error('End date must be after start date');
    }
  }

  /**
   * Calculate the next run time from a given date
   */
  calculateNextRun(fromDate: Date): Date {
    const nextRun = new Date(fromDate);

    switch (this._frequency) {
      case 'daily':
        nextRun.setDate(nextRun.getDate() + this._interval);
        break;

      case 'weekly': {
        // Find the next occurrence on specified days
        nextRun.setDate(nextRun.getDate() + 1); // Start from next day
        let foundDay = false;
        let daysChecked = 0;
        while (!foundDay && daysChecked < 14) { // Max 2 weeks to find next day
          const currentDay = nextRun.getDay();
          if (this._daysOfWeek?.includes(currentDay)) {
            foundDay = true;
          } else {
            nextRun.setDate(nextRun.getDate() + 1);
          }
          daysChecked++;
        }
        // Apply interval (weeks)
        if (this._interval > 1) {
          nextRun.setDate(nextRun.getDate() + (this._interval - 1) * 7);
        }
        break;
      }

      case 'monthly':
        nextRun.setMonth(nextRun.getMonth() + this._interval);
        if (this._dayOfMonth) {
          // Handle months with fewer days
          const lastDayOfMonth = new Date(nextRun.getFullYear(), nextRun.getMonth() + 1, 0).getDate();
          nextRun.setDate(Math.min(this._dayOfMonth, lastDayOfMonth));
        }
        break;

      case 'yearly':
        nextRun.setFullYear(nextRun.getFullYear() + this._interval);
        break;
    }

    return nextRun;
  }

  /**
   * Mark the recurrence as triggered and calculate next run
   */
  trigger(): { isCompleted: boolean; nextRunAt?: Date } {
    this._lastTriggeredAt = new Date();
    this._updatedAt = new Date();

    // Calculate next run
    const nextRun = this.calculateNextRun(this._lastTriggeredAt);

    // Check if we've reached the end date
    if (this._endDate && nextRun > this._endDate) {
      this._status = 'completed';
      return { isCompleted: true };
    }

    this._nextRunAt = nextRun;
    return { isCompleted: false, nextRunAt: nextRun };
  }

  /**
   * Pause the recurrence
   */
  pause(): void {
    if (this._status !== 'active') {
      throw new Error('Can only pause active recurrence');
    }
    this._status = 'paused';
    this._updatedAt = new Date();
  }

  /**
   * Resume a paused recurrence
   */
  resume(): void {
    if (this._status !== 'paused') {
      throw new Error('Can only resume paused recurrence');
    }
    this._status = 'active';
    this._updatedAt = new Date();

    // Recalculate next run if it's in the past
    const now = new Date();
    if (this._nextRunAt < now) {
      this._nextRunAt = this.calculateNextRun(now);
    }
  }

  /**
   * Update the recurrence pattern
   */
  update(data: Partial<{
    frequency: RecurrenceFrequency;
    interval: number;
    daysOfWeek: number[];
    dayOfMonth: number;
    endDate: Date | null;
  }>): RecurrencePatternData {
    const previousPattern = this.toData();

    if (data.frequency !== undefined) {
      this._frequency = data.frequency;
    }
    if (data.interval !== undefined) {
      this._interval = data.interval;
    }
    if (data.daysOfWeek !== undefined) {
      this._daysOfWeek = data.daysOfWeek;
    }
    if (data.dayOfMonth !== undefined) {
      this._dayOfMonth = data.dayOfMonth;
    }
    if (data.endDate !== undefined) {
      this._endDate = data.endDate ?? undefined;
    }

    this.validate();
    this._nextRunAt = this.calculateNextRun(new Date());
    this._updatedAt = new Date();

    return previousPattern;
  }

  /**
   * Check if the pattern is due for triggering
   */
  isDue(): boolean {
    if (this._status !== 'active') {
      return false;
    }
    return this._nextRunAt <= new Date();
  }

  /**
   * Convert to plain data object
   */
  toData(): RecurrencePatternData {
    return {
      id: this._id,
      taskId: this._taskId,
      userId: this._userId,
      frequency: this._frequency,
      interval: this._interval,
      daysOfWeek: this._daysOfWeek,
      dayOfMonth: this._dayOfMonth,
      startDate: this._startDate,
      endDate: this._endDate,
      nextRunAt: this._nextRunAt,
      status: this._status,
      lastTriggeredAt: this._lastTriggeredAt,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
