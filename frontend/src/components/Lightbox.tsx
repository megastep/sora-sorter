import { ArrowBackRounded, ArrowForwardRounded, CloseRounded } from '@mui/icons-material';
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { API, type Video } from '../catalog';

const keyboardOffset: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };

export function Lightbox({
  items,
  item,
  autoplay,
  onClose,
  onSelect,
}: {
  items: Video[];
  item: Video;
  autoplay: boolean;
  onClose: () => void;
  onSelect: (value: Video) => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const resumePlayback = useRef(false);
  const shouldAutoplay = useRef(autoplay);
  const index = Math.max(
    0,
    items.findIndex((candidate) => candidate.id === item.id),
  );
  const hasNeighbors = items.length > 1;
  const navigate = (value: Video) => {
    resumePlayback.current = Boolean(
      video.current && !video.current.paused && !video.current.ended,
    );
    onSelect(value);
  };
  const selectOffset = (offset: number) =>
    navigate(items[(index + offset + items.length) % items.length]);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const offset = keyboardOffset[event.key];
    if (hasNeighbors && offset !== undefined) selectOffset(offset);
  };
  useEffect(() => {
    if (shouldAutoplay.current || resumePlayback.current) {
      shouldAutoplay.current = false;
      resumePlayback.current = false;
      void video.current?.play().catch(() => {});
    }
  }, [item.id]);
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      aria-label="Video lightbox"
      onKeyDown={handleKeyDown}
    >
      <DialogTitle sx={{ pr: 7 }}>
        {item.title}
        <Typography variant="body2" color="text.secondary" sx={{ display: 'block' }}>
          {index + 1} of {items.length} · {item.language || 'unknown'} · {item.review_status}
        </Typography>
        <IconButton
          aria-label="Close lightbox"
          onClick={onClose}
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <CloseRounded />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, bgcolor: 'common.black' }}>
        <Box
          component="video"
          ref={video}
          key={item.id}
          autoPlay={autoplay}
          controls
          src={`${API}/videos/${item.id}/media`}
          poster={`${API}/videos/${item.id}/poster`}
          sx={{ display: 'block', width: '100%', maxHeight: '72vh', bgcolor: 'common.black' }}
        />
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
        <Tooltip title="Previous video">
          <span>
            <IconButton
              aria-label="Previous video"
              disabled={!hasNeighbors}
              onClick={() => selectOffset(-1)}
            >
              <ArrowBackRounded />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="body2" color="text.secondary">
          Use ← and → to browse
        </Typography>
        <Tooltip title="Next video">
          <span>
            <IconButton
              aria-label="Next video"
              disabled={!hasNeighbors}
              onClick={() => selectOffset(1)}
            >
              <ArrowForwardRounded />
            </IconButton>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
}
