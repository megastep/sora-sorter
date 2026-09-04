export type OutputFormat = 'landscape' | 'portrait';
export type TransitionType = 'cut' | 'film-cut' | 'crossfade' | 'slide' | 'wipe';

export type MontageClip = {
  id: string;
  title: string;
  duration_seconds: number;
  width: number | null;
  height: number | null;
  orientation: string;
  media_url: string;
  poster_url: string;
};

export type MontageSpec = {
  clips: MontageClip[];
  format: OutputFormat;
  fillMismatchedOrientation: boolean;
  title: string;
  titleSubtitle: string;
  titleFontSize: number;
  titleSubtitleFontSize: number;
  transition: TransitionType;
  transitionDuration: number;
  cutColor: string;
  endPage: {
    enabled: boolean;
    title: string;
    subtitle: string;
    fontSize: number;
    subtitleFontSize: number;
  };
};

export type MontageSettings = Omit<MontageSpec, 'clips'>;

export const defaultMontageSettings: MontageSettings = {
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

export const settingsFromPreset = ({
  clips: _legacyClips,
  ...settings
}: MontageSettings & { clips?: unknown }): MontageSettings => {
  void _legacyClips;
  const transitionDuration =
    !['cut', 'film-cut'].includes(settings.transition) && settings.transitionDuration < 0.1
      ? 0.1
      : settings.transitionDuration;
  return {
    ...defaultMontageSettings,
    ...settings,
    transitionDuration,
    fillMismatchedOrientation:
      settings.fillMismatchedOrientation ?? defaultMontageSettings.fillMismatchedOrientation,
    endPage: { ...defaultMontageSettings.endPage, ...settings.endPage },
  };
};

export const dimensionsFor = (format: OutputFormat) =>
  format === 'landscape' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };

export const selectionStorageKey = 'video-catalog-montage-selection';

export const addToSelection = (selection: string[], ids: string[]) => {
  const selected = new Set(selection);
  return [...selection, ...ids.filter((id) => !selected.has(id))];
};

export const toggleSelection = (selection: string[], id: string) =>
  selection.includes(id) ? selection.filter((value) => value !== id) : [...selection, id];
