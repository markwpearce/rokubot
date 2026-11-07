import { checkEcpStatus } from './perf';

/** One `query/graphics-frame-rate` reading - rendered graphics frames, not video frames. */
export interface FrameRateSample {
  timestamp: number;
  fps: number;
}

/**
 * Roku doesn't document this response's shape. OS 15.3 answers with `<fps>`; the rest are
 * fallbacks, taking the first of these elements (or attributes) that holds a number.
 */
const FRAME_RATE_FIELDS = ['fps', 'frame-rate', 'graphics-frame-rate', 'framerate', 'rate', 'value'];

function numberFrom(xml: string, name: string): number | undefined {
  const text =
    xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>\\s*([-\\d.]+)\\s*</${name}>`))?.[1] ??
    xml.match(new RegExp(`\\b${name}="([-\\d.]+)"`))?.[1];
  const value = text === undefined ? NaN : Number(text);
  return Number.isFinite(value) ? value : undefined;
}

export function parseGraphicsFrameRate(xml: string): FrameRateSample {
  checkEcpStatus(
    xml,
    'query/graphics-frame-rate',
    'it needs Roku OS 12.0+, developer mode and "Control by mobile apps" enabled',
  );
  for (const name of FRAME_RATE_FIELDS) {
    const fps = numberFrom(xml, name);
    if (fps !== undefined) {
      return { timestamp: numberFrom(xml, 'timestamp') ?? Date.now(), fps };
    }
  }
  throw new Error(`Couldn't find a frame rate in the query/graphics-frame-rate response: ${xml.trim().slice(0, 300)}`);
}
