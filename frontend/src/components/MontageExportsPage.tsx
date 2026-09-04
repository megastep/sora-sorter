import {
  ArrowBackRounded,
  DeleteRounded,
  DownloadRounded,
  PlayArrowRounded,
} from '@mui/icons-material';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { deleteMontageExport, fetchMontageExports, type MontageExport } from '../api';

const formatDuration = (seconds: number | null) => {
  if (seconds === null) return 'Length unavailable';
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
};

// fallow-ignore-next-line complexity -- list refresh generations and per-export deletion locks coordinate asynchronous UI state.
export function MontageExportsPage({ onBack }: { onBack: () => void }) {
  const [exports, setExports] = useState<MontageExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(() => new Set());
  const refreshVersion = useRef(0);
  const deletingIdsRef = useRef(new Set<number>());
  useEffect(() => {
    let mounted = true;
    const loadExports = () => {
      const requestVersion = ++refreshVersion.current;
      fetchMontageExports()
        .then((items) => {
          if (!mounted || requestVersion !== refreshVersion.current) return;
          setExports(items);
          setError(null);
        })
        .catch((reason: unknown) => {
          if (!mounted || requestVersion !== refreshVersion.current) return;
          setError(reason instanceof Error ? reason.message : 'Could not load generated montages.');
        })
        .finally(() => {
          if (mounted && requestVersion === refreshVersion.current) setLoading(false);
        });
    };
    void loadExports();
    window.addEventListener('montage-export-completed', loadExports);
    return () => {
      mounted = false;
      window.removeEventListener('montage-export-completed', loadExports);
    };
  }, []);
  const deleteExport = (exportId: number) => {
    if (deletingIdsRef.current.has(exportId)) return;
    deletingIdsRef.current.add(exportId);
    setDeletingIds(new Set(deletingIdsRef.current));
    void deleteMontageExport(exportId)
      .then(() => {
        setExports((items) => items.filter((item) => item.id !== exportId));
        setPlayingId((current) => (current === exportId ? null : current));
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Could not delete montage.'),
      )
      .finally(() => {
        deletingIdsRef.current.delete(exportId);
        setDeletingIds(new Set(deletingIdsRef.current));
      });
  };
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
        {loading ? (
          <Paper sx={{ p: 3 }}>
            <Typography>Loading generated montages…</Typography>
          </Paper>
        ) : error && exports.length === 0 ? (
          <Paper role="alert" sx={{ p: 3, color: 'error.main' }}>
            <Typography>{error}</Typography>
          </Paper>
        ) : exports.length === 0 ? (
          <Paper sx={{ p: 3 }}>
            <Typography>No generated montages yet.</Typography>
          </Paper>
        ) : (
          // fallow-ignore-next-line complexity -- each export card combines playback, download, and a per-item pending deletion state.
          exports.map((entry) => (
            <Paper key={entry.id} sx={{ p: 2 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                sx={{ alignItems: { sm: 'center' }, gap: 2 }}
              >
                <Box sx={{ minWidth: 0, mr: { sm: 'auto' } }}>
                  <Typography noWrap>{entry.title || 'Untitled montage'}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatDuration(entry.duration_seconds)} · Generated{' '}
                    {new Date(`${entry.generated_at.replace(' ', 'T')}Z`).toLocaleString()}
                  </Typography>
                </Box>
                <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
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
                    disabled={deletingIds.has(entry.id)}
                    onClick={() => deleteExport(entry.id)}
                  >
                    {deletingIds.has(entry.id) ? 'Deleting…' : 'Delete'}
                  </Button>
                </Stack>
              </Stack>
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
        {error && exports.length > 0 && <Typography color="error.main">{error}</Typography>}
      </Stack>
    </Box>
  );
}
