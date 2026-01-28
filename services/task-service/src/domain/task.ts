/**
 * Task Domain Model
 * Owner: Task Service
 * Reference: data-model.md
 */

import { v4 as uuidv4 } from 'uuid';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface TaskProps {
  id?: string;
  userId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  completedAt?: Date;
  isRecurring?: boolean;
  parentTaskId?: string;
}

export interface TaskData {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  isRecurring: boolean;
  parentTaskId: string | null;
}

export class Task {
  readonly id: string;
  readonly userId: string;
  private _title: string;
  private _description: string | null;
  private _priority: TaskPriority;
  private _status: TaskStatus;
  private _dueDate: Date | null;
  readonly createdAt: Date;
  private _updatedAt: Date;
  private _completedAt: Date | null;
  private _isRecurring: boolean;
  private _parentTaskId: string | null;

  constructor(props: TaskProps) {
    this.id = props.id ?? uuidv4();
    this.userId = props.userId;
    this._title = this.validateTitle(props.title);
    this._description = props.description ?? null;
    this._priority = props.priority ?? 'medium';
    this._status = props.status ?? 'pending';
    this._dueDate = props.dueDate ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
    this._completedAt = props.completedAt ?? null;
    this._isRecurring = props.isRecurring ?? false;
    this._parentTaskId = props.parentTaskId ?? null;
  }

  // Getters
  get title(): string {
    return this._title;
  }

  get description(): string | null {
    return this._description;
  }

  get priority(): TaskPriority {
    return this._priority;
  }

  get status(): TaskStatus {
    return this._status;
  }

  get dueDate(): Date | null {
    return this._dueDate;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get completedAt(): Date | null {
    return this._completedAt;
  }

  get isRecurring(): boolean {
    return this._isRecurring;
  }

  get parentTaskId(): string | null {
    return this._parentTaskId;
  }

  get isOverdue(): boolean {
    if (!this._dueDate) return false;
    if (this._status === 'completed' || this._status === 'cancelled') return false;
    return this._dueDate < new Date();
  }

  // Validation
  private validateTitle(title: string): string {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      throw new Error('Task title cannot be empty');
    }
    if (trimmed.length > 500) {
      throw new Error('Task title cannot exceed 500 characters');
    }
    return trimmed;
  }

  // Mutations
  updateTitle(title: string): void {
    this._title = this.validateTitle(title);
    this._updatedAt = new Date();
  }

  updateDescription(description: string | null): void {
    if (description && description.length > 5000) {
      throw new Error('Task description cannot exceed 5000 characters');
    }
    this._description = description;
    this._updatedAt = new Date();
  }

  updatePriority(priority: TaskPriority): TaskPriority {
    const previousPriority = this._priority;
    this._priority = priority;
    this._updatedAt = new Date();
    return previousPriority;
  }

  updateDueDate(dueDate: Date | null): Date | null {
    const previousDueDate = this._dueDate;
    this._dueDate = dueDate;
    this._updatedAt = new Date();
    return previousDueDate;
  }

  setRecurring(isRecurring: boolean): void {
    this._isRecurring = isRecurring;
    this._updatedAt = new Date();
  }

  // Status transitions
  start(): void {
    if (this._status !== 'pending') {
      throw new Error(`Cannot start task in ${this._status} status`);
    }
    this._status = 'in_progress';
    this._updatedAt = new Date();
  }

  complete(): void {
    if (this._status === 'completed') {
      throw new Error('Task is already completed');
    }
    if (this._status === 'cancelled') {
      throw new Error('Cannot complete a cancelled task');
    }
    this._status = 'completed';
    this._completedAt = new Date();
    this._updatedAt = new Date();
  }

  cancel(): void {
    if (this._status === 'completed') {
      throw new Error('Cannot cancel a completed task');
    }
    if (this._status === 'cancelled') {
      throw new Error('Task is already cancelled');
    }
    this._status = 'cancelled';
    this._updatedAt = new Date();
  }

  reopen(): void {
    if (this._status !== 'completed' && this._status !== 'cancelled') {
      throw new Error('Can only reopen completed or cancelled tasks');
    }
    this._status = 'pending';
    this._completedAt = null;
    this._updatedAt = new Date();
  }

  // Serialization
  toData(): TaskData {
    return {
      id: this.id,
      userId: this.userId,
      title: this._title,
      description: this._description,
      priority: this._priority,
      status: this._status,
      dueDate: this._dueDate,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
      completedAt: this._completedAt,
      isRecurring: this._isRecurring,
      parentTaskId: this._parentTaskId,
    };
  }

  // Factory
  static fromData(data: TaskData): Task {
    return new Task({
      id: data.id,
      userId: data.userId,
      title: data.title,
      description: data.description ?? undefined,
      priority: data.priority,
      status: data.status,
      dueDate: data.dueDate ?? undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      completedAt: data.completedAt ?? undefined,
      isRecurring: data.isRecurring,
      parentTaskId: data.parentTaskId ?? undefined,
    });
  }

  // Create a new instance for recurring task
  createRecurringInstance(newDueDate: Date): Task {
    return new Task({
      userId: this.userId,
      title: this._title,
      description: this._description ?? undefined,
      priority: this._priority,
      dueDate: newDueDate,
      isRecurring: true,
      parentTaskId: this.id,
    });
  }
}
