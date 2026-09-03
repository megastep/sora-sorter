import { API, type Video } from '../catalog';

export function Card({
  item,
  selected,
  onOpen,
}: {
  item: Video;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      className={`card ${item.orientation === 'landscape' ? 'landscape' : ''} ${selected ? 'selected' : ''}`}
      aria-label={`Open ${item.title} in lightbox`}
      onClick={onOpen}
    >
      <img src={`${API}/videos/${item.id}/poster`} alt={item.title} loading="lazy" />
      <span className="duration">{Math.round(item.duration_seconds || 0)}s</span>
      <strong>{item.title}</strong>
      <small>
        {item.language || 'unknown'} · {item.review_status}
      </small>
    </button>
  );
}
