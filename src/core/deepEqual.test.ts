import { describe, expect, it } from 'vitest';
import { deepEqual } from './deepEqual';

describe('deepEqual', () => {
  it('ignoriert die Schlüsselreihenfolge', () => {
    expect(deepEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
  });

  it('erkennt Unterschiede', () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([1], { 0: 1 })).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
  });
});
