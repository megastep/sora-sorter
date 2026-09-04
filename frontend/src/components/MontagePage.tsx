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
import { Player, type PlayerRef } from '@remotion/player';
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
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
  defaultMontageSettings,
  dimensionsFor,
  settingsFromPreset,
  type MontageSettings,
  type MontageSpec,
} from '../montage';
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

const isMissingRenderJob = (error: unknown) =>
  error instanceof Error && error.message.includes('(404)');
const activeRenderJobStorageKey = 'video-catalog-active-montage-job';

const previewableSpec = (spec: MontageSpec): MontageSpec => {
  const shortestClip = Math.min(...spec.clips.map((clip) => clip.duration_seconds));
  if (
    !['cut', 'film-cut'].includes(spec.transition) &&
    Math.max(1, Math.round(shortestClip * montageFps)) <=
      Math.max(1, Math.round(spec.transitionDuration * montageFps))
  ) {
    return { ...spec, transition: 'cut', transitionDuration: 0 };
  }
  return spec;
};

// fallow-ignore-next-line complexity -- each guard identifies a distinct invalid timing source.
const previewTimingError = (spec: MontageSpec, previewFrames: number) => {
  if (!Number.isFinite(spec.transitionDuration)) return 'The transition duration is not a number.';
  const invalidClip = spec.clips.find(
    (clip) => !Number.isFinite(clip.duration_seconds) || clip.duration_seconds <= 0,
  );
  if (invalidClip)
    return `The duration for “${invalidClip.title || invalidClip.id}” is unavailable.`;
  if (!Number.isFinite(previewFrames) || previewFrames <= 0)
    return 'The montage timing could not be calculated.';
  return null;
};

const previewState = (spec: MontageSpec) => {
  const previewSpec = previewableSpec(spec);
  const previewFrames = montageDurationInFrames(previewSpec);
  return { previewSpec, previewFrames, timingError: previewTimingError(spec, previewFrames) };
};

type PresetDeletionHandlers = {
  setPresets: Dispatch<SetStateAction<MontagePreset[]>>;
  setActivePresetId: Dispatch<SetStateAction<number | null>>;
  setPresetName: Dispatch<SetStateAction<string>>;
  setPresetError: Dispatch<SetStateAction<string | null>>;
  setPresetDeleting: Dispatch<SetStateAction<boolean>>;
};

const deletePreset = async (presetId: number, handlers: PresetDeletionHandlers) => {
  const { setPresets, setActivePresetId, setPresetName, setPresetError, setPresetDeleting } =
    handlers;
  setPresetDeleting(true);
  try {
    await deleteMontagePreset(presetId);
    setPresets((current) => current.filter((preset) => preset.id !== presetId));
    setActivePresetId(null);
    setPresetName('');
    setPresetError(null);
  } catch (error) {
    setPresetError(error instanceof Error ? error.message : 'Could not delete preset.');
  } finally {
    setPresetDeleting(false);
  }
};

const initialEditorState = defaultMontageSettings;

const editorReducer = (
  state: MontageSettings,
  patch: Partial<MontageSettings>,
): MontageSettings => ({
  ...state,
  ...patch,
  endPage: patch.endPage ?? state.endPage,
});

