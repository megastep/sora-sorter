import type { Filters } from '../catalog';

const FILTER_CHOICES: Record<string, string[]> = {
  language: ['en', 'fr', 'es', 'pt', 'ru', 'ja', 'ko', 'zh', 'none'],
  orientation: ['portrait', 'landscape'],
  speech: ['yes', 'no'],
  review: ['unreviewed', 'shortlisted', 'approved', 'rejected'],
  favorite: ['yes', 'no'],
  publishable: ['yes', 'no'],
};

export function FiltersPanel({
  filters,
  setFilters,
}: {
  filters: Filters;
  setFilters: (value: Filters) => void;
}) {
  const set = (key: string, value: string) => setFilters({ ...filters, [key]: value });
  return (
    <aside>
      <div className="side-title">
        Filters <button onClick={() => setFilters({})}>Reset</button>
      </div>
      <input
        aria-label="Search titles, summaries, keywords, visible text, and transcripts"
        value={filters.q ?? ''}
        onChange={(event) => set('q', event.target.value)}
        placeholder="Search titles, summaries, keywords…"
      />
      {Object.entries(FILTER_CHOICES).map(([key, values]) => (
        <label className="filter" key={key}>
          {key}
          <select value={filters[key] ?? ''} onChange={(event) => set(key, event.target.value)}>
            <option value="">All</option>
            {values.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      ))}
      <label className="filter">
        Content flag
        <input
          value={filters.flag ?? ''}
          onChange={(event) => set('flag', event.target.value)}
          placeholder="e.g. profanity"
        />
      </label>
    </aside>
  );
}
