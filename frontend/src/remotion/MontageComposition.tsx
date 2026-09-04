import {
  AbsoluteFill,
  Audio,
  Freeze,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { Video } from '@remotion/media';
import { Fragment } from 'react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { type MontageSpec } from '../montage';

const fps = 30;
const frames = (seconds: number) => Math.max(1, Math.round(seconds * fps));
const optionalFrames = (seconds: number) => Math.max(0, Math.round(seconds * fps));
const pageTransitionFrames = frames(0.5);
const endBlurFrames = frames(1);
const pageDurationFrames = frames(3);
const filmSprockets = {
  background:
    'repeating-linear-gradient(90deg, #f4d77d 0 15px, #17130c 15px 29px, #f4d77d 29px 44px)',
  height: '11%',
};
const isCutTransition = (transition: MontageSpec['transition']) =>
  transition === 'cut' || transition === 'film-cut';
const filmVariation = (seed: number) => Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;

function FilmCut({
  color,
  seed,
  src,
  freezeFrame,
}: {
  color: string;
  seed: number;
  src: string;
  freezeFrame: number;
}) {
  const frame = useCurrentFrame();
  const flashFrames = 2 + Math.round(filmVariation(seed) * 3);
  const flashOpacity = interpolate(
    frame,
    [0, 1, flashFrames],
    [1, 0.2 + filmVariation(seed + 1) * 0.4, 0],
    {
      extrapolateRight: 'clamp',
    },
  );
  const scratchPosition = `${(frame * (11 + filmVariation(seed + 2) * 18) + filmVariation(seed + 3) * 100) % 100}%`;
  const sprocketOffset = Math.round(filmVariation(seed + 4) * 28);
  const grainOffset = `${Math.round((frame * 23 + filmVariation(seed + 7) * 100) % 100)}px ${Math.round((frame * 41 + filmVariation(seed + 8) * 100) % 100)}px`;
  return (
    <AbsoluteFill
      style={{
        background: color,
        border: '10px solid #f4d77d',
        boxShadow: 'inset 0 0 0 14px #17130c',
        color: '#f4d77d',
        filter: `hue-rotate(${Math.round(filmVariation(seed + 5) * 36 - 18)}deg)`,
        fontFamily: 'ui-monospace, monospace',
        fontWeight: 800,
      }}
    >
      <Freeze frame={freezeFrame}>
        <Video
          src={src}
          muted
          style={{
            filter: `blur(${8 + filmVariation(seed + 9) * 8}px) brightness(.32) saturate(.55)`,
            height: '100%',
            inset: 0,
            objectFit: 'cover',
            opacity: 0.65,
            position: 'absolute',
            transform: 'scale(1.12)',
            width: '100%',
          }}
        />
      </Freeze>
      <AbsoluteFill
        style={{
          backgroundImage:
            'repeating-radial-gradient(circle, rgba(255,255,255,.36) 0 1px, transparent 1px 3px)',
          backgroundPosition: grainOffset,
          mixBlendMode: 'screen',
          opacity: 0.24,
        }}
      />
      <div style={{ ...filmSprockets, backgroundPosition: `${sprocketOffset}px 0` }} />
      <div style={{ flex: 1 }} />
      <div
        style={{
          background: 'rgba(244, 215, 125, .7)',
          height: '100%',
          left: scratchPosition,
          position: 'absolute',
          top: 0,
          width: 2 + Math.round(filmVariation(seed + 6) * 3),
        }}
      />
      <div
        style={{
          ...filmSprockets,
          backgroundPosition: `${-sprocketOffset}px 0`,
          marginTop: 'auto',
        }}
      />
      <AbsoluteFill style={{ background: '#fff6ce', opacity: flashOpacity }} />
    </AbsoluteFill>
  );
}

function FittedVideo({
  src,
  muted = false,
  showBackdrop = false,
  showForeground = true,
  backdropBlur = 28,
  foregroundOpacity = 1,
}: {
  src: string;
  muted?: boolean;
  showBackdrop?: boolean;
  showForeground?: boolean;
  backdropBlur?: number;
  foregroundOpacity?: number;
}) {
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      {showBackdrop && (
        <Video
          src={src}
          muted
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: `blur(${backdropBlur}px) brightness(.42)`,
            transform: 'scale(1.08)',
          }}
        />
      )}
      {showForeground && (
        <Video
          src={src}
          muted={muted}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: foregroundOpacity,
          }}
        />
      )}
    </AbsoluteFill>
  );
}

