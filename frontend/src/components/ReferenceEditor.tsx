import { newReference, type ReferenceDraft } from '../catalog';

export function ReferenceEditor({
  references,
  onChange,
}: {
  references: ReferenceDraft[];
  onChange: (value: ReferenceDraft[]) => void;
}) {
  const update = (index: number, key: keyof ReferenceDraft, value: string) =>
    onChange(
      references.map((reference, current) =>
        current === index ? { ...reference, [key]: value } : reference,
      ),
    );
  return (
    <div className="references">
      {references.map((reference, index) => (
        <fieldset className="reference" key={reference.editorId}>
          <input
            aria-label="Reference name"
            placeholder="Name or character"
            value={reference.name}
            onChange={(event) => update(index, 'name', event.target.value)}
          />
          <select
            aria-label="Reference confidence"
            value={reference.confidence}
            onChange={(event) => update(index, 'confidence', event.target.value)}
          >
            <option value="possible">Possible</option>
            <option value="likely">Likely</option>
          </select>
          <textarea
            aria-label="Reference evidence"
            placeholder="Why this reference applies"
            value={reference.basis}
            onChange={(event) => update(index, 'basis', event.target.value)}
          />
          <button
            type="button"
            className="remove-reference"
            onClick={() => onChange(references.filter((_, current) => current !== index))}
          >
            Remove
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="add-reference"
        onClick={() => onChange([...references, newReference()])}
      >
        Add reference
      </button>
    </div>
  );
}
