import { describe, expect, it } from 'vitest';
import { normalizeKeywords } from './Inspector';

describe('normalizeKeywords', () => {
  it('turns comma-separated input into distinct, trimmed keyword pills', () => {
    expect(normalizeKeywords(['woman, explorer', ' canyon ', 'EXPLORER'])).toEqual([
      'woman',
      'explorer',
      'canyon',
    ]);
  });
});
