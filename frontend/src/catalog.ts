export const API = '/api';

export type ReviewStatus = 'unreviewed' | 'shortlisted' | 'approved' | 'rejected';
export type Filters = Record<string, string>;
export type LikenessReference = {
  name: string;
  confidence: 'possible' | 'likely';
  basis: string;
};
export type Video = {
  id: string;
  title: string;
  summary: string;
  transcript: string;
  language: string;
  orientation: string;
  duration_seconds: number;
  keywords: string[];
  visible_text: string[];
  content_flags: string[];
  likeness_references: LikenessReference[];
  review_status: ReviewStatus;
  rating: number | null;
  favorite: boolean;
  publishable: boolean;
  notes: string;
};
export type ReferenceDraft = LikenessReference & { editorId: string };
export type Draft = Omit<Video, 'likeness_references'> & {
  likeness_references: ReferenceDraft[];
};

let referenceId = 0;

const nextReferenceId = () => `reference-${referenceId++}`;
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);
const referenceObject = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'string') {
    try {
      return referenceObject(JSON.parse(value));
    } catch {
      return { basis: value };
    }
  }
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
};

export const toDraft = (item: Video): Draft => ({
  ...item,
  keywords: strings(item.keywords),
  visible_text: strings(item.visible_text),
  content_flags: strings(item.content_flags),
  likeness_references: Array.isArray(item.likeness_references)
    ? item.likeness_references
        .map(referenceObject)
        .filter((reference): reference is Record<string, unknown> => reference !== null)
        .map((reference) => ({
          editorId: nextReferenceId(),
          name: String(reference.name ?? ''),
          confidence: reference.confidence === 'likely' ? 'likely' : 'possible',
          basis: String(reference.basis ?? ''),
        }))
    : [],
});

export const newReference = (): ReferenceDraft => ({
  editorId: nextReferenceId(),
  name: '',
  confidence: 'possible',
  basis: '',
});
