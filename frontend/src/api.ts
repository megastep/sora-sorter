import { API, type Filters, type Video } from './catalog';

export type VideoPage = { items: Video[]; total: number };

export async function fetchVideoPage(filters: Filters, offset: number): Promise<VideoPage> {
  const params = new URLSearchParams({ ...filters, limit: '48', offset: String(offset) });
  const response = await fetch(`${API}/videos?${params}`);
  if (!response.ok) throw new Error(`Could not load catalog (${response.status})`);
  return response.json() as Promise<VideoPage>;
}

export async function reimportCatalog(): Promise<void> {
  const response = await fetch(`${API}/import`, { method: 'POST' });
  if (!response.ok) throw new Error(`Could not reimport catalog (${response.status})`);
}
