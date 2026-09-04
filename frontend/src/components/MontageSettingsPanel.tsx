import { ExpandMoreRounded } from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
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
import { type MontagePreset, type RenderJob } from '../api';
import { type MontageSettings, type OutputFormat, type TransitionType } from '../montage';

type Props = {
  settings: MontageSettings;
  presets: MontagePreset[];
  activePresetId: number | null;
  presetName: string;
  job: RenderJob | null;
  exportStarting: boolean;
  exportError: string | null;
  presetError: string | null;
  presetSaving: boolean;
  onChange: (patch: Partial<MontageSettings>) => void;
  onPresetNameChange: (name: string) => void;
  onSelectPreset: (preset: MontagePreset) => void;
  onClearPreset: () => void;
  onSavePreset: (presetId?: number) => void;
  onDeletePreset: () => void;
  onSoftwareFallback: () => void;
};

// fallow-ignore-next-line complexity -- settings controls share one preview-backed editor state and validation surface.
export function MontageSettingsPanel(props: Props) {
  const {
    settings,
    presets,
    activePresetId,
    presetName,
    job,
    exportStarting,
    exportError,
    presetError,
    presetSaving,
  } = props;
  const minimumTransitionDuration = ['cut', 'film-cut'].includes(settings.transition) ? 0 : 0.1;
  const changeEndPage = (patch: Partial<MontageSettings['endPage']>) =>
    props.onChange({ endPage: { ...settings.endPage, ...patch } });

  return (
    <Paper sx={{ p: 2.5 }}>
      <Stack spacing={2}>
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
                  disabled={presetSaving}
                  onChange={(event) => {
                    if (!event.target.value) {
                      props.onClearPreset();
                      return;
                    }
                    const preset = presets.find((item) => item.id === Number(event.target.value));
                    if (preset) props.onSelectPreset(preset);
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
                onChange={(event) => props.onPresetNameChange(event.target.value)}
                error={Boolean(presetError)}
                helperText={presetError}
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Button
                  variant="outlined"
                  onClick={() => props.onSavePreset()}
                  disabled={!presetName.trim() || presetSaving}
                >
                  Save new
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => activePresetId && props.onSavePreset(activePresetId)}
                  disabled={!activePresetId || !presetName.trim() || presetSaving}
                >
                  Update
                </Button>
              </Box>
              {activePresetId && (
                <Button color="error" disabled={presetSaving} onClick={props.onDeletePreset}>
                  Delete
                </Button>
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>
        <ToggleButtonGroup
          exclusive
          value={settings.format}
          onChange={(_, value: OutputFormat | null) => value && props.onChange({ format: value })}
          fullWidth
        >
          <ToggleButton value="landscape">Landscape 16:9</ToggleButton>
          <ToggleButton value="portrait">Portrait 9:16</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography sx={{ mr: 'auto' }}>Blur-fill mixed orientations</Typography>
          <Switch
            checked={settings.fillMismatchedOrientation}
            onChange={(event) =>
              props.onChange({ fillMismatchedOrientation: event.target.checked })
            }
          />
        </Box>
        <TextField
          label="Title"
          value={settings.title}
          onChange={(event) => props.onChange({ title: event.target.value })}
        />
        <TextField
          label="Title subtext (optional)"
          value={settings.titleSubtitle}
          onChange={(event) => props.onChange({ titleSubtitle: event.target.value })}
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <TextField
            label="Title font size"
            type="number"
            value={settings.titleFontSize}
            slotProps={{ htmlInput: { min: 32, max: 180 } }}
            onChange={(event) => props.onChange({ titleFontSize: Number(event.target.value) })}
          />
          <TextField
            label="Subtext font size"
            type="number"
            value={settings.titleSubtitleFontSize}
            slotProps={{ htmlInput: { min: 16, max: 120 } }}
            onChange={(event) =>
              props.onChange({ titleSubtitleFontSize: Number(event.target.value) })
            }
          />
        </Box>
        <FormControl fullWidth>
          <InputLabel id="transition">Transition</InputLabel>
          <Select
            labelId="transition"
            label="Transition"
            value={settings.transition}
            onChange={(event) => {
              const transition = event.target.value as TransitionType;
              props.onChange({
                transition,
                ...(!['cut', 'film-cut'].includes(transition) && settings.transitionDuration < 0.1
                  ? { transitionDuration: 0.1 }
                  : {}),
              });
            }}
          >
            <MenuItem value="cut">Cut</MenuItem>
            <MenuItem value="film-cut">Film Cut</MenuItem>
            <MenuItem value="crossfade">Crossfade</MenuItem>
            <MenuItem value="slide">Slide</MenuItem>
            <MenuItem value="wipe">Wipe</MenuItem>
          </Select>
        </FormControl>
        <TextField
          label={`${['cut', 'film-cut'].includes(settings.transition) ? 'Cut' : 'Transition'} duration (seconds)`}
          type="number"
          value={settings.transitionDuration}
          slotProps={{ htmlInput: { min: minimumTransitionDuration, max: 2, step: 0.1 } }}
          onChange={(event) => {
            const duration = Number(event.target.value);
            props.onChange({
              transitionDuration: Number.isFinite(duration)
                ? Math.min(2, Math.max(minimumTransitionDuration, duration))
                : minimumTransitionDuration,
            });
          }}
        />
        {['cut', 'film-cut'].includes(settings.transition) && (
          <TextField
            label="Cut frame color"
            type="color"
            value={settings.cutColor}
            onChange={(event) => props.onChange({ cutColor: event.target.value })}
          />
        )}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography sx={{ mr: 'auto' }}>Include end page</Typography>
          <Switch
            checked={settings.endPage.enabled}
            onChange={(event) => changeEndPage({ enabled: event.target.checked })}
          />
        </Box>
        {settings.endPage.enabled && (
          <>
            <TextField
              label="End page text"
              value={settings.endPage.title}
              onChange={(event) => changeEndPage({ title: event.target.value })}
            />
            <TextField
              label="End page subtext (optional)"
              value={settings.endPage.subtitle}
              onChange={(event) => changeEndPage({ subtitle: event.target.value })}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <TextField
                label="Title font size"
                type="number"
                value={settings.endPage.fontSize}
                slotProps={{ htmlInput: { min: 32, max: 180 } }}
                onChange={(event) => changeEndPage({ fontSize: Number(event.target.value) })}
              />
              <TextField
                label="Subtext font size"
                type="number"
                value={settings.endPage.subtitleFontSize}
                slotProps={{ htmlInput: { min: 16, max: 120 } }}
                onChange={(event) =>
                  changeEndPage({ subtitleFontSize: Number(event.target.value) })
                }
              />
            </Box>
          </>
        )}
        {exportError && <Typography color="error.main">{exportError}</Typography>}
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
                  <Button
                    variant="outlined"
                    disabled={exportStarting}
                    onClick={props.onSoftwareFallback}
                  >
                    Export with software fallback
                  </Button>
                )}
              </Stack>
            ) : (
              <Stack spacing={0.75}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography color="text.secondary">{job.stage}</Typography>
                  <Typography color="text.secondary">{Math.round(job.progress * 100)}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={Math.round(job.progress * 100)} />
              </Stack>
            )}
          </Box>
        )}
      </Stack>
    </Paper>
  );
}
