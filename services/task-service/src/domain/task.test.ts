import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Task, TaskPriority, TaskStatus } from './task';

// Mock uuid with incrementing IDs
let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

describe('Task', () => {
  const validProps = {
    userId: 'user-1',
    title: 'Buy groceries',
  };

  beforeEach(() => {
    uuidCounter = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create task with defaults', () => {
      const task = new Task(validProps);
      expect(task.id).toMatch(/^test-uuid-/);
      expect(task.userId).toBe('user-1');
      expect(task.title).toBe('Buy groceries');
      expect(task.description).toBeNull();
      expect(task.priority).toBe('medium');
      expect(task.status).toBe('pending');
      expect(task.dueDate).toBeNull();
      expect(task.isRecurring).toBe(false);
      expect(task.parentTaskId).toBeNull();
      expect(task.completedAt).toBeNull();
    });

    it('should create task with all props', () => {
      const dueDate = new Date('2026-02-01');
      const task = new Task({
        id: 'custom-id',
        userId: 'user-1',
        title: 'Custom task',
        description: 'A description',
        priority: 'high',
        status: 'in_progress',
        dueDate,
        isRecurring: true,
        parentTaskId: 'parent-1',
      });
      expect(task.id).toBe('custom-id');
      expect(task.description).toBe('A description');
      expect(task.priority).toBe('high');
      expect(task.status).toBe('in_progress');
      expect(task.dueDate).toBe(dueDate);
      expect(task.isRecurring).toBe(true);
      expect(task.parentTaskId).toBe('parent-1');
    });

    it('should trim title whitespace', () => {
      const task = new Task({ ...validProps, title: '  Hello World  ' });
      expect(task.title).toBe('Hello World');
    });

    it('should throw on empty title', () => {
      expect(() => new Task({ ...validProps, title: '' })).toThrow('Task title cannot be empty');
    });

    it('should throw on whitespace-only title', () => {
      expect(() => new Task({ ...validProps, title: '   ' })).toThrow('Task title cannot be empty');
    });

    it('should throw on title exceeding 500 chars', () => {
      const longTitle = 'a'.repeat(501);
      expect(() => new Task({ ...validProps, title: longTitle })).toThrow('Task title cannot exceed 500 characters');
    });

    it('should allow title of exactly 500 chars', () => {
      const title = 'a'.repeat(500);
      const task = new Task({ ...validProps, title });
      expect(task.title).toBe(title);
    });
  });

  describe('updateTitle', () => {
    it('should update title', () => {
      const task = new Task(validProps);
      task.updateTitle('New title');
      expect(task.title).toBe('New title');
    });

    it('should throw on empty title', () => {
      const task = new Task(validProps);
      expect(() => task.updateTitle('')).toThrow('Task title cannot be empty');
    });
  });

  describe('updateDescription', () => {
    it('should update description', () => {
      const task = new Task(validProps);
      task.updateDescription('New description');
      expect(task.description).toBe('New description');
    });

    it('should allow null description', () => {
      const task = new Task({ ...validProps, description: 'old' });
      task.updateDescription(null);
      expect(task.description).toBeNull();
    });

    it('should throw on description exceeding 5000 chars', () => {
      const task = new Task(validProps);
      const longDesc = 'a'.repeat(5001);
      expect(() => task.updateDescription(longDesc)).toThrow('Task description cannot exceed 5000 characters');
    });
  });

  describe('updatePriority', () => {
    it('should update priority and return previous', () => {
      const task = new Task(validProps);
      const prev = task.updatePriority('urgent');
      expect(prev).toBe('medium');
      expect(task.priority).toBe('urgent');
    });
  });

  describe('updateDueDate', () => {
    it('should update due date and return previous', () => {
      const task = new Task(validProps);
      const newDate = new Date('2026-03-01');
      const prev = task.updateDueDate(newDate);
      expect(prev).toBeNull();
      expect(task.dueDate).toBe(newDate);
    });
  });

  describe('isOverdue', () => {
    it('should return false when no due date', () => {
      const task = new Task(validProps);
      expect(task.isOverdue).toBe(false);
    });

    it('should return true when due date is past', () => {
      const task = new Task({ ...validProps, dueDate: new Date('2025-01-01') });
      expect(task.isOverdue).toBe(true);
    });

    it('should return false when due date is future', () => {
      const task = new Task({ ...validProps, dueDate: new Date('2027-01-01') });
      expect(task.isOverdue).toBe(false);
    });

    it('should return false when completed', () => {
      const task = new Task({ ...validProps, dueDate: new Date('2025-01-01'), status: 'completed' });
      expect(task.isOverdue).toBe(false);
    });

    it('should return false when cancelled', () => {
      const task = new Task({ ...validProps, dueDate: new Date('2025-01-01'), status: 'cancelled' });
      expect(task.isOverdue).toBe(false);
    });
  });

  describe('status transitions', () => {
    it('should start from pending', () => {
      const task = new Task(validProps);
      task.start();
      expect(task.status).toBe('in_progress');
    });

    it('should not start from in_progress', () => {
      const task = new Task({ ...validProps, status: 'in_progress' });
      expect(() => task.start()).toThrow('Cannot start task in in_progress status');
    });

    it('should complete from pending', () => {
      const task = new Task(validProps);
      task.complete();
      expect(task.status).toBe('completed');
      expect(task.completedAt).toEqual(new Date('2026-01-15T12:00:00Z'));
    });

    it('should complete from in_progress', () => {
      const task = new Task({ ...validProps, status: 'in_progress' });
      task.complete();
      expect(task.status).toBe('completed');
    });

    it('should not complete already completed', () => {
      const task = new Task({ ...validProps, status: 'completed' });
      expect(() => task.complete()).toThrow('Task is already completed');
    });

    it('should not complete cancelled task', () => {
      const task = new Task({ ...validProps, status: 'cancelled' });
      expect(() => task.complete()).toThrow('Cannot complete a cancelled task');
    });

    it('should cancel from pending', () => {
      const task = new Task(validProps);
      task.cancel();
      expect(task.status).toBe('cancelled');
    });

    it('should cancel from in_progress', () => {
      const task = new Task({ ...validProps, status: 'in_progress' });
      task.cancel();
      expect(task.status).toBe('cancelled');
    });

    it('should not cancel completed task', () => {
      const task = new Task({ ...validProps, status: 'completed' });
      expect(() => task.cancel()).toThrow('Cannot cancel a completed task');
    });

    it('should not cancel already cancelled', () => {
      const task = new Task({ ...validProps, status: 'cancelled' });
      expect(() => task.cancel()).toThrow('Task is already cancelled');
    });

    it('should reopen completed task', () => {
      const task = new Task({ ...validProps, status: 'completed', completedAt: new Date() });
      task.reopen();
      expect(task.status).toBe('pending');
      expect(task.completedAt).toBeNull();
    });

    it('should reopen cancelled task', () => {
      const task = new Task({ ...validProps, status: 'cancelled' });
      task.reopen();
      expect(task.status).toBe('pending');
    });

    it('should not reopen pending task', () => {
      const task = new Task(validProps);
      expect(() => task.reopen()).toThrow('Can only reopen completed or cancelled tasks');
    });
  });

  describe('setRecurring', () => {
    it('should set recurring flag', () => {
      const task = new Task(validProps);
      task.setRecurring(true);
      expect(task.isRecurring).toBe(true);
    });
  });

  describe('toData / fromData', () => {
    it('should round-trip correctly', () => {
      const task = new Task({
        ...validProps,
        description: 'Test desc',
        priority: 'high',
        dueDate: new Date('2026-02-01'),
      });
      const data = task.toData();
      const restored = Task.fromData(data);
      expect(restored.id).toBe(task.id);
      expect(restored.title).toBe(task.title);
      expect(restored.priority).toBe('high');
      expect(restored.description).toBe('Test desc');
    });
  });

  describe('createRecurringInstance', () => {
    it('should create new task with parent reference', () => {
      const task = new Task({ ...validProps, priority: 'high' });
      const newDueDate = new Date('2026-03-01');
      const instance = task.createRecurringInstance(newDueDate);
      expect(instance.parentTaskId).toBe(task.id);
      expect(instance.isRecurring).toBe(true);
      expect(instance.dueDate).toBe(newDueDate);
      expect(instance.priority).toBe('high');
      expect(instance.title).toBe('Buy groceries');
      expect(instance.status).toBe('pending');
      expect(instance.id).not.toBe(task.id);
    });
  });
});
