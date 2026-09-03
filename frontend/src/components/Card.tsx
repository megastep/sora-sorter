import {
  Box,
  Card as MuiCard,
  CardActionArea,
  CardContent,
  CardMedia,
  Checkbox,
  Chip,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import { alpha } from '@mui/material/styles';
import { API, type Video } from '../catalog';

export function Card({
  item,
  selected,
  onSelect,
  onPlay,
  selectionIndex,
  onToggleSelection,
}: {
  item: Video;
  selected: boolean;
  onSelect: () => void;
  onPlay: () => void;
  selectionIndex: number;
  onToggleSelection: () => void;
}) {
  return (
    <MuiCard
      variant="outlined"
      sx={{
        display: 'flex',
        height: '100%',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        borderColor: selected ? 'primary.main' : 'divider',
        boxShadow: selected
          ? (theme) => `0 10px 24px ${alpha(theme.palette.primary.main, 0.16)}`
          : 0,
      }}
    >
      <Box
        sx={{
          position: 'relative',
          display: 'grid',
          aspectRatio: '9 / 13',
          placeItems: 'center',
          overflow: 'hidden',
          bgcolor: 'common.black',
        }}
      >
        <CardActionArea
          aria-label={`Select ${item.title} for editing`}
          onClick={onSelect}
          sx={{ width: '100%', height: '100%' }}
        >
          <CardMedia
            component="img"
            image={`${API}/videos/${item.id}/poster`}
            alt={item.title}
            loading="lazy"
            sx={{
              width: '100%',
              height: '100%',
              objectFit: item.orientation === 'landscape' ? 'contain' : 'cover',
            }}
          />
        </CardActionArea>
        <Checkbox
          checked={selectionIndex >= 0}
          onClick={(event) => event.stopPropagation()}
          onChange={onToggleSelection}
          slotProps={{
            input: {
              'aria-label':
                selectionIndex >= 0
                  ? `Remove ${item.title} from montage selection`
                  : `Add ${item.title} to montage selection`,
            },
          }}
          icon={
            <Box
              sx={{
                width: 24,
                height: 24,
                border: 2,
                borderColor: 'common.white',
                borderRadius: 0.75,
                bgcolor: 'rgba(0,0,0,.45)',
              }}
            />
          }
          checkedIcon={
            <Box
              sx={{
                width: 26,
                height: 26,
                borderRadius: 0.75,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                display: 'grid',
                placeItems: 'center',
                fontSize: 14,
                fontWeight: 800,
              }}
            >
              {selectionIndex + 1}
            </Box>
          }
          sx={{ position: 'absolute', top: 5, left: 5, p: 0.5, color: 'common.white', zIndex: 2 }}
        />
        <IconButton
          aria-label={`Play ${item.title}`}
          onClick={onPlay}
          size="small"
          sx={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            color: 'common.white',
            bgcolor: 'rgba(0, 0, 0, 0.64)',
            '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.8)' },
          }}
        >
          <PlayArrowRounded fontSize="small" />
        </IconButton>
      </Box>
      <CardActionArea
        aria-label={`Select ${item.title} for editing`}
        onClick={onSelect}
        sx={{
          display: 'flex',
          flexGrow: 1,
          alignItems: 'stretch',
        }}
      >
        <CardContent
          sx={{
            display: 'flex',
            flexGrow: 1,
            flexDirection: 'column',
            justifyContent: 'flex-end',
            p: 1.5,
            '&:last-child': { pb: 1.5 },
          }}
        >
          <Stack
            direction="row"
            sx={{ justifyContent: 'space-between', alignItems: 'start', gap: 1 }}
          >
            <Typography variant="subtitle2" sx={{ minWidth: 0 }}>
              {item.title}
            </Typography>
            <Chip
              label={`${Math.round(item.duration_seconds || 0)}s`}
              size="small"
              variant="outlined"
              sx={{ flexShrink: 0 }}
            />
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: 'block', mt: 0.5 }}
          >
            {item.language || 'unknown'} · {item.review_status}
          </Typography>
        </CardContent>
      </CardActionArea>
    </MuiCard>
  );
}
