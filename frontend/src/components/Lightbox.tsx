import { useEffect, useEffectEvent, useRef } from 'react';
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
  const video = useRef<HTMLVideoElement | null>(null);
  const resumePlayback = useRef(false);
  const index = Math.max(
    0,
    items.findIndex((candidate) => candidate.id === item.id),
  );
  const hasNeighbors = items.length > 1;
  const navigate = (value: Video) => {
    resumePlayback.current = Boolean(
      video.current && !video.current.paused && !video.current.ended,
    );
    onSelect(value);
  };
  const selectOffset = (offset: number) => {
    navigate(items[(index + offset + items.length) % items.length]);
  };
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
    if (hasNeighbors && event.key === 'ArrowLeft') {
      navigate(items[(index - 1 + items.length) % items.length]);
    }
    if (hasNeighbors && event.key === 'ArrowRight') {
      navigate(items[(index + 1) % items.length]);
    }
  });

  useEffect(() => {
    if (!resumePlayback.current) return;
    resumePlayback.current = false;
    void video.current?.play().catch(() => {});
  }, [item.id]);

  useEffect(() => {
    const currentDialog = dialog.current;
    currentDialog?.showModal();
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      currentDialog?.close();
    };
  }, [dialog]);

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
        ref={video}
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
