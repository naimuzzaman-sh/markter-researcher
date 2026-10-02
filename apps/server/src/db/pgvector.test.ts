import { describe, it, expect } from 'vitest';
import { formatVectorForInsert, parseVectorFromRow } from './pgvector';

describe('formatVectorForInsert', () => {
  it('serializes a number[] to pgvector literal', () => {
    expect(formatVectorForInsert([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
  });

  it('returns null for null input', () => {
    expect(formatVectorForInsert(null)).toBeNull();
  });

  it('handles empty array', () => {
    expect(formatVectorForInsert([])).toBe('[]');
  });
});

describe('parseVectorFromRow', () => {
  it('parses pgvector literal to number[]', () => {
    expect(parseVectorFromRow('[0.1, 0.2, 0.3]')).toEqual([0.1, 0.2, 0.3]);
  });

  it('returns null for null/undefined', () => {
    expect(parseVectorFromRow(null)).toBeNull();
    expect(parseVectorFromRow(undefined)).toBeNull();
  });

  it('passes through already-parsed arrays', () => {
    expect(parseVectorFromRow([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('returns empty array for empty literal', () => {
    expect(parseVectorFromRow('[]')).toEqual([]);
  });

  it('returns null for malformed input', () => {
    expect(parseVectorFromRow('not-a-vector')).toBeNull();
  });
});
