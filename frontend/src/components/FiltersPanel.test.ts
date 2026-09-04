import { describe, expect, it } from 'vitest';
import { filterKeywordSuggestions, keywordCloudFontSize } from './FiltersPanel';

describe('keywordCloudFontSize', () => {
  it('makes popular keywords larger while keeping every keyword readable', () => {
    expect(keywordCloudFontSize(1, 100)).toBe(10);
    expect(keywordCloudFontSize(10, 100)).toBeGreaterThan(10);
    expect(keywordCloudFontSize(100, 100)).toBe(24);
  });
});

describe('filterKeywordSuggestions', () => {
  it('returns a limited, case-insensitive set of matching catalog keywords', () => {
    const keywords = [
      { keyword: 'Garden', count: 4 },
      { keyword: 'night garden', count: 2 },
      { keyword: 'Forest', count: 1 },
      ...Array.from({ length: 10 }, (_, index) => ({ keyword: `garden ${index}`, count: 1 })),
    ];

    expect(filterKeywordSuggestions(keywords, 'GARDEN')).toEqual([
      { keyword: 'Garden', count: 4 },
      { keyword: 'night garden', count: 2 },
      ...Array.from({ length: 8 }, (_, index) => ({ keyword: `garden ${index}`, count: 1 })),
    ]);
    expect(filterKeywordSuggestions(keywords, '')).toEqual([]);
  });
});
