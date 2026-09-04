import { describe, expect, it } from 'vitest';
import { normalizePills } from './PillInput';
import { filterKeywordSuggestions } from './keywordSuggestions';

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

describe('filterKeywordSuggestions', () => {
  it('ranks matching inspector keywords by catalog usage', () => {
    expect(
      filterKeywordSuggestions(
        [
          { keyword: 'craft', count: 1 },
          { keyword: 'crafting', count: 2 },
          { keyword: 'craft-beer', count: 1 },
          { keyword: 'craftsmanship', count: 2 },
        ],
        'cr',
      ),
    ).toEqual([
      { keyword: 'crafting', count: 2 },
      { keyword: 'craftsmanship', count: 2 },
      { keyword: 'craft', count: 1 },
      { keyword: 'craft-beer', count: 1 },
    ]);
  });
});
