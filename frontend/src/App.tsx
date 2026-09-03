import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { fetchVideoPage, reimportCatalog, type VideoPage } from './api';
import { type Filters, type Video } from './catalog';
import { Card } from './components/Card';
import { FiltersPanel } from './components/FiltersPanel';
import { Inspector } from './components/Inspector';
import { Lightbox } from './components/Lightbox';

export function App() {
  const [filters, setFilters] = useState<Filters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const videos = useInfiniteQuery({
    queryKey: ['videos', filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchVideoPage(filters, pageParam),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
  const items = videos.data?.pages.flatMap((page) => page.items) ?? [];
  const total = videos.data?.pages[0]?.total ?? 0;
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const lightboxItem = lightboxId ? items.find((item) => item.id === lightboxId) : null;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !videos.hasNextPage || videos.isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void videos.fetchNextPage();
      },
      { rootMargin: '500px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [videos.fetchNextPage, videos.hasNextPage, videos.isFetchingNextPage]);

  const openLightbox = (item: Video) => {
    setSelectedId(item.id);
    setLightboxId(item.id);
  };
  const saveVideo = (updated: Video) => {
    queryClient.setQueriesData<InfiniteData<VideoPage>>({ queryKey: ['videos'] }, (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => (item.id === updated.id ? updated : item)),
            })),
          }
        : current,
    );
  };
  const reimport = async () => {
    if (importing) return;
    setImporting(true);
    try {
      await reimportCatalog();
      await queryClient.invalidateQueries({ queryKey: ['videos'] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <header>
        <h1>Video Catalog</h1>
        <span>{total} videos</span>
        <select
          aria-label="Sort videos"
          value={filters.sort ?? 'newest'}
          onChange={(event) => setFilters({ ...filters, sort: event.target.value })}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A–Z</option>
          <option value="title_desc">Title Z–A</option>
          <option value="duration">Longest first</option>
          <option value="language">Language A–Z</option>
        </select>
        <button onClick={reimport} disabled={importing}>
          {importing ? 'Importing…' : 'Import / Reimport'}
        </button>
      </header>
      <main>
        <FiltersPanel filters={filters} setFilters={setFilters} />
        <section className="gallery">
          <div className="gallery-head">
            <b>{total} videos</b>
            <span>Gallery</span>
          </div>
          {videos.isError && <p role="alert">{videos.error.message}</p>}
          <div className="grid">
            {items.map((item) => (
              <Card
                key={item.id}
                item={item}
                selected={item.id === selected?.id}
                onOpen={() => openLightbox(item)}
              />
            ))}
          </div>
          <div className="gallery-load" ref={sentinel}>
            {videos.isLoading
              ? 'Loading videos…'
              : videos.isFetchingNextPage
                ? 'Loading more…'
                : videos.hasNextPage
                  ? 'Scroll to load more'
                  : 'All videos loaded'}
          </div>
        </section>
        {selected ? (
          <Inspector key={selected.id} item={selected} onSaved={saveVideo} />
        ) : (
          <section className="inspector empty">Select a clip to inspect it.</section>
        )}
      </main>
      {lightboxItem && (
        <Lightbox
          items={items}
          item={lightboxItem}
          onClose={() => setLightboxId(null)}
          onSelect={openLightbox}
        />
      )}
    </>
  );
}
