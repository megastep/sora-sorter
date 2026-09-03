import { useState } from 'react';
import { API, toDraft, type Draft, type ReviewStatus, type Video } from '../catalog';
import { ReferenceEditor } from './ReferenceEditor';

export function Inspector({ item, onSaved }: { item: Video; onSaved: (value: Video) => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const lines = (key: 'keywords' | 'visible_text' | 'content_flags') => (
    <textarea
      value={draft[key].join('\n')}
      onChange={(event) =>
        set(
          key,
          event.target.value.split('\n').map((value) => value.trim()),
        )
      }
    />
  );
  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API}/videos/${draft.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          keywords: draft.keywords.filter(Boolean),
          visible_text: draft.visible_text.filter(Boolean),
          content_flags: draft.content_flags.filter(Boolean),
          likeness_references: draft.likeness_references.map((reference) => ({
            name: reference.name,
            confidence: reference.confidence,
            basis: reference.basis,
          })),
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      onSaved((await response.json()) as Video);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="inspector">
      <video
        controls
        src={`${API}/videos/${draft.id}/media`}
        poster={`${API}/videos/${draft.id}/poster`}
      />
      <label>
        Title
        <input value={draft.title} onChange={(event) => set('title', event.target.value)} />
      </label>
      <label>Keywords{lines('keywords')}</label>
      <label>
        Language
        <input
          value={draft.language ?? ''}
          onChange={(event) => set('language', event.target.value)}
        />
      </label>
      <label>
        Summary
        <textarea value={draft.summary} onChange={(event) => set('summary', event.target.value)} />
      </label>
      <details>
        <summary>Transcript</summary>
        <textarea
          aria-label="Transcript"
          value={draft.transcript}
          onChange={(event) => set('transcript', event.target.value)}
        />
      </details>
      <details>
        <summary>Visible text</summary>
        {lines('visible_text')}
      </details>
      <details>
        <summary>Content flags</summary>
        {lines('content_flags')}
      </details>
      <details>
        <summary>Likeness / reference evidence</summary>
        <ReferenceEditor
          references={draft.likeness_references}
          onChange={(value) => set('likeness_references', value)}
        />
      </details>
      <label>
        Review status
        <select
          value={draft.review_status}
          onChange={(event) => set('review_status', event.target.value as ReviewStatus)}
        >
          {(['unreviewed', 'shortlisted', 'approved', 'rejected'] as const).map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        Rating
        <select
          value={draft.rating ?? ''}
          onChange={(event) =>
            set('rating', event.target.value ? Number(event.target.value) : null)
          }
        >
          <option value="">None</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={draft.favorite}
          onChange={(event) => set('favorite', event.target.checked)}
        />{' '}
        Favorite
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={draft.publishable}
          onChange={(event) => set('publishable', event.target.checked)}
        />{' '}
        Publishable
      </label>
      <label>
        Notes
        <textarea value={draft.notes} onChange={(event) => set('notes', event.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="save" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
      </button>
    </section>
  );
}
