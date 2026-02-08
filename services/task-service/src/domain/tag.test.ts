import { describe, it, expect, vi } from 'vitest';
import { Tag, normalizeTagName, normalizeTagNames } from './tag';

vi.mock('uuid', () => ({
  v4: () => 'test-tag-uuid',
}));

describe('normalizeTagName', () => {
  it('should lowercase', () => {
    expect(normalizeTagName('Shopping')).toBe('shopping');
  });

  it('should replace spaces with hyphens', () => {
    expect(normalizeTagName('work stuff')).toBe('work-stuff');
  });

  it('should remove special characters', () => {
    expect(normalizeTagName('hello@world!')).toBe('hello-world');
  });

  it('should collapse consecutive hyphens', () => {
    expect(normalizeTagName('a---b')).toBe('a-b');
  });

  it('should remove leading and trailing hyphens', () => {
    expect(normalizeTagName('-hello-')).toBe('hello');
  });

  it('should handle complex input', () => {
    expect(normalizeTagName('  Hello World!! @#$ test  ')).toBe('hello-world-test');
  });

  it('should return empty for all special chars', () => {
    expect(normalizeTagName('!@#$%')).toBe('');
  });
});

describe('normalizeTagNames', () => {
  it('should normalize and deduplicate', () => {
    const result = normalizeTagNames(['Shopping', 'shopping', 'SHOPPING']);
    expect(result).toEqual(['shopping']);
  });

  it('should filter empty results', () => {
    const result = normalizeTagNames(['valid', '!!!', 'also-valid']);
    expect(result).toEqual(['valid', 'also-valid']);
  });

  it('should handle empty array', () => {
    expect(normalizeTagNames([])).toEqual([]);
  });
});

describe('Tag', () => {
  const validProps = {
    userId: 'user-1',
    name: 'Shopping',
  };

  it('should create tag with defaults', () => {
    const tag = new Tag(validProps);
    expect(tag.id).toBe('test-tag-uuid');
    expect(tag.userId).toBe('user-1');
    expect(tag.name).toBe('shopping');
    expect(tag.usageCount).toBe(0);
  });

  it('should normalize tag name on creation', () => {
    const tag = new Tag({ ...validProps, name: 'Work Stuff!!' });
    expect(tag.name).toBe('work-stuff');
  });

  it('should throw on empty name after normalization', () => {
    expect(() => new Tag({ ...validProps, name: '!!!' })).toThrow('Tag name cannot be empty after normalization');
  });

  it('should throw on name exceeding 50 chars', () => {
    const longName = 'a'.repeat(51);
    expect(() => new Tag({ ...validProps, name: longName })).toThrow('Tag name cannot exceed 50 characters');
  });

  describe('incrementUsage', () => {
    it('should increment usage count', () => {
      const tag = new Tag(validProps);
      tag.incrementUsage();
      expect(tag.usageCount).toBe(1);
      tag.incrementUsage();
      expect(tag.usageCount).toBe(2);
    });
  });

  describe('decrementUsage', () => {
    it('should decrement usage count', () => {
      const tag = new Tag({ ...validProps, usageCount: 3 });
      tag.decrementUsage();
      expect(tag.usageCount).toBe(2);
    });

    it('should not go below zero', () => {
      const tag = new Tag(validProps);
      tag.decrementUsage();
      expect(tag.usageCount).toBe(0);
    });
  });

  describe('toData / fromData', () => {
    it('should round-trip correctly', () => {
      const tag = new Tag({ ...validProps, usageCount: 5 });
      const data = tag.toData();
      const restored = Tag.fromData(data);
      expect(restored.id).toBe(tag.id);
      expect(restored.name).toBe('shopping');
      expect(restored.usageCount).toBe(5);
    });
  });
});
