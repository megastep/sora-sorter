import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchVideoPage, reimportCatalog } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('catalog API', () => {
  it('sends filters and pagination when loading a page', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0 })));
    vi.stubGlobal('fetch', fetch);

    await expect(fetchVideoPage({ language: 'en', sort: 'title' }, 48)).resolves.toEqual({
      items: [],
      total: 0,
    });
    expect(fetch).toHaveBeenCalledWith('/api/videos?language=en&sort=title&limit=48&offset=48');
  });

  it('rejects a failed reimport response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    await expect(reimportCatalog()).rejects.toThrow('Could not reimport catalog (500)');
  });
});
