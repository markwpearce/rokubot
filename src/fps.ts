import { checkEcpStatus, numberField } from './ecp/xml';

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

export function parseGraphicsFrameRate(xml: string): FrameRateSample {
  checkEcpStatus(
    xml,
    'query/graphics-frame-rate',
    'it needs Roku OS 12.0+, developer mode and "Control by mobile apps" enabled',
  );
  for (const name of FRAME_RATE_FIELDS) {
    const fps = numberField(xml, name);
    if (fps !== undefined) {
      return { timestamp: numberField(xml, 'timestamp') ?? Date.now(), fps };
    }
  }
  throw new Error(`Couldn't find a frame rate in the query/graphics-frame-rate response: ${xml.trim().slice(0, 300)}`);
}

export function formatFps(value: number): string {
  return value.toFixed(1);
}
