// fallow-ignore-file unused-file -- executed by FastAPI as the server-side Remotion entry point.
/* global console, process */
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const [requestPath] = process.argv.slice(2);
const isProbe = requestPath === '--probe';
const request = isProbe
  ? { output: process.argv[3], software_fallback: false, spec: undefined }
  : JSON.parse(await readFile(requestPath, 'utf8'));
const serveUrl = await bundle({
  entryPoint: resolve('src/remotion/Root.tsx'),
});
const composition = await selectComposition({
  serveUrl,
  id: isProbe ? 'MontageCapabilityProbe' : 'Montage',
  inputProps: isProbe ? undefined : { spec: request.spec },
  chromiumOptions: { gl: request.software_fallback ? null : 'angle' },
});
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  audioCodec: 'aac',
  outputLocation: request.output,
  inputProps: isProbe ? undefined : { spec: request.spec },
  videoBitrate: '12M',
  hardwareAcceleration: request.software_fallback ? 'disable' : 'required',
  chromiumOptions: { gl: request.software_fallback ? null : 'angle' },
  onProgress: ({ progress, stitchStage }) =>
    console.log(JSON.stringify({ progress, stage: stitchStage ?? 'rendering' })),
});
console.log(JSON.stringify({ completed: true }));