function MontageHeader({
  totalFrames,
  job,
  exportStarting,
  onBack,
  onExport,
}: {
  totalFrames: number;
  job: RenderJob | null;
  exportStarting: boolean;
  onBack: () => void;
  onExport: () => void;
}) {
  return (
    <Stack
      component="header"
      direction={{ xs: 'column', sm: 'row' }}
      sx={{
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: 2,
        px: { xs: 2, sm: 3 },
        py: 1.5,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Button startIcon={<ArrowBackRounded />} onClick={onBack}>
        Back to library
      </Button>
      <Box sx={{ mr: { sm: 'auto' } }}>
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
        onClick={onExport}
        disabled={exportStarting || Boolean(job && ['queued', 'rendering'].includes(job.status))}
      >
        Export 1080p MP4
      </Button>
    </Stack>
  );
}

function MontageSelectionState({
  loading,
  error,
  onBack,
  onExports,
}: {
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onExports: () => void;
}) {
  return (
    <Box sx={{ p: 4 }}>
      {loading ? (
        <Typography>Loading selected clips…</Typography>
      ) : (
        <>
          <Button startIcon={<ArrowBackRounded />} onClick={onBack}>
            Back to library
          </Button>
          <Button onClick={onExports}>Generated videos</Button>
          <Typography sx={{ mt: 2 }} color={error ? 'error.main' : undefined}>
            {error ?? 'Choose at least two available clips to create a montage.'}
          </Typography>
        </>
      )}
    </Box>
  );
}

// fallow-ignore-next-line complexity -- polling must atomically coordinate in-flight requests, stale IDs, retries, and persisted job state.
function useActiveRenderJob(setExportError: Dispatch<SetStateAction<string | null>>) {
  const [job, setJob] = useState<RenderJob | null>(() => {
    const id = window.sessionStorage.getItem(activeRenderJobStorageKey);
    return id ? { id, status: 'rendering', progress: 0, stage: 'Reconnecting to export…' } : null;
  });
  const statusFailureCount = useRef(0);
  const currentJobId = useRef<string | null>(job?.id ?? null);
  const pollInFlight = useRef(false);
  const jobId = job?.id;
  const jobStatus = job?.status;

  useEffect(() => {
    currentJobId.current = jobId ?? null;
    statusFailureCount.current = 0;
  }, [jobId]);

  useEffect(() => {
    if (!jobId || !jobStatus || !['queued', 'rendering'].includes(jobStatus)) return;
    const poll = () => {
      if (pollInFlight.current) return;
      pollInFlight.current = true;
      void fetchRenderJob(jobId)
        .then((nextJob) => {
          if (currentJobId.current !== jobId) return;
          statusFailureCount.current = 0;
          setExportError(null);
          setJob((current) => (current?.id === jobId ? nextJob : current));
          if (nextJob.status === 'completed')
            window.dispatchEvent(new Event('montage-export-completed'));
        })
        .catch((error: unknown) => {
          if (currentJobId.current !== jobId) return;
          const message = error instanceof Error ? error.message : 'Export status is unavailable.';
          if (isMissingRenderJob(error)) {
            setJob((current) =>
              current?.id === jobId ? { ...current, status: 'failed', error: message } : current,
            );
            return;
          }
          statusFailureCount.current += 1;
          setExportError(
            `Could not refresh export progress (attempt ${statusFailureCount.current}); retrying.`,
          );
        })
        .finally(() => {
          pollInFlight.current = false;
        });
    };
    poll();
    const timer = window.setInterval(poll, 900);
    return () => window.clearInterval(timer);
  }, [jobId, jobStatus, setExportError]);

  useEffect(() => {
    if (!job) return;
    if (['queued', 'rendering'].includes(job.status)) {
      window.sessionStorage.setItem(activeRenderJobStorageKey, job.id);
    } else {
      window.sessionStorage.removeItem(activeRenderJobStorageKey);
    }
  }, [job]);
  return [job, setJob] as const;
}

function MontagePreview({
  playerRef,
  spec,
  previewSpec,
  previewFrames,
  dimensions,
  clips,
  onTimelineChange,
}: {
  playerRef: { current: PlayerRef | null };
  spec: MontageSpec;
  previewSpec: MontageSpec;
  previewFrames: number;
  dimensions: { width: number; height: number };
  clips: MontageSpec['clips'];
  onTimelineChange: (clips: MontageSpec['clips']) => void;
}) {
  return (
    <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <Paper sx={{ p: 1, bgcolor: 'common.black' }}>
        <Player
          ref={playerRef}
          component={MontageComposition}
          inputProps={{ spec: previewSpec }}
          durationInFrames={previewFrames}
          compositionWidth={dimensions.width}
          compositionHeight={dimensions.height}
          fps={montageFps}
          acknowledgeRemotionLicense
          initiallyMuted={false}
          autoPlay={false}
          _experimentalKeepAudioContextAlive
          controls
          style={{ width: '100%', aspectRatio: `${dimensions.width}/${dimensions.height}` }}
        />
        {previewSpec !== spec && (
          <Typography color="warning.main" variant="caption">
            Preview uses cuts because the selected transition is longer than a clip.
          </Typography>
        )}
      </Paper>
      <MontageTimeline
        clips={clips}
        onReorder={onTimelineChange}
        onRemove={(clipId) => onTimelineChange(clips.filter((clip) => clip.id !== clipId))}
      />
    </Box>
  );
}

// fallow-ignore-next-line complexity -- editor settings are intentionally colocated with the shared preview state.
export function MontagePage({
  ids,
  active,
  onBack,
  onReorder,
  onExports,
}: {
  ids: string[];
  active: boolean;
  onBack: () => void;
  onReorder: (ids: string[]) => void;
  onExports: () => void;
}) {
  const [clips, setClips] = useState<MontageSpec['clips']>([]);
  const [editor, dispatchEditor] = useReducer(editorReducer, initialEditorState);
  const [presets, setPresets] = useState<MontagePreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [activePresetId, setActivePresetId] = useState<number | null>(null);
  const [accelerationReason, setAccelerationReason] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportStarting, setExportStarting] = useState(false);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetDeleting, setPresetDeleting] = useState(false);
  const [clipsReady, setClipsReady] = useState(false);
  const [clipsError, setClipsError] = useState<string | null>(null);
  const [presetsReady, setPresetsReady] = useState(false);
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const hasInitializedEditor = useRef(false);
  const presetSelectionVersion = useRef(0);
  const presetUseQueue = useRef<Promise<void> | null>(null);
  const playerRef = useRef<PlayerRef>(null);
  const specRef = useRef<MontageSpec>({ clips: [], ...initialEditorState });
  const clipMembershipKey = useMemo(() => [...ids].sort().join('\u0000'), [ids]);
  const selectedIdsRef = useRef(ids);
  const [job, setJob] = useActiveRenderJob(setExportError);
  useEffect(() => {
    selectedIdsRef.current = ids;
  }, [ids]);
  useEffect(() => {
    let active = true;
    const selectedIds = selectedIdsRef.current;
    setClips([]);
    setClipsReady(false);
    // fallow-ignore-next-line complexity -- initializes title and orientation together from the selected first clip.
    void fetchMontageClips(selectedIds)
      .then((items) => {
        if (!active) return;
        setClips(items);
        setClipsError(null);
        setClipsReady(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setClips([]);
        setClipsError(error instanceof Error ? error.message : 'Could not load selected clips.');
        setClipsReady(true);
      });
    return () => {
      active = false;
    };
  }, [clipMembershipKey]);
  useEffect(() => {
    if (!active) playerRef.current?.pause();
  }, [active]);
  const settings = editor;
  const spec = useMemo<MontageSpec>(() => ({ ...settings, clips }), [clips, settings]);
  useEffect(() => {
    specRef.current = spec;
  }, [spec]);
  const applyPreset = (preset: MontagePreset) => {
    const selectionVersion = ++presetSelectionVersion.current;
    dispatchEditor(settingsFromPreset(preset.settings));
    setActivePresetId(preset.id);
    setPresetName(preset.name);
    return selectionVersion;
  };
  useEffect(() => {
    void fetchMontagePresets()
      .then((items) => {
        setPresets(items);
        setPresetsReady(true);
      })
      .catch((error: unknown) => {
        setPresetsError(error instanceof Error ? error.message : 'Could not load presets.');
        setPresetsReady(true);
      });
  }, []);
  // fallow-ignore-next-line complexity -- initial editor settings must atomically account for both loaded clips and presets.
  useEffect(() => {
    if (hasInitializedEditor.current || !clipsReady || !presetsReady || clips.length < 2) return;
    hasInitializedEditor.current = true;
    const preset = presets[0];
    if (preset) {
      dispatchEditor(settingsFromPreset(preset.settings));
      setActivePresetId(preset.id);
      setPresetName(preset.name);
      return;
    }
    dispatchEditor({
      title: clips[0]?.title ?? '',
      format: clips[0]?.orientation === 'portrait' ? 'portrait' : 'landscape',
    });
  }, [clips, clipsReady, presets, presetsReady]);
  const refreshPresets = async (selectionVersion?: number) => {
    const items = await fetchMontagePresets();
    if (selectionVersion === undefined || selectionVersion === presetSelectionVersion.current)
      setPresets(items);
  };
  // fallow-ignore-next-line complexity -- a preset save coordinates stale-selection protection, local success, and an independently retryable refresh.
  const savePreset = async (presetId?: number) => {
    if (presetSaving) return;
    const selectionVersion = presetSelectionVersion.current;
    setPresetSaving(true);
    try {
      const saved = await saveMontagePreset(presetName, settings, presetId);
      setPresets((current) => {
        const index = current.findIndex((preset) => preset.id === saved.id);
        if (index === -1) return [saved, ...current];
        return current.map((preset) => (preset.id === saved.id ? saved : preset));
      });
      if (presetSelectionVersion.current === selectionVersion) {
        setActivePresetId(saved.id);
        setPresetName(saved.name);
      }
      setPresetError(null);
      try {
        await refreshPresets();
      } catch (error) {
        setPresetError(
          `Preset saved, but could not refresh the list: ${
            error instanceof Error ? error.message : 'please reload the page.'
          }`,
        );
      }
    } catch (error) {
      setPresetError(error instanceof Error ? error.message : 'Could not save preset.');
    } finally {
      setPresetSaving(false);
    }
  };
  const dimensions = dimensionsFor(settings.format);
  const totalFrames = montageDurationInFrames(spec);
  const { previewSpec, previewFrames, timingError } = useMemo(() => previewState(spec), [spec]);
  // fallow-ignore-next-line complexity -- capability handling and render errors must share the same user-visible export state.
  const startExport = async (softwareFallback = false) => {
    setExportStarting(true);
    try {
      setExportError(null);
      if (!softwareFallback) {
        const capability = await fetchMontageCapabilities();
        if (!capability.accelerated) {
          setAccelerationReason(
            capability.reason ?? 'Required hardware acceleration is unavailable.',
          );
          return;
        }
      }
      setJob(await renderMontage(previewableSpec(specRef.current), softwareFallback));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not start the export.');
    } finally {
      setExportStarting(false);
    }
  };
  if (!clipsReady || !presetsReady)
    return <MontageSelectionState loading error={null} onBack={onBack} onExports={onExports} />;
  if (clips.length < 2)
    return (
      <MontageSelectionState
        loading={false}
        error={clipsError}
        onBack={onBack}
        onExports={onExports}
      />
    );
  if (timingError)
    return (
      <MontageSelectionState
        loading={false}
        error={timingError}
        onBack={onBack}
        onExports={onExports}
      />
    );
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <MontageHeader
        totalFrames={totalFrames}
        job={job}
        exportStarting={exportStarting}
        onBack={onBack}
        onExport={() => void startExport()}
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 360px' },
          gap: 3,
          p: { xs: 2, lg: 3 },
        }}
      >
        <MontagePreview
          playerRef={playerRef}
          spec={spec}
          previewSpec={previewSpec}
          previewFrames={previewFrames}
          dimensions={dimensions}
          clips={clips}
          onTimelineChange={(next) => {
            setClips(next);
            onReorder(next.map((clip) => clip.id));
          }}
        />
        <MontageSettingsPanel
          settings={settings}
          presets={presets}
          activePresetId={activePresetId}
          presetName={presetName}
          job={job}
          exportStarting={exportStarting}
          exportError={exportError ?? presetsError}
          presetError={presetError}
          presetSaving={presetSaving || presetDeleting}
          onChange={dispatchEditor}
          onPresetNameChange={(name) => {
            setPresetName(name);
            setPresetError(null);
          }}
          onSelectPreset={(preset) => {
            const selectionVersion = applyPreset(preset);
            presetUseQueue.current = (presetUseQueue.current ?? Promise.resolve())
              .catch(() => undefined)
              .then(async () => {
                await markMontagePresetUsed(preset.id);
                await refreshPresets(selectionVersion);
              })
              .catch((error: unknown) => {
                if (selectionVersion !== presetSelectionVersion.current) return;
                setPresetError(
                  error instanceof Error ? error.message : 'Could not save preset recency.',
                );
                void refreshPresets(selectionVersion);
              });
          }}
          onClearPreset={() => {
            presetSelectionVersion.current += 1;
            setActivePresetId(null);
            setPresetName('');
          }}
          onSavePreset={(presetId) => void savePreset(presetId)}
          onDeletePreset={() => {
            if (!presetDeleting) {
              presetSelectionVersion.current += 1;
              void deletePreset(activePresetId!, {
                setPresets,
                setActivePresetId,
                setPresetName,
                setPresetError,
                setPresetDeleting,
              });
            }
          }}
          onSoftwareFallback={() => void startExport(true)}
        />
      </Box>
      <Dialog
        open={active && Boolean(accelerationReason)}
        onClose={() => setAccelerationReason(null)}
      >
        <DialogTitle>Hardware acceleration unavailable</DialogTitle>
        <DialogContent>
          <Typography>{accelerationReason}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAccelerationReason(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={exportStarting}
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
