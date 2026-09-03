import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  fetchKeywordSummaries,
  fetchSelectionIds,
  fetchVideoPage,
  reimportCatalog,
  type VideoPage,
} from './api';
import { type Filters, type Video } from './catalog';
import { addToSelection, selectionStorageKey, toggleSelection } from './montage';
import { CatalogToolbar, type ColorMode } from './components/CatalogToolbar';
import { CatalogWorkspace } from './components/CatalogWorkspace';
import { MontagePage } from './components/MontagePage';
import { MontageExportsPage } from './components/MontageExportsPage';
import { createCatalogTheme } from './theme';

const initialColorMode = (): ColorMode => {
  const saved = window.localStorage.getItem('video-catalog-color-mode');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export function App() {
  const [filters, setFilters] = useState<Filters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [lightboxAutoplay, setLightboxAutoplay] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>(initialColorMode);
  const [montageSelection, setMontageSelection] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(selectionStorageKey) ?? '[]');
      return Array.isArray(stored)
        ? stored.filter((value): value is string => typeof value === 'string')
        : [];
    } catch {
      return [];
    }
  });
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const desktopInspector = useMediaQuery('(min-width: 1280px)');
  const theme = useMemo(() => createCatalogTheme(colorMode), [colorMode]);
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
    window.localStorage.setItem('video-catalog-color-mode', colorMode);
  }, [colorMode]);
  useEffect(() => {
    window.sessionStorage.setItem(selectionStorageKey, JSON.stringify(montageSelection));
  }, [montageSelection]);

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

  if (location.pathname === '/montages') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <MontageExportsPage onBack={() => navigate('/montage')} />
      </ThemeProvider>
    );
  }

  if (location.pathname === '/montage') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <MontagePage
          ids={montageSelection}
          onBack={() => navigate('/')}
          onReorder={setMontageSelection}
          onExports={() => navigate('/montages')}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
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
        onMontage={() => navigate('/montage')}
        onExports={() => navigate('/montages')}
        onToggleColorMode={() => setColorMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
        onReimport={() => void reimport()}
      />
      <CatalogWorkspace
        filters={filters}
        setFilters={setFilters}
        keywords={keywords.data ?? []}
        keywordsLoading={keywords.isLoading}
        keywordsError={keywords.isError}
        filtersOpen={filtersOpen}
        onCloseFilters={() => setFiltersOpen(false)}
        importing={importing}
        onReimport={() => void reimport()}
        items={items}
        selected={selected}
        desktopInspector={desktopInspector}
        montageSelection={montageSelection}
        videosError={videos.error}
        loadingMessage={loadingMessage}
        hasNextPage={videos.hasNextPage}
        fetchingNextPage={videos.isFetchingNextPage}
        onLoadMore={() => void videos.fetchNextPage()}
        lightboxItem={lightboxItem ?? null}
        lightboxAutoplay={lightboxAutoplay}
        onSelect={(item) => setSelectedId(item.id)}
        onPlay={(item) => openLightbox(item, true)}
        onToggleSelection={(id) => setMontageSelection((current) => toggleSelection(current, id))}
        onSaveVideo={saveVideo}
        onCloseInspector={() => setSelectedId(null)}
        onCloseLightbox={() => {
          setLightboxId(null);
          setLightboxAutoplay(false);
        }}
        onSelectLightbox={(item) => {
          setSelectedId(item.id);
          setLightboxId(item.id);
        }}
      />
    </ThemeProvider>
  );
}
