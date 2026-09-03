import { API, type Filters, type Video } from './catalog';
import { type MontageClip, type MontageSettings, type MontageSpec } from './montage';

export type VideoPage = { items: Video[]; total: number };
export type KeywordSummary = { keyword: string; count: number };

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

export async function fetchKeywordSummaries(): Promise<KeywordSummary[]> {
  const response = await fetch(`${API}/keywords`);
  if (!response.ok) throw new Error(`Could not load keywords (${response.status})`);
  const payload = (await response.json()) as { items: KeywordSummary[] };
  return payload.items;
}

export async function fetchSelectionIds(filters: Filters): Promise<string[]> {
  const response = await fetch(`${API}/videos/selection?${new URLSearchParams(filters)}`);
  if (!response.ok) throw new Error(`Could not select videos (${response.status})`);
  return ((await response.json()) as { items: string[] }).items;
}

export async function fetchMontageClips(ids: string[]): Promise<MontageClip[]> {
  const response = await fetch(`${API}/videos/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw new Error(`Could not load montage clips (${response.status})`);
  return ((await response.json()) as { items: MontageClip[] }).items;
}

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
  last_used_at: string;
};

export type MontageExport = {
  id: number;
  title: string;
  filename: string;
  duration_seconds: number | null;
  generated_at: string;
};

export async function fetchMontageExports(): Promise<MontageExport[]> {
  const response = await fetch(`${API}/montage-exports`);
  if (!response.ok) throw new Error(`Could not load montage exports (${response.status})`);
  return ((await response.json()) as { items: MontageExport[] }).items;
}

export async function deleteMontageExport(exportId: number): Promise<void> {
  const response = await fetch(`${API}/montage-exports/${exportId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Could not delete montage export (${response.status})`);
}

export async function fetchMontagePresets(): Promise<MontagePreset[]> {
  const response = await fetch(`${API}/montage-presets`);
  if (!response.ok) throw new Error(`Could not load montage presets (${response.status})`);
  return ((await response.json()) as { items: MontagePreset[] }).items;
}

export async function saveMontagePreset(
  name: string,
  settings: MontageSettings,
  presetId?: number,
): Promise<MontagePreset> {
  const response = await fetch(
    `${API}/montage-presets${presetId === undefined ? '' : `/${presetId}`}`,
    {
      method: presetId === undefined ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, settings }),
    },
  );
  if (!response.ok) throw new Error(`Could not save montage preset (${response.status})`);
  return response.json() as Promise<MontagePreset>;
}

export async function markMontagePresetUsed(presetId: number): Promise<void> {
  const response = await fetch(`${API}/montage-presets/${presetId}/use`, { method: 'POST' });
  if (!response.ok) throw new Error(`Could not use montage preset (${response.status})`);
}

export async function deleteMontagePreset(presetId: number): Promise<void> {
  const response = await fetch(`${API}/montage-presets/${presetId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Could not delete montage preset (${response.status})`);
}

export async function fetchMontageCapabilities(): Promise<MontageCapabilities> {
  const response = await fetch(`${API}/montages/capabilities`);
  if (!response.ok) throw new Error(`Could not verify hardware acceleration (${response.status})`);
  return response.json() as Promise<MontageCapabilities>;
}

export async function renderMontage(
  spec: MontageSpec,
  softwareFallback = false,
): Promise<RenderJob> {
  const response = await fetch(`${API}/montages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spec, software_fallback: softwareFallback }),
  });
  if (!response.ok) throw new Error(`Could not start export (${response.status})`);
  return response.json() as Promise<RenderJob>;
}

export async function fetchRenderJob(id: string): Promise<RenderJob> {
  const response = await fetch(`${API}/montages/${id}`);
  if (!response.ok) throw new Error(`Could not check export (${response.status})`);
  return response.json() as Promise<RenderJob>;
}
