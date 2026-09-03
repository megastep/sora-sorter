import {
  ArrowBackRounded,
  DownloadRounded,
  DragIndicatorRounded,
  ExpandMoreRounded,
} from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Player } from '@remotion/player';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchMontageCapabilities,
  fetchMontageClips,
  fetchMontagePresets,
  fetchRenderJob,
  renderMontage,
  saveMontagePreset,
  deleteMontagePreset,
  markMontagePresetUsed,
  type RenderJob,
  type MontagePreset,
} from '../api';
import {
  dimensionsFor,
  type MontageSettings,
  type MontageSpec,
  type OutputFormat,
  type TransitionType,
} from '../montage';
import {
  MontageComposition,
  montageDurationInFrames,
  montageFps,
} from '../remotion/MontageComposition';

const formatDuration = (totalFrames: number) => {
  const totalSeconds = Math.round(totalFrames / montageFps);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

// fallow-ignore-next-line complexity -- editor settings are intentionally colocated with the shared preview state.
export function MontagePage({
  ids,
  onBack,
  onReorder,
  onExports,
}: {
  ids: string[];
  onBack: () => void;
  onReorder: (ids: string[]) => void;
  onExports: () => void;
}) {
  const [clips, setClips] = useState<MontageSpec['clips']>([]);
  const [format, setFormat] = useState<OutputFormat>('landscape');
  const [fillMismatchedOrientation, setFillMismatchedOrientation] = useState(true);
  const [title, setTitle] = useState('');
  const [titleSubtitle, setTitleSubtitle] = useState('');
  const [titleFontSize, setTitleFontSize] = useState(88);
  const [titleSubtitleFontSize, setTitleSubtitleFontSize] = useState(36);
  const [transition, setTransition] = useState<TransitionType>('crossfade');
  const [transitionDuration, setTransitionDuration] = useState(0.5);
  const [cutColor, setCutColor] = useState('#000000');
  const [endEnabled, setEndEnabled] = useState(false);
  const [endTitle, setEndTitle] = useState('Thanks for watching');
  const [endSubtitle, setEndSubtitle] = useState('');
  const [endFontSize, setEndFontSize] = useState(72);
  const [endSubtitleFontSize, setEndSubtitleFontSize] = useState(30);
  const [presets, setPresets] = useState<MontagePreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [activePresetId, setActivePresetId] = useState<number | null>(null);
  const [job, setJob] = useState<RenderJob | null>(null);
  const draggedId = useRef<string | null>(null);
  const [accelerationReason, setAccelerationReason] = useState<string | null>(null);
  const selectedIdsKey = ids.join(',');
  const selectedIds = useMemo(
    () => (selectedIdsKey ? selectedIdsKey.split(',') : []),
    [selectedIdsKey],
  );
  useEffect(() => {
    // fallow-ignore-next-line complexity -- initializes title and orientation together from the selected first clip.
    void fetchMontageClips(selectedIds).then((items) => {
      setClips(items);
      setTitle(items[0]?.title ?? '');
      setFormat(items[0]?.orientation === 'portrait' ? 'portrait' : 'landscape');
    });
  }, [selectedIds]);
  const settings = useMemo<MontageSettings>(
    () => ({
      format,
      fillMismatchedOrientation,
      title,
      titleSubtitle,
      titleFontSize,
      titleSubtitleFontSize,
      titleDuration: 3,
      transition,
      transitionDuration,
      cutColor,
      endPage: {
        enabled: endEnabled,
        title: endTitle,
        subtitle: endSubtitle,
        fontSize: endFontSize,
        subtitleFontSize: endSubtitleFontSize,
        duration: 3,
      },
    }),
    [
      format,
      fillMismatchedOrientation,
      title,
      titleSubtitle,
      titleFontSize,
      titleSubtitleFontSize,
      transition,
      transitionDuration,
      cutColor,
      endEnabled,
      endTitle,
      endSubtitle,
      endFontSize,
      endSubtitleFontSize,
    ],
  );
  const spec = useMemo<MontageSpec>(() => ({ clips, ...settings }), [clips, settings]);
  const applyPreset = (preset: MontagePreset) => {
    const next = preset.settings;
    setFormat(next.format);
    setFillMismatchedOrientation(next.fillMismatchedOrientation ?? true);
    setTitle(next.title);
    setTitleSubtitle(next.titleSubtitle);
    setTitleFontSize(next.titleFontSize);
    setTitleSubtitleFontSize(next.titleSubtitleFontSize);
    setTransition(next.transition);
    setTransitionDuration(next.transitionDuration);
    setCutColor(next.cutColor);
    setEndEnabled(next.endPage.enabled);
    setEndTitle(next.endPage.title);
    setEndSubtitle(next.endPage.subtitle);
    setEndFontSize(next.endPage.fontSize);
    setEndSubtitleFontSize(next.endPage.subtitleFontSize);
    setActivePresetId(preset.id);
    setPresetName(preset.name);
  };
  useEffect(() => {
    void fetchMontagePresets().then((items) => {
      setPresets(items);
      if (items[0]) applyPreset(items[0]);
    });
  }, []);
  const refreshPresets = async () => setPresets(await fetchMontagePresets());
  const savePreset = async (presetId?: number) => {
    const saved = await saveMontagePreset(presetName, settings, presetId);
    setActivePresetId(saved.id);
    await refreshPresets();
  };
  const dimensions = dimensionsFor(format);
  const totalFrames = montageDurationInFrames(spec);
  useEffect(() => {
    if (!job || !['queued', 'rendering'].includes(job.status)) return;
    const timer = window.setInterval(() => void fetchRenderJob(job.id).then(setJob), 900);
    return () => window.clearInterval(timer);
  }, [job]);
  const startExport = async (softwareFallback = false) => {
    if (!softwareFallback) {
      const capability = await fetchMontageCapabilities();
      if (!capability.accelerated) {
        setAccelerationReason(
          capability.reason ?? 'Required hardware acceleration is unavailable.',
        );
        return;
      }
    }
    setJob(await renderMontage(spec, softwareFallback));
  };
  if (clips.length < 2)
    return (
      <Box sx={{ p: 4 }}>
        <Button startIcon={<ArrowBackRounded />} onClick={onBack}>
          Back to library
        </Button>
        <Button onClick={onExports}>Generated videos</Button>
        <Typography sx={{ mt: 2 }}>
          Choose at least two available clips to create a montage.
        </Typography>
      </Box>
    );
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Stack
        component="header"
        direction="row"
        sx={{
          alignItems: 'center',
          gap: 2,
          px: 3,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Button startIcon={<ArrowBackRounded />} onClick={onBack}>
          Back to library
        </Button>
        <Box sx={{ mr: 'auto' }}>
          <Typography variant="h6">Montage</Typography>
          <Typography variant="caption" color="text.secondary">
            Total length: {formatDuration(totalFrames)}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={
            job?.status === 'rendering' ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <DownloadRounded />
            )
          }
          onClick={() => void startExport()}
          disabled={Boolean(job && ['queued', 'rendering'].includes(job.status))}
        >
          Export 1080p MP4
        </Button>
      </Stack>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 360px' },
          gap: 3,
          p: { xs: 2, lg: 3 },
        }}
      >
        <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <Paper sx={{ p: 1, bgcolor: 'common.black' }}>
            <Player
              component={MontageComposition}
              inputProps={{ spec }}
              durationInFrames={totalFrames}
              compositionWidth={dimensions.width}
              compositionHeight={dimensions.height}
              fps={montageFps}
              controls
              style={{ width: '100%', aspectRatio: `${dimensions.width}/${dimensions.height}` }}
            />
          </Paper>
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
                    if (!draggedId.current || draggedId.current === clip.id) return;
                    const next = [...clips];
                    const from = next.findIndex((value) => value.id === draggedId.current);
                    const to = next.findIndex((value) => value.id === clip.id);
                    next.splice(to, 0, next.splice(from, 1)[0]);
                    setClips(next);
                    onReorder(next.map((value) => value.id));
                    draggedId.current = null;
                  }}
                  sx={{ width: 160, p: 1, position: 'relative', cursor: 'grab' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <DragIndicatorRounded color="action" fontSize="small" />
                    <Typography variant="caption">{index + 1}</Typography>
                  </Box>
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
                    <Button
                      size="small"
                      aria-label={`Move ${clip.title} earlier`}
                      disabled={index === 0}
                      onClick={() => {
                        const next = [...clips];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        setClips(next);
                        onReorder(next.map((value) => value.id));
                      }}
                    >
                      ←
                    </Button>
                    <Button
                      size="small"
                      aria-label={`Move ${clip.title} later`}
                      disabled={index === clips.length - 1}
                      onClick={() => {
                        const next = [...clips];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        setClips(next);
                        onReorder(next.map((value) => value.id));
                      }}
                    >
                      →
                    </Button>
                  </Box>
                </Paper>
              ))}
            </Box>
          </Paper>
        </Box>
        <Paper sx={{ p: 2.5 }}>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Typography variant="subtitle1">Montage settings</Typography>
            <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
              <AccordionSummary expandIcon={<ExpandMoreRounded />}>
                <Typography>Presets{activePresetId ? ` · ${presetName}` : ''}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5}>
                  <FormControl fullWidth>
                    <InputLabel id="montage-preset">Preset</InputLabel>
                    <Select
                      labelId="montage-preset"
                      label="Preset"
                      value={activePresetId ?? ''}
                      onChange={(event) => {
                        const preset = presets.find(
                          (item) => item.id === Number(event.target.value),
                        );
                        if (preset) {
                          applyPreset(preset);
                          void markMontagePresetUsed(preset.id).then(refreshPresets);
                        }
                      }}
                    >
                      <MenuItem value="">Custom settings</MenuItem>
                      {presets.map((preset) => (
                        <MenuItem key={preset.id} value={preset.id}>
                          {preset.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    label="Preset name"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                  />
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <Button
                      variant="outlined"
                      onClick={() => void savePreset()}
                      disabled={!presetName.trim()}
                    >
                      Save new preset
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => activePresetId && void savePreset(activePresetId)}
                      disabled={!activePresetId || !presetName.trim()}
                    >
                      Update preset
                    </Button>
                  </Box>
                  {activePresetId && (
                    <Button
                      color="error"
                      onClick={() =>
                        void deleteMontagePreset(activePresetId).then(() => {
                          setActivePresetId(null);
                          setPresetName('');
                          void refreshPresets();
                        })
                      }
                    >
                      Delete preset
                    </Button>
                  )}
                </Stack>
              </AccordionDetails>
            </Accordion>
            <ToggleButtonGroup
              exclusive
              value={format}
              onChange={(_, value) => value && setFormat(value)}
              fullWidth
            >
              <ToggleButton value="landscape">Landscape 16:9</ToggleButton>
              <ToggleButton value="portrait">Portrait 9:16</ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ mr: 'auto' }}>Blur-fill mixed orientations</Typography>
              <Switch
                checked={fillMismatchedOrientation}
                onChange={(event) => setFillMismatchedOrientation(event.target.checked)}
              />
            </Box>
            <TextField
              label="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <TextField
              label="Title subtext (optional)"
              value={titleSubtitle}
              onChange={(event) => setTitleSubtitle(event.target.value)}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <TextField
                label="Title font size"
                type="number"
                slotProps={{ htmlInput: { min: 32, max: 180, step: 1 } }}
                value={titleFontSize}
                onChange={(event) => setTitleFontSize(Number(event.target.value))}
              />
              <TextField
                label="Subtext font size"
                type="number"
                slotProps={{ htmlInput: { min: 16, max: 120, step: 1 } }}
                value={titleSubtitleFontSize}
                onChange={(event) => setTitleSubtitleFontSize(Number(event.target.value))}
              />
            </Box>
            <FormControl fullWidth>
              <InputLabel id="transition">Transition</InputLabel>
              <Select
                labelId="transition"
                label="Transition"
                value={transition}
                onChange={(event) => setTransition(event.target.value as TransitionType)}
              >
                <MenuItem value="cut">Cut</MenuItem>
                <MenuItem value="crossfade">Crossfade</MenuItem>
                <MenuItem value="slide">Slide</MenuItem>
                <MenuItem value="wipe">Wipe</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label={`${transition === 'cut' ? 'Cut' : 'Transition'} duration (seconds)`}
              type="number"
              slotProps={{ htmlInput: { min: 0, max: 2, step: 0.1 } }}
              value={transitionDuration}
              onChange={(event) => setTransitionDuration(Number(event.target.value))}
            />
            {transition === 'cut' && (
              <TextField
                label="Cut frame color"
                type="color"
                value={cutColor}
                onChange={(event) => setCutColor(event.target.value)}
                slotProps={{ htmlInput: { 'aria-label': 'Cut frame color' } }}
              />
            )}
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ mr: 'auto' }}>Include end page</Typography>
              <Switch
                checked={endEnabled}
                onChange={(event) => setEndEnabled(event.target.checked)}
              />
            </Box>
            {endEnabled && (
              <>
                <TextField
                  label="End page text"
                  value={endTitle}
                  onChange={(event) => setEndTitle(event.target.value)}
                />
                <TextField
                  label="End page subtext (optional)"
                  value={endSubtitle}
                  onChange={(event) => setEndSubtitle(event.target.value)}
                />
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <TextField
                    label="Title font size"
                    type="number"
                    slotProps={{ htmlInput: { min: 32, max: 180, step: 1 } }}
                    value={endFontSize}
                    onChange={(event) => setEndFontSize(Number(event.target.value))}
                  />
                  <TextField
                    label="Subtext font size"
                    type="number"
                    slotProps={{ htmlInput: { min: 16, max: 120, step: 1 } }}
                    value={endSubtitleFontSize}
                    onChange={(event) => setEndSubtitleFontSize(Number(event.target.value))}
                  />
                </Box>
              </>
            )}
            {job && (
              <Box role="status">
                {job.status === 'completed' ? (
                  <Typography>
                    <a href={`/api/montages/${job.id}/download`}>Download exported MP4</a>
                  </Typography>
                ) : job.status === 'failed' ? (
                  <Stack spacing={1}>
                    <Typography color="error.main">{job.error ?? 'Export failed'}</Typography>
                    {job.error_code === 'hardware_acceleration_unavailable' && (
                      <Button variant="outlined" onClick={() => void startExport(true)}>
                        Export with software fallback
                      </Button>
                    )}
                  </Stack>
                ) : (
                  <Stack spacing={0.75}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                      <Typography color="text.secondary">{job.stage}</Typography>
                      <Typography color="text.secondary">
                        {Math.round(job.progress * 100)}%
                      </Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={Math.round(job.progress * 100)} />
                  </Stack>
                )}
              </Box>
            )}
          </Box>
        </Paper>
      </Box>
      <Dialog open={Boolean(accelerationReason)} onClose={() => setAccelerationReason(null)}>
        <DialogTitle>Hardware acceleration unavailable</DialogTitle>
        <DialogContent>
          <Typography>{accelerationReason}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAccelerationReason(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              setAccelerationReason(null);
              void startExport(true);
            }}
          >
            Export with software fallback
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
