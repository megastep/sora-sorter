import { FileUploadRounded } from '@mui/icons-material';
import { Box, Button, Drawer, Paper, Stack, Typography, useMediaQuery } from '@mui/material';
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';
import {
  fetchKeywordSummaries,
  fetchSelectionIds,
  fetchVideoPage,
  reimportCatalog,
  type VideoPage,
} from '../api';
import { type Filters, type Video } from '../catalog';
import { addToSelection, toggleSelection } from '../montage';
import { Card } from './Card';
import { CatalogToolbar, type ColorMode } from './CatalogToolbar';
import { FiltersPanel } from './FiltersPanel';
import { Inspector } from './Inspector';
import { Lightbox } from './Lightbox';

export function CatalogPage({
  montageSelection,
  setMontageSelection,
  colorMode,
  onToggleColorMode,
  onMontage,
  onExports,
}: {
  montageSelection: string[];
  setMontageSelection: Dispatch<SetStateAction<string[]>>;
  colorMode: ColorMode;
  onToggleColorMode: () => void;
  onMontage: () => void;
  onExports: () => void;
}) {
  const [filters, setFilters] = useState<Filters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [lightboxAutoplay, setLightboxAutoplay] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const desktopInspector = useMediaQuery('(min-width: 1280px)');
  const videos = useInfiniteQuery({
    queryKey: ['videos', filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchVideoPage(filters, pageParam),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
  const keywords = useQuery({ queryKey: ['keywords'], queryFn: fetchKeywordSummaries });
  const items = videos.data?.pages.flatMap((page) => page.items) ?? [];
  const total = videos.data?.pages[0]?.total ?? 0;
  const selected = selectedId ? (items.find((item) => item.id === selectedId) ?? null) : null;
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

  const openLightbox = (item: Video, autoplay = false) => {
    setSelectedId(item.id);
    setLightboxAutoplay(autoplay);
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
    void queryClient.invalidateQueries({ queryKey: ['keywords'] });
  };
  const reimport = async () => {
    if (importing) return;
    setImporting(true);
    try {
      await reimportCatalog();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['videos'] }),
        queryClient.invalidateQueries({ queryKey: ['keywords'] }),
      ]);
    } finally {
      setImporting(false);
    }
  };
  const appendAll = async () => {
    const ids = await fetchSelectionIds(filters);
    setMontageSelection((current) => addToSelection(current, ids));
  };
  const loadingMessage = videos.isLoading
    ? 'Loading videos…'
    : videos.isFetchingNextPage
      ? 'Loading more…'
      : videos.hasNextPage
        ? 'Scroll to load more'
        : 'All videos loaded';

  return (
    <>
      <CatalogToolbar
        filters={filters}
        setFilters={setFilters}
        filtersOpen={() => setFiltersOpen(true)}
        montageSelectionCount={montageSelection.length}
        total={total}
        colorMode={colorMode}
        importing={importing}
        onSelectAll={() => void appendAll()}
        onUnselectAll={() => setMontageSelection([])}
        onMontage={onMontage}
        onExports={onExports}
        onToggleColorMode={onToggleColorMode}
        onReimport={() => void reimport()}
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '264px minmax(0, 1fr)' },
          '@media (min-width: 1280px)': {
            gridTemplateColumns: selected ? '264px minmax(0, 1fr) 390px' : '264px minmax(0, 1fr)',
          },
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        <Paper
          component="aside"
          square
          sx={{ display: { xs: 'none', lg: 'block' }, borderRight: 1, borderColor: 'divider' }}
        >
          <FiltersPanel
            filters={filters}
            setFilters={setFilters}
            keywords={keywords.data ?? []}
            keywordsLoading={keywords.isLoading}
            keywordsError={keywords.isError}
          />
        </Paper>
        <Drawer anchor="left" open={filtersOpen} onClose={() => setFiltersOpen(false)}>
          <Box sx={{ width: 300 }}>
            <FiltersPanel
              filters={filters}
              setFilters={setFilters}
              keywords={keywords.data ?? []}
              keywordsLoading={keywords.isLoading}
              keywordsError={keywords.isError}
              onClose={() => setFiltersOpen(false)}
            />
          </Box>
        </Drawer>
        <Box component="main" sx={{ minWidth: 0, px: { xs: 2, sm: 3 }, py: 3 }}>
          <Stack
            direction="row"
            sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}
          >
            <Box>
              <Typography variant="subtitle1">Library</Typography>
              <Typography variant="body2" color="text.secondary">
                Browse, review, and refine your clips.
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<FileUploadRounded />}
              onClick={() => void reimport()}
              disabled={importing}
              sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
            >
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </Stack>
          {videos.error && (
            <Paper role="alert" sx={{ p: 2, color: 'error.main', mb: 2 }}>
              {videos.error.message}
            </Paper>
          )}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(172px, 1fr))',
              gap: 2,
            }}
          >
            {items.map((item) => (
              <Card
                key={item.id}
                item={item}
                selected={item.id === selected?.id}
                onSelect={() => setSelectedId(item.id)}
                onPlay={() => openLightbox(item, true)}
                selectionIndex={montageSelection.indexOf(item.id)}
                onToggleSelection={() =>
                  setMontageSelection((current) => toggleSelection(current, item.id))
                }
              />
            ))}
          </Box>
          <Typography
            ref={sentinel}
            align="center"
            color="text.secondary"
            variant="body2"
            sx={{ py: 5 }}
          >
            {loadingMessage}
          </Typography>
        </Box>
        {selected && desktopInspector && (
          <Inspector
            key={selected.id}
            item={selected}
            onSaved={saveVideo}
            onClose={() => setSelectedId(null)}
          />
        )}
      </Box>
      {selected && !desktopInspector && (
        <Drawer anchor="right" open onClose={() => setSelectedId(null)}>
          <Box sx={{ width: { xs: '100vw', sm: 440 }, maxWidth: '100vw', height: '100%' }}>
            <Inspector
              key={selected.id}
              item={selected}
              onSaved={saveVideo}
              onClose={() => setSelectedId(null)}
              drawer
            />
          </Box>
        </Drawer>
      )}
      {lightboxItem && (
        <Lightbox
          items={items}
          item={lightboxItem}
          autoplay={lightboxAutoplay}
          onClose={() => {
            setLightboxId(null);
            setLightboxAutoplay(false);
          }}
          onSelect={(item) => {
            setSelectedId(item.id);
            setLightboxId(item.id);
          }}
        />
      )}
    </>
  );
}
