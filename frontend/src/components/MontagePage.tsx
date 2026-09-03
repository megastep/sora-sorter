import { ArrowBackRounded, DownloadRounded } from '@mui/icons-material';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Player } from '@remotion/player';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
import { dimensionsFor, type MontageSettings, type MontageSpec } from '../montage';
import {
  MontageComposition,
  montageDurationInFrames,
  montageFps,
} from '../remotion/MontageComposition';
import { MontageSettingsPanel } from './MontageSettingsPanel';
import { MontageTimeline } from './MontageTimeline';

const formatDuration = (totalFrames: number) => {
  const totalSeconds = Math.round(totalFrames / montageFps);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

const initialEditorState: MontageSettings = {
  format: 'landscape',
  fillMismatchedOrientation: true,
  title: '',
  titleSubtitle: '',
  titleFontSize: 88,
  titleSubtitleFontSize: 36,
  transition: 'crossfade',
  transitionDuration: 0.5,
  cutColor: '#000000',
  endPage: {
    enabled: false,
    title: 'Thanks for watching',
    subtitle: '',
    fontSize: 72,
    subtitleFontSize: 30,
  },
};

const editorReducer = (
  state: MontageSettings,
  patch: Partial<MontageSettings>,
): MontageSettings => ({
  ...state,
  ...patch,
  endPage: patch.endPage ?? state.endPage,
});

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
  const [editor, dispatchEditor] = useReducer(editorReducer, initialEditorState);
  const [presets, setPresets] = useState<MontagePreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [activePresetId, setActivePresetId] = useState<number | null>(null);
  const [job, setJob] = useState<RenderJob | null>(null);
  const [accelerationReason, setAccelerationReason] = useState<string | null>(null);
  const hasInitializedFromClips = useRef(false);
  useEffect(() => {
    let active = true;
    // fallow-ignore-next-line complexity -- initializes title and orientation together from the selected first clip.
    void fetchMontageClips(ids).then((items) => {
      if (!active) return;
      setClips(items);
      if (!hasInitializedFromClips.current) {
        hasInitializedFromClips.current = true;
        dispatchEditor({
          title: items[0]?.title ?? '',
          format: items[0]?.orientation === 'portrait' ? 'portrait' : 'landscape',
        });
      }
    });
    return () => {
      active = false;
    };
  }, [ids]);
  const settings = editor;
  const spec = useMemo<MontageSpec>(() => ({ clips, ...settings }), [clips, settings]);
  const applyPreset = (preset: MontagePreset) => {
    const next = preset.settings;
    dispatchEditor({
      ...next,
      fillMismatchedOrientation: next.fillMismatchedOrientation ?? true,
    });
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
  const dimensions = dimensionsFor(settings.format);
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
          <MontageTimeline
            clips={clips}
            onReorder={(next) => {
              setClips(next);
              onReorder(next.map((clip) => clip.id));
            }}
          />
        </Box>
        <MontageSettingsPanel
          settings={settings}
          presets={presets}
          activePresetId={activePresetId}
          presetName={presetName}
          job={job}
          onChange={dispatchEditor}
          onPresetNameChange={setPresetName}
          onSelectPreset={(preset) => {
            applyPreset(preset);
            void markMontagePresetUsed(preset.id).then(refreshPresets);
          }}
          onClearPreset={() => {
            setActivePresetId(null);
            setPresetName('');
          }}
          onSavePreset={(presetId) => void savePreset(presetId)}
          onDeletePreset={() =>
            void deleteMontagePreset(activePresetId!).then(() => {
              setActivePresetId(null);
              setPresetName('');
              void refreshPresets();
            })
          }
          onSoftwareFallback={() => void startExport(true)}
        />
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