function TimedFittedVideo({
  src,
  durationInFrames,
  audioFadeInFrames = 0,
  audioFadeOutFrames = 0,
  showBackdrop,
}: {
  src: string;
  durationInFrames: number;
  audioFadeInFrames?: number;
  audioFadeOutFrames?: number;
  showBackdrop: boolean;
}) {
  const frame = useCurrentFrame();
  const fadeIn = audioFadeInFrames
    ? interpolate(frame, [0, audioFadeInFrames], [0, 1], { extrapolateRight: 'clamp' })
    : 1;
  const fadeOut =
    audioFadeOutFrames && durationInFrames
      ? interpolate(frame, [durationInFrames - audioFadeOutFrames, durationInFrames], [1, 0], {
          extrapolateLeft: 'clamp',
        })
      : 1;
  return (
    <>
      <FittedVideo src={src} muted showBackdrop={showBackdrop} />
      <Audio src={src} volume={fadeIn * fadeOut} useWebAudioApi={false} />
    </>
  );
}

// fallow-ignore-next-line complexity -- shared animated title/end-card component keeps timing identical for preview and export.
function TitleCard({
  src,
  title,
  subtitle,
  fontSize,
  subtitleFontSize,
  freezeFrame,
  durationInFrames,
  reveal,
  zoom,
  blurIn,
  fade,
}: {
  src: string;
  title: string;
  subtitle: string;
  fontSize: number;
  subtitleFontSize: number;
  freezeFrame: number;
  durationInFrames: number;
  reveal: boolean;
  zoom: boolean;
  blurIn: boolean;
  fade: 'in' | 'out';
}) {
  const frame = useCurrentFrame();
  const revealFrames = Math.min(Math.round(fps * 0.6), durationInFrames);
  const revealProgress = reveal
    ? interpolate(frame, [durationInFrames - revealFrames, durationInFrames], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;
  const titleScale = zoom
    ? interpolate(frame, [0, durationInFrames], [1, 1.08], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;
  const cardOpacity =
    fade === 'out'
      ? interpolate(frame, [durationInFrames - pageTransitionFrames, durationInFrames], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : interpolate(frame, [0, pageTransitionFrames], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
  const blurProgress = blurIn
    ? interpolate(frame, [0, endBlurFrames], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;
  return (
    <AbsoluteFill
      style={{
        color: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '8%',
        fontFamily: 'system-ui, sans-serif',
        fontSize,
        fontWeight: 800,
        textShadow: '0 3px 20px #000',
        opacity: cardOpacity,
      }}
    >
      <Freeze frame={freezeFrame}>
        <FittedVideo
          src={src}
          muted
          showBackdrop
          showForeground={reveal || blurIn}
          backdropBlur={blurIn ? 28 * blurProgress : 28 * (1 - revealProgress)}
          foregroundOpacity={reveal ? revealProgress : blurIn ? 1 - blurProgress : 1}
        />
      </Freeze>
      <div style={{ zIndex: 1, transform: `scale(${titleScale})` }}>
        <div>{title}</div>
        {subtitle && (
          <div style={{ marginTop: fontSize * 0.24, fontSize: subtitleFontSize, fontWeight: 500 }}>
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

export function montageDurationInFrames(spec: MontageSpec) {
  const clipFrames = spec.clips.reduce((sum, clip) => sum + frames(clip.duration_seconds), 0);
  const overlaps = isCutTransition(spec.transition)
    ? Math.max(0, spec.clips.length - 1) * optionalFrames(spec.transitionDuration)
    : Math.max(0, spec.clips.length - 1) * frames(spec.transitionDuration);
  return (
    (spec.title ? pageDurationFrames : 0) +
    clipFrames +
    (isCutTransition(spec.transition) ? overlaps : -overlaps) +
    (spec.endPage.enabled ? pageDurationFrames : 0) -
    (spec.title ? pageTransitionFrames : 0) -
    (spec.endPage.enabled ? pageTransitionFrames : 0)
  );
}

export function MontageComposition({ spec }: { spec: MontageSpec }) {
  const { width, height } = useVideoConfig();
  const transitionFrames = frames(spec.transitionDuration);
  const cutFrames = optionalFrames(spec.transitionDuration);
  const outputPortrait = height > width;
  // Remotion presentations have distinct generic props, but all are valid TransitionSeries inputs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presentation: any =
    spec.transition === 'slide' ? slide() : spec.transition === 'wipe' ? wipe() : fade();
  return (
    <AbsoluteFill style={{ width, height, background: '#000' }}>
      <Sequence from={spec.title ? pageDurationFrames - pageTransitionFrames : 0}>
        <TransitionSeries>
          {/* fallow-ignore-next-line complexity -- clip rendering keeps transition and complementary audio timing in one sequence. */}
          {spec.clips.map((clip, index) => (
            <Fragment key={clip.id}>
              <TransitionSeries.Sequence durationInFrames={frames(clip.duration_seconds)}>
                <TimedFittedVideo
                  src={clip.media_url}
                  durationInFrames={frames(clip.duration_seconds)}
                  audioFadeInFrames={
                    !isCutTransition(spec.transition) && index > 0 ? transitionFrames : 0
                  }
                  audioFadeOutFrames={
                    !isCutTransition(spec.transition) && index < spec.clips.length - 1
                      ? transitionFrames
                      : 0
                  }
                  showBackdrop={
                    spec.fillMismatchedOrientation &&
                    (clip.width && clip.height
                      ? clip.width === clip.height || clip.height > clip.width !== outputPortrait
                      : (clip.orientation === 'portrait') !== outputPortrait)
                  }
                />
              </TransitionSeries.Sequence>
              {index < spec.clips.length - 1 &&
                (isCutTransition(spec.transition) ? (
                  cutFrames > 0 ? (
                    <TransitionSeries.Sequence durationInFrames={cutFrames}>
                      {spec.transition === 'film-cut' ? (
                        <FilmCut
                          color={spec.cutColor}
                          seed={index + 1}
                          src={clip.media_url}
                          freezeFrame={Math.max(0, frames(clip.duration_seconds) - 1)}
                        />
                      ) : (
                        <AbsoluteFill style={{ background: spec.cutColor }} />
                      )}
                    </TransitionSeries.Sequence>
                  ) : null
                ) : (
                  <TransitionSeries.Transition
                    presentation={presentation}
                    timing={linearTiming({ durationInFrames: transitionFrames })}
                  />
                ))}
            </Fragment>
          ))}
        </TransitionSeries>
      </Sequence>
      {spec.title && (
        <Sequence durationInFrames={pageDurationFrames}>
          <TitleCard
            src={spec.clips[0].media_url}
            title={spec.title}
            subtitle={spec.titleSubtitle}
            fontSize={spec.titleFontSize}
            subtitleFontSize={spec.titleSubtitleFontSize}
            freezeFrame={0}
            durationInFrames={pageDurationFrames}
            reveal
            zoom
            blurIn={false}
            fade="out"
          />
        </Sequence>
      )}
      {spec.endPage.enabled && (
        <Sequence
          from={
            montageDurationInFrames({ ...spec, endPage: { ...spec.endPage, enabled: false } }) -
            pageTransitionFrames
          }
          durationInFrames={pageDurationFrames}
        >
          <TitleCard
            src={spec.clips.at(-1)!.media_url}
            title={spec.endPage.title}
            subtitle={spec.endPage.subtitle}
            fontSize={spec.endPage.fontSize}
            subtitleFontSize={spec.endPage.subtitleFontSize}
            freezeFrame={Math.max(0, frames(spec.clips.at(-1)!.duration_seconds) - 1)}
            durationInFrames={pageDurationFrames}
            reveal={false}
            zoom
            blurIn
            fade="in"
          />
        </Sequence>
      )}
    </AbsoluteFill>
  );
}

export const montageFps = fps;
