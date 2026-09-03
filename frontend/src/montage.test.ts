import { describe, expect, it } from 'vitest';
import { addToSelection, dimensionsFor, toggleSelection, type MontageSpec } from './montage';
import { montageDurationInFrames } from './remotion/MontageComposition';

describe('ordered montage selection', () => {
  it('appends only missing IDs in the server-provided order', () => {
    expect(addToSelection(['clip-b'], ['clip-a', 'clip-b', 'clip-c'])).toEqual([
      'clip-b',
      'clip-a',
      'clip-c',
    ]);
  });

  it('removes a selected clip so later cards are naturally renumbered', () => {
    expect(toggleSelection(['clip-a', 'clip-b', 'clip-c'], 'clip-b')).toEqual(['clip-a', 'clip-c']);
  });

  it('uses the fixed 1080p output dimensions', () => {
    expect(dimensionsFor('landscape')).toEqual({ width: 1920, height: 1080 });
    expect(dimensionsFor('portrait')).toEqual({ width: 1080, height: 1920 });
  });

  it('accounts for the intro, non-cut overlap, and optional end page', () => {
    const spec: MontageSpec = {
      clips: [
        {
          id: 'clip-a',
          title: 'A',
          duration_seconds: 2,
          width: 1920,
          height: 1080,
          orientation: 'landscape',
          media_url: '/a',
          poster_url: '/a.jpg',
        },
        {
          id: 'clip-b',
          title: 'B',
          duration_seconds: 4,
          width: 1920,
          height: 1080,
          orientation: 'landscape',
          media_url: '/b',
          poster_url: '/b.jpg',
        },
      ],
      format: 'landscape' as const,
      fillMismatchedOrientation: true,
      title: 'A title',
      titleSubtitle: '',
      titleFontSize: 88,
      titleSubtitleFontSize: 36,
      titleDuration: 3,
      transition: 'crossfade' as const,
      transitionDuration: 0.5,
      cutColor: '#000000',
      endPage: {
        enabled: true,
        title: 'End',
        subtitle: '',
        fontSize: 72,
        subtitleFontSize: 30,
        duration: 3,
      },
    };

    expect(montageDurationInFrames(spec)).toBe(315);
    expect(montageDurationInFrames({ ...spec, transition: 'cut', transitionDuration: 0 })).toBe(
      330,
    );
    expect(montageDurationInFrames({ ...spec, transition: 'cut', transitionDuration: 0.5 })).toBe(
      345,
    );
  });
});
