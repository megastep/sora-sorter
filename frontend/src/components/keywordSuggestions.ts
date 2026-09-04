import type { KeywordSummary } from '../api';

export const filterKeywordSuggestions = (keywords: KeywordSummary[], query: string) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];

  return keywords
    .filter(({ keyword }) => keyword.toLocaleLowerCase().includes(normalizedQuery))
    .sort((left, right) => right.count - left.count || left.keyword.localeCompare(right.keyword))
    .slice(0, 10);
};
