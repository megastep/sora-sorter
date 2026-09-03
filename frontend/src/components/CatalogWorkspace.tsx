import { FileUploadRounded } from '@mui/icons-material';
import { Box, Button, Drawer, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useRef } from 'react';
import { type KeywordSummary } from '../api';
import { type Filters, type Video } from '../catalog';
import { Card } from './Card';
import { FiltersPanel } from './FiltersPanel';
import { Inspector } from './Inspector';
import { Lightbox } from './Lightbox';

type Props = {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  keywords: KeywordSummary[];
  keywordsLoading: boolean;
  keywordsError: boolean;
  filtersOpen: boolean;
  onCloseFilters: () => void;
  importing: boolean;
  onReimport: () => void;
  items: Video[];
  selected: Video | null;
  desktopInspector: boolean;
  montageSelection: string[];
  videosError: Error | null;
  loadingMessage: string;
  hasNextPage: boolean;
  fetchingNextPage: boolean;
  onLoadMore: () => void;
  lightboxItem: Video | null;
  lightboxAutoplay: boolean;
  onSelect: (item: Video) => void;
  onPlay: (item: Video) => void;
  onToggleSelection: (id: string) => void;
  onSaveVideo: (item: Video) => void;
  onCloseInspector: () => void;
  onCloseLightbox: () => void;
  onSelectLightbox: (item: Video) => void;
};

export function CatalogWorkspace(props: Props) {
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !props.hasNextPage || props.fetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) props.onLoadMore();
      },
      { rootMargin: '500px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [props.hasNextPage, props.fetchingNextPage, props.onLoadMore]);

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '264px minmax(0, 1fr)' },
          '@media (min-width: 1280px)': {
            gridTemplateColumns: props.selected
              ? '264px minmax(0, 1fr) 390px'
              : '264px minmax(0, 1fr)',
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
            filters={props.filters}
            setFilters={props.setFilters}
            keywords={props.keywords}
            keywordsLoading={props.keywordsLoading}
            keywordsError={props.keywordsError}
          />
        </Paper>
        <Drawer anchor="left" open={props.filtersOpen} onClose={props.onCloseFilters}>
          <Box sx={{ width: 300 }}>
            <FiltersPanel
              filters={props.filters}
              setFilters={props.setFilters}
              keywords={props.keywords}
              keywordsLoading={props.keywordsLoading}
              keywordsError={props.keywordsError}
              onClose={props.onCloseFilters}
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
              onClick={props.onReimport}
              disabled={props.importing}
              sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
            >
              {props.importing ? 'Importing…' : 'Import'}
            </Button>
          </Stack>
          {props.videosError && (
            <Paper role="alert" sx={{ p: 2, color: 'error.main', mb: 2 }}>
              {props.videosError.message}
            </Paper>
          )}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(172px, 1fr))',
              gap: 2,
            }}
          >
            {props.items.map((item) => (
              <Card
                key={item.id}
                item={item}
                selected={item.id === props.selected?.id}
                onSelect={() => props.onSelect(item)}
                onPlay={() => props.onPlay(item)}
                selectionIndex={props.montageSelection.indexOf(item.id)}
                onToggleSelection={() => props.onToggleSelection(item.id)}
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
            {props.loadingMessage}
          </Typography>
        </Box>
        {props.selected && props.desktopInspector && (
          <Inspector
            key={props.selected.id}
            item={props.selected}
            onSaved={props.onSaveVideo}
            onClose={props.onCloseInspector}
          />
        )}
      </Box>
      {props.selected && !props.desktopInspector && (
        <Drawer anchor="right" open onClose={props.onCloseInspector}>
          <Box sx={{ width: { xs: '100vw', sm: 440 }, maxWidth: '100vw', height: '100%' }}>
            <Inspector
              key={props.selected.id}
              item={props.selected}
              onSaved={props.onSaveVideo}
              onClose={props.onCloseInspector}
              drawer
            />
          </Box>
        </Drawer>
      )}
      {props.lightboxItem && (
        <Lightbox
          items={props.items}
          item={props.lightboxItem}
          autoplay={props.lightboxAutoplay}
          onClose={props.onCloseLightbox}
          onSelect={props.onSelectLightbox}
        />
      )}
    </>
  );
}
