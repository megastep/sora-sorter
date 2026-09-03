import { describe, expect, it } from 'vitest';
import { newReference, toDraft, type Video } from './catalog';

const video: Video = {
  id: 'video-1',
  title: 'Garden walk',
  summary: '',
  transcript: '',
  language: 'en',
  orientation: 'landscape',
  duration_seconds: 12,
  keywords: ['garden'],
  visible_text: [],
  content_flags: [],
  likeness_references: [{ name: 'Example', confidence: 'likely', basis: 'Visual similarity' }],
  review_status: 'unreviewed',
  rating: null,
  favorite: false,
  publishable: false,
  notes: '',
};

describe('toDraft', () => {
  it('normalizes a server reference and gives it a stable editor key', () => {
    const draft = toDraft({
      ...video,
      likeness_references: [
        '{"name":"Example","confidence":"likely","basis":"Visual similarity"}',
      ] as unknown as Video['likeness_references'],
    });

    expect(draft.likeness_references).toMatchObject([
      { name: 'Example', confidence: 'likely', basis: 'Visual similarity' },
    ]);
    expect(draft.likeness_references[0].editorId).toMatch(/^reference-\d+$/);
  });

  it('creates an empty possible reference ready for editing', () => {
    expect(newReference()).toMatchObject({ name: '', confidence: 'possible', basis: '' });
  });
});
