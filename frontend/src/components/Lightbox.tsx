import { useEffect, useRef } from 'react';
import { API, type Video } from '../catalog';

export function Lightbox({
  items,
  item,
  onClose,
  onSelect,
}: {
  items: Video[];
  item: Video;
  onClose: () => void;
  onSelect: (value: Video) => void;
}) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const index = Math.max(
    0,
    items.findIndex((candidate) => candidate.id === item.id),
  );
  const hasNeighbors = items.length > 1;
  const selectOffset = (offset: number) => {
    onSelect(items[(index + offset + items.length) % items.length]);
  };
  const keyboardState = useRef({ hasNeighbors, index, items, onClose, onSelect });

  useEffect(() => {
    keyboardState.current = { hasNeighbors, index, items, onClose, onSelect };
  }, [hasNeighbors, index, items, onClose, onSelect]);

  useEffect(() => {
    const currentDialog = dialog.current;
    currentDialog?.showModal();
    const handleKeyDown = (event: KeyboardEvent) => {
      const current = keyboardState.current;
      if (event.key === 'Escape') current.onClose();
      if (current.hasNeighbors && event.key === 'ArrowLeft') {
        current.onSelect(
          current.items[(current.index - 1 + current.items.length) % current.items.length],
        );
      }
      if (current.hasNeighbors && event.key === 'ArrowRight') {
        current.onSelect(current.items[(current.index + 1) % current.items.length]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      currentDialog?.close();
    };
  }, [dialog, keyboardState]);

  return (
    <dialog ref={dialog} className="lightbox" aria-label="Video lightbox" onCancel={onClose}>
      <header className="lightbox-header">
        <div>
          <strong>{item.title}</strong>
          <small>
            {index + 1} of {items.length} · {item.language || 'unknown'} · {item.review_status}
          </small>
        </div>
        <button className="lightbox-close" onClick={onClose} autoFocus>
          Close
        </button>
      </header>
      <video
        key={item.id}
        controls
        preload="metadata"
        src={`${API}/videos/${item.id}/media`}
        poster={`${API}/videos/${item.id}/poster`}
      />
      <footer className="lightbox-controls">
        <button disabled={!hasNeighbors} onClick={() => selectOffset(-1)}>
          Previous
        </button>
        <span>Use ← and → to browse</span>
        <button disabled={!hasNeighbors} onClick={() => selectOffset(1)}>
          Next
        </button>
      </footer>
    </dialog>
  );
}
