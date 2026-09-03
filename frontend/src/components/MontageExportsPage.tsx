import {
  ArrowBackRounded,
  DeleteRounded,
  DownloadRounded,
  PlayArrowRounded,
} from '@mui/icons-material';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { deleteMontageExport, fetchMontageExports, type MontageExport } from '../api';

const formatDuration = (seconds: number | null) => {
  if (seconds === null) return 'Length unavailable';
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
};

export function MontageExportsPage({ onBack }: { onBack: () => void }) {
  const [exports, setExports] = useState<MontageExport[]>([]);
  const [playingId, setPlayingId] = useState<number | null>(null);
  useEffect(() => {
    void fetchMontageExports().then(setExports);
  }, []);
  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, md: 4 } }}>
      <Button startIcon={<ArrowBackRounded />} onClick={onBack}>
        Back to montage
      </Button>
      <Typography variant="h4" sx={{ mt: 2, mb: 0.5 }}>
        Generated montages
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Previously rendered MP4 files available on this device.
      </Typography>
      <Stack spacing={1.5}>
        {exports.length === 0 ? (
          <Paper sx={{ p: 3 }}>
            <Typography>No generated montages yet.</Typography>
          </Paper>
        ) : (
          exports.map((entry) => (
            <Paper key={entry.id} sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ minWidth: 0, mr: 'auto' }}>
                  <Typography noWrap>{entry.title || 'Untitled montage'}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatDuration(entry.duration_seconds)} · Generated{' '}
                    {new Date(`${entry.generated_at.replace(' ', 'T')}Z`).toLocaleString()}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  startIcon={<PlayArrowRounded />}
                  onClick={() =>
                    setPlayingId((current) => (current === entry.id ? null : entry.id))
                  }
                >
                  {playingId === entry.id ? 'Hide player' : 'Play'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<DownloadRounded />}
                  component="a"
                  href={`/api/montage-exports/${entry.id}/download`}
                >
                  Download
                </Button>
                <Button
                  color="error"
                  startIcon={<DeleteRounded />}
                  onClick={() =>
                    void deleteMontageExport(entry.id).then(() => {
                      setExports((items) => items.filter((item) => item.id !== entry.id));
                      setPlayingId((current) => (current === entry.id ? null : current));
                    })
                  }
                >
                  Delete
                </Button>
              </Box>
              {playingId === entry.id && (
                <Box
                  component="video"
                  controls
                  autoPlay
                  src={`/api/montage-exports/${entry.id}/media`}
                  sx={{ width: '100%', mt: 2, maxHeight: 520, bgcolor: 'common.black' }}
                />
              )}
            </Paper>
          ))
        )}
      </Stack>
    </Box>
  );
}
