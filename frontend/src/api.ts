import { API, type Filters, type Video } from './catalog';
import { type MontageClip, type MontageSettings, type MontageSpec } from './montage';

export type VideoPage = { items: Video[]; total: number };
export type KeywordSummary = { keyword: string; count: number };

async function request<T>(path: string, error: string, init?: RequestInit): Promise<T> {
  const response = init ? await fetch(path, init) : await fetch(path);
  if (!response.ok) throw new Error(`${error} (${response.status})`);
  return response.json() as Promise<T>;
}

const items = async <T>(path: string, error: string, init?: RequestInit) =>
  (await request<{ items: T[] }>(path, error, init)).items;

const jsonRequest = (method: 'POST' | 'PUT', body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const fetchVideoPage = (filters: Filters, offset: number): Promise<VideoPage> => {
  const params = new URLSearchParams({ ...filters, limit: '48', offset: String(offset) });
  return request(`${API}/videos?${params}`, 'Could not load catalog');
};

export const reimportCatalog = () =>
  request<void>(`${API}/import`, 'Could not reimport catalog', { method: 'POST' });

export const fetchKeywordSummaries = () =>
  items<KeywordSummary>(`${API}/keywords`, 'Could not load keywords');

export const fetchSelectionIds = (filters: Filters) =>
  items<string>(
    `${API}/videos/selection?${new URLSearchParams(filters)}`,
    'Could not select videos',
  );

export const fetchMontageClips = (ids: string[]) =>
  items<MontageClip>(
    `${API}/videos/batch`,
    'Could not load montage clips',
    jsonRequest('POST', { ids }),
  );

export type RenderJob = {
  id: string;
  status: 'queued' | 'rendering' | 'completed' | 'failed';
  progress: number;
  stage: string;
  error_code?: string;
  error?: string;
};

export type MontageCapabilities = {
  accelerated: boolean;
  error_code?: string;
  reason?: string;
};

export type MontagePreset = {
  id: number;
  name: string;
  settings: MontageSettings;
};

export type MontageExport = {
  id: number;
  title: string;
  duration_seconds: number | null;
  generated_at: string;
};

export const fetchMontageExports = () =>
  items<MontageExport>(`${API}/montage-exports`, 'Could not load montage exports');

export const deleteMontageExport = (exportId: number) =>
  request<void>(`${API}/montage-exports/${exportId}`, 'Could not delete montage export', {
    method: 'DELETE',
  });

export const fetchMontagePresets = () =>
  items<MontagePreset>(`${API}/montage-presets`, 'Could not load montage presets');

export async function saveMontagePreset(
  name: string,
  settings: MontageSettings,
  presetId?: number,
): Promise<MontagePreset> {
  return request<MontagePreset>(
    `${API}/montage-presets${presetId === undefined ? '' : `/${presetId}`}`,
    'Could not save montage preset',
    jsonRequest(presetId === undefined ? 'POST' : 'PUT', { name, settings }),
  );
}

export const markMontagePresetUsed = (presetId: number) =>
  request<void>(`${API}/montage-presets/${presetId}/use`, 'Could not use montage preset', {
    method: 'POST',
  });

export const deleteMontagePreset = (presetId: number) =>
  request<void>(`${API}/montage-presets/${presetId}`, 'Could not delete montage preset', {
    method: 'DELETE',
  });

export const fetchMontageCapabilities = () =>
  request<MontageCapabilities>(
    `${API}/montages/capabilities`,
    'Could not verify hardware acceleration',
  );

export async function renderMontage(
  spec: MontageSpec,
  softwareFallback = false,
): Promise<RenderJob> {
  return request<RenderJob>(
    `${API}/montages`,
    'Could not start export',
    jsonRequest('POST', { spec, software_fallback: softwareFallback }),
  );
}

export const fetchRenderJob = (id: string) =>
  request<RenderJob>(`${API}/montages/${id}`, 'Could not check export');
