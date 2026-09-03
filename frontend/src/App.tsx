import {
  AppBar,
  Box,
  Button,
  Chip,
  CssBaseline,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  ThemeProvider,
  Toolbar,
  Tooltip,
  Typography,
  createTheme,
} from '@mui/material';
import {
  Brightness4Rounded,
  Brightness7Rounded,
  FileUploadRounded,
  FilterListRounded,
  VideoLibraryRounded,
} from '@mui/icons-material';
import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchVideoPage, reimportCatalog, type VideoPage } from './api';
import { type Filters, type Video } from './catalog';
import { Card } from './components/Card';
import { FiltersPanel } from './components/FiltersPanel';
import { Inspector } from './components/Inspector';
import { Lightbox } from './components/Lightbox';

type ColorMode = 'light' | 'dark';

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
  const sentinel = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: colorMode,
          primary: { main: '#5b5ce2' },
          background:
            colorMode === 'dark'
              ? { default: '#0b111a', paper: '#131c28' }
              : { default: '#f6f7fb', paper: '#ffffff' },
        },
        shape: { borderRadius: 12 },
        typography: {
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          button: { fontWeight: 700, textTransform: 'none' },
        },
        components: {
          MuiPaper: { defaultProps: { elevation: 0 } },
          MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10 } } },
          MuiButton: { defaultProps: { disableElevation: true } },
        },
      }),
    [colorMode],
  );
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
    window.localStorage.setItem('video-catalog-color-mode', colorMode);
  }, [colorMode]);

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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="sticky" color="transparent" elevation={0}>
        <Toolbar
          sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', gap: 1.5 }}
        >
          <Tooltip title="Show filters">
            <IconButton
              aria-label="Show filters"
              onClick={() => setFiltersOpen(true)}
              sx={{ display: { lg: 'none' } }}
            >
              <FilterListRounded />
            </IconButton>
          </Tooltip>
          <VideoLibraryRounded color="primary" />
          <Typography
            variant="h6"
            component="h1"
            sx={{ fontWeight: 800, letterSpacing: '-0.02em', mr: 'auto' }}
          >
            Video Catalog
          </Typography>
          <Chip
            label={`${total} videos`}
            size="small"
            variant="outlined"
            sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
          />
          <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 154 } }}>
            <InputLabel id="sort-videos-label">Sort</InputLabel>
            <Select
              labelId="sort-videos-label"
              aria-label="Sort videos"
              label="Sort"
              value={filters.sort ?? 'newest'}
              onChange={(event) => setFilters({ ...filters, sort: event.target.value })}
            >
              <MenuItem value="newest">Newest first</MenuItem>
              <MenuItem value="oldest">Oldest first</MenuItem>
              <MenuItem value="title">Title A–Z</MenuItem>
              <MenuItem value="title_desc">Title Z–A</MenuItem>
              <MenuItem value="duration">Longest first</MenuItem>
              <MenuItem value="language">Language A–Z</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title={`Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`}>
            <Switch
              aria-label="Toggle color mode"
              checked={colorMode === 'dark'}
              onChange={() => setColorMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
              icon={<Brightness7Rounded fontSize="small" />}
              checkedIcon={<Brightness4Rounded fontSize="small" />}
            />
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<FileUploadRounded />}
            onClick={reimport}
            disabled={importing}
            sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
          >
            {importing ? 'Importing…' : 'Import / Reimport'}
          </Button>
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '264px minmax(0, 1fr)' },
          '@media (min-width: 1280px)': { gridTemplateColumns: '264px minmax(0, 1fr) 390px' },
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        <Paper
          component="aside"
          square
          sx={{ display: { xs: 'none', lg: 'block' }, borderRight: 1, borderColor: 'divider' }}
        >
          <FiltersPanel filters={filters} setFilters={setFilters} />
        </Paper>
        <Drawer anchor="left" open={filtersOpen} onClose={() => setFiltersOpen(false)}>
          <Box sx={{ width: 300 }}>
            <FiltersPanel
              filters={filters}
              setFilters={setFilters}
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
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Library
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Browse, review, and refine your clips.
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<FileUploadRounded />}
              onClick={reimport}
              disabled={importing}
              sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
            >
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </Stack>
          {videos.isError && (
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
            {videos.isLoading
              ? 'Loading videos…'
              : videos.isFetchingNextPage
                ? 'Loading more…'
                : videos.hasNextPage
                  ? 'Scroll to load more'
                  : 'All videos loaded'}
          </Typography>
        </Box>
        {selected && <Inspector key={selected.id} item={selected} onSaved={saveVideo} />}
      </Box>
      {lightboxItem && (
        <Lightbox
          items={items}
          item={lightboxItem}
          autoplay={lightboxAutoplay}
          onClose={() => {
            setLightboxId(null);
            setLightboxAutoplay(false);
          }}
          onSelect={(item) => setLightboxId(item.id)}
        />
      )}
    </ThemeProvider>
  );
}
