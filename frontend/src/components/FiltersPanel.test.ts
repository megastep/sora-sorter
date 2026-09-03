import { describe, expect, it } from 'vitest';
import { keywordCloudFontSize } from './FiltersPanel';

describe('keywordCloudFontSize', () => {
  it('makes popular keywords larger while keeping every keyword readable', () => {
    expect(keywordCloudFontSize(1, 100)).toBe(10);
    expect(keywordCloudFontSize(10, 100)).toBeGreaterThan(10);
    expect(keywordCloudFontSize(100, 100)).toBe(24);
  });
});
