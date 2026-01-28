/**
 * Tag Domain Model
 * Owner: Task Service
 * Reference: data-model.md
 */

import { v4 as uuidv4 } from 'uuid';

export interface TagProps {
  id?: string;
  userId: string;
  name: string;
  usageCount?: number;
  createdAt?: Date;
}

export interface TagData {
  id: string;
  userId: string;
  name: string;
  usageCount: number;
  createdAt: Date;
}

/**
 * Normalize a tag name according to spec:
 * - Lowercase
 * - Alphanumeric + hyphens only
 * - Consecutive hyphens collapsed
 * - No leading/trailing hyphens
 */
export function normalizeTagName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/-+/g, '-')          // Collapse consecutive hyphens
    .replace(/^-|-$/g, '');       // Remove leading/trailing hyphens
}

export class Tag {
  readonly id: string;
  readonly userId: string;
  private _name: string;
  private _usageCount: number;
  readonly createdAt: Date;

  constructor(props: TagProps) {
    this.id = props.id ?? uuidv4();
    this.userId = props.userId;
    this._name = this.validateAndNormalizeName(props.name);
    this._usageCount = props.usageCount ?? 0;
    this.createdAt = props.createdAt ?? new Date();
  }

  // Getters
  get name(): string {
    return this._name;
  }

  get usageCount(): number {
    return this._usageCount;
  }

  // Validation
  private validateAndNormalizeName(name: string): string {
    const normalized = normalizeTagName(name);
    if (normalized.length === 0) {
      throw new Error('Tag name cannot be empty after normalization');
    }
    if (normalized.length > 50) {
      throw new Error('Tag name cannot exceed 50 characters');
    }
    return normalized;
  }

  // Mutations
  incrementUsage(): void {
    this._usageCount++;
  }

  decrementUsage(): void {
    if (this._usageCount > 0) {
      this._usageCount--;
    }
  }

  // Serialization
  toData(): TagData {
    return {
      id: this.id,
      userId: this.userId,
      name: this._name,
      usageCount: this._usageCount,
      createdAt: this.createdAt,
    };
  }

  // Factory
  static fromData(data: TagData): Tag {
    return new Tag({
      id: data.id,
      userId: data.userId,
      name: data.name, // Already normalized in DB
      usageCount: data.usageCount,
      createdAt: data.createdAt,
    });
  }
}

/**
 * Normalize multiple tag names and remove duplicates
 */
export function normalizeTagNames(names: string[]): string[] {
  const normalizedSet = new Set<string>();
  for (const name of names) {
    const normalized = normalizeTagName(name);
    if (normalized.length > 0) {
      normalizedSet.add(normalized);
    }
  }
  return Array.from(normalizedSet);
}
