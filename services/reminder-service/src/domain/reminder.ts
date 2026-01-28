/**
 * Reminder Domain Model
 * Owner: Reminder Service
 * Reference: data-model.md
 */

import { v4 as uuidv4 } from 'uuid';

export type ReminderStatus = 'pending' | 'triggered' | 'cancelled';

export interface ReminderProps {
  id?: string;
  taskId: string;
  userId: string;
  reminderTime: Date;
  status?: ReminderStatus;
  triggeredAt?: Date;
  createdAt?: Date;
}

export interface ReminderData {
  id: string;
  taskId: string;
  userId: string;
  reminderTime: Date;
  status: ReminderStatus;
  triggeredAt: Date | null;
  createdAt: Date;
}

export class Reminder {
  readonly id: string;
  readonly taskId: string;
  readonly userId: string;
  private _reminderTime: Date;
  private _status: ReminderStatus;
  private _triggeredAt: Date | null;
  readonly createdAt: Date;

  constructor(props: ReminderProps) {
    this.id = props.id ?? uuidv4();
    this.taskId = props.taskId;
    this.userId = props.userId;
    this._reminderTime = props.reminderTime;
    this._status = props.status ?? 'pending';
    this._triggeredAt = props.triggeredAt ?? null;
    this.createdAt = props.createdAt ?? new Date();
  }

  // Getters
  get reminderTime(): Date {
    return this._reminderTime;
  }

  get status(): ReminderStatus {
    return this._status;
  }

  get triggeredAt(): Date | null {
    return this._triggeredAt;
  }

  get isPending(): boolean {
    return this._status === 'pending';
  }

  get isDue(): boolean {
    return this._status === 'pending' && this._reminderTime <= new Date();
  }

  // Mutations
  updateReminderTime(time: Date): void {
    if (this._status !== 'pending') {
      throw new Error('Cannot update reminder time for non-pending reminder');
    }
    this._reminderTime = time;
  }

  trigger(): void {
    if (this._status !== 'pending') {
      throw new Error(`Cannot trigger reminder in ${this._status} status`);
    }
    this._status = 'triggered';
    this._triggeredAt = new Date();
  }

  cancel(): void {
    if (this._status !== 'pending') {
      throw new Error(`Cannot cancel reminder in ${this._status} status`);
    }
    this._status = 'cancelled';
  }

  // Serialization
  toData(): ReminderData {
    return {
      id: this.id,
      taskId: this.taskId,
      userId: this.userId,
      reminderTime: this._reminderTime,
      status: this._status,
      triggeredAt: this._triggeredAt,
      createdAt: this.createdAt,
    };
  }

  // Factory
  static fromData(data: ReminderData): Reminder {
    return new Reminder({
      id: data.id,
      taskId: data.taskId,
      userId: data.userId,
      reminderTime: data.reminderTime,
      status: data.status,
      triggeredAt: data.triggeredAt ?? undefined,
      createdAt: data.createdAt,
    });
  }
}

/**
 * Parse relative time string to absolute Date
 * Supports: "1 hour before", "2 days before", "30 minutes before"
 */
export function parseRelativeTime(relativeTime: string, referenceDate: Date): Date {
  const match = /^(\d+)\s+(minute|hour|day|week)s?\s+before$/i.exec(relativeTime);
  if (!match) {
    throw new Error(`Invalid relative time format: ${relativeTime}. Use format like "1 hour before" or "2 days before"`);
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const result = new Date(referenceDate);

  switch (unit) {
    case 'minute':
      result.setMinutes(result.getMinutes() - amount);
      break;
    case 'hour':
      result.setHours(result.getHours() - amount);
      break;
    case 'day':
      result.setDate(result.getDate() - amount);
      break;
    case 'week':
      result.setDate(result.getDate() - amount * 7);
      break;
  }

  return result;
}
