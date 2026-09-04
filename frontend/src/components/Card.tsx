import {
  Box,
  Card as MuiCard,
  CardActionArea,
  CardContent,
  CardMedia,
  Checkbox,
  Chip,
  IconButton,
  Rating,
  Typography,
} from '@mui/material';
import BookmarkRounded from '@mui/icons-material/BookmarkRounded';
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
        <Chip
          label={`${Math.round(item.duration_seconds || 0)}s`}
          size="small"
          variant="outlined"
          sx={{
            position: 'absolute',
            top: 9,
            right: 9,
            zIndex: 2,
            bgcolor: 'rgba(0, 0, 0, 0.64)',
            borderColor: 'rgba(255, 255, 255, 0.55)',
            color: 'common.white',
            pointerEvents: 'none',
          }}
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
          <Typography variant="subtitle2" sx={{ minWidth: 0 }}>
            {item.title}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 20, mt: 0.5 }}>
            {item.rating !== null && (
              <Rating
                value={item.rating}
                readOnly
                size="small"
                aria-label={`${item.rating} out of 5 stars`}
                sx={{ color: 'warning.main', fontSize: '1rem' }}
              />
            )}
            {item.favorite && (
              <Box
                component="span"
                aria-label="Favorite"
                title="Favorite"
                sx={{ display: 'inline-flex', color: 'primary.main' }}
              >
                <BookmarkRounded fontSize="small" />
              </Box>
            )}
          </Box>
        </CardContent>
      </CardActionArea>
    </MuiCard>
  );
}
