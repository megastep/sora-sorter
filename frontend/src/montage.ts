export type OutputFormat = 'landscape' | 'portrait';
export type TransitionType = 'cut' | 'crossfade' | 'slide' | 'wipe';

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
  titleDuration: number;
  transition: TransitionType;
  transitionDuration: number;
  cutColor: string;
  endPage: {
    enabled: boolean;
    title: string;
    subtitle: string;
    fontSize: number;
    subtitleFontSize: number;
    duration: number;
  };
};

export type MontageSettings = Omit<MontageSpec, 'clips'>;

export const dimensionsFor = (format: OutputFormat) =>
  format === 'landscape' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };

export const selectionStorageKey = 'video-catalog-montage-selection';

export const addToSelection = (selection: string[], ids: string[]) => {
  const selected = new Set(selection);
  return [...selection, ...ids.filter((id) => !selected.has(id))];
};

export const toggleSelection = (selection: string[], id: string) =>
  selection.includes(id) ? selection.filter((value) => value !== id) : [...selection, id];
