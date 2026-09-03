// fallow-ignore-file unused-file -- bundled by frontend/render.mjs for server rendering.
import { AbsoluteFill, Composition } from 'remotion';
import { registerRoot } from 'remotion';
import { MontageComposition, montageDurationInFrames, montageFps } from './MontageComposition';
import { dimensionsFor, type MontageSpec } from '../montage';

const Root = () => (
  <>
    <Composition
      id="MontageCapabilityProbe"
      component={() => <AbsoluteFill style={{ background: '#000' }} />}
      durationInFrames={1}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="Montage"
      component={MontageComposition}
      durationInFrames={1}
      fps={montageFps}
      width={1920}
      height={1080}
      calculateMetadata={({ props }) => {
        const spec = props.spec as MontageSpec;
        const dimensions = dimensionsFor(spec.format);
        return {
          width: dimensions.width,
          height: dimensions.height,
          durationInFrames: montageDurationInFrames(spec),
          props,
        };
      }}
      defaultProps={{
        spec: {
          clips: [],
          format: 'landscape',
          fillMismatchedOrientation: true,
          title: '',
          titleSubtitle: '',
          titleFontSize: 88,
          titleSubtitleFontSize: 36,
          titleDuration: 3,
          transition: 'cut',
          transitionDuration: 0,
          cutColor: '#000000',
          endPage: {
            enabled: false,
            title: '',
            subtitle: '',
            fontSize: 72,
            subtitleFontSize: 30,
            duration: 3,
          },
        },
      }}
    />
  </>
);
registerRoot(Root);
