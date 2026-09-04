import { DeleteOutlineRounded, DragIndicatorRounded } from '@mui/icons-material';
import { Box, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import { useRef } from 'react';
import { type MontageClip } from '../montage';

export function MontageTimeline({
  clips,
  onReorder,
  onRemove,
}: {
  clips: MontageClip[];
  onReorder: (clips: MontageClip[]) => void;
  onRemove: (clipId: string) => void;
}) {
  const draggedId = useRef<string | null>(null);
  const move = (from: number, to: number) => {
    const next = [...clips];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onReorder(next);
  };

  return (
    <Paper sx={{ p: 2, overflowX: 'auto' }}>
      <Box sx={{ display: 'flex', gap: 1.5, minWidth: 'max-content' }}>
        {clips.map((clip, index) => (
          <Paper
            key={clip.id}
            variant="outlined"
            draggable
            onDragStart={() => {
              draggedId.current = clip.id;
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              const from = clips.findIndex((value) => value.id === draggedId.current);
              if (from >= 0 && from !== index) move(from, index);
              draggedId.current = null;
            }}
            sx={{ width: 160, p: 1, position: 'relative', cursor: 'grab' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <DragIndicatorRounded color="action" fontSize="small" />
              <Typography variant="caption">{index + 1}</Typography>
            </Box>
            <Tooltip title={clips.length <= 2 ? 'Keep at least two clips' : 'Remove clip'}>
              <span>
                <IconButton
                  size="small"
                  color="error"
                  aria-label={`Remove ${clip.title} from montage`}
                  disabled={clips.length <= 2}
                  onClick={() => onRemove(clip.id)}
                  sx={{ position: 'absolute', top: 4, right: 4 }}
                >
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Box
              component="img"
              src={clip.poster_url}
              alt=""
              sx={{ width: '100%', aspectRatio: '16/10', objectFit: 'cover', mt: 0.5 }}
            />
            <Typography variant="body2" noWrap sx={{ mt: 0.5 }}>
              {clip.title}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
              <IconButton
                size="small"
                aria-label={`Move ${clip.title} earlier`}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                ←
              </IconButton>
              <IconButton
                size="small"
                aria-label={`Move ${clip.title} later`}
                disabled={index === clips.length - 1}
                onClick={() => move(index, index + 1)}
              >
                →
              </IconButton>
            </Box>
          </Paper>
        ))}
      </Box>
    </Paper>
  );
}
