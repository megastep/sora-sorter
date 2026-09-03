import { describe, expect, it } from 'vitest';
import { normalizePills } from './PillInput';

describe('normalizePills', () => {
  it('turns comma-separated entries into distinct, trimmed pills for keywords and flags', () => {
    expect(normalizePills(['woman, explorer', ' canyon ', 'EXPLORER'])).toEqual([
      'woman',
      'explorer',
      'canyon',
    ]);
    expect(normalizePills(['violence, flashing lights', 'Violence'])).toEqual([
      'violence',
      'flashing lights',
    ]);
  });
});
