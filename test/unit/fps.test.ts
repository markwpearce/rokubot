import { describe, it, expect } from 'vitest';
import { parseGraphicsFrameRate } from '../../src/fps';
import { checkFpsAssertions } from '../../src/commands/fps';
import { summarize } from '../../src/sampling';

describe('parseGraphicsFrameRate', () => {
  it.each([
    // The shape a Roku Ultra on OS 15.3.4 answers with.
    ['<graphics-frame-rate>\n\t<fps>59.894665</fps>\n\t<timestamp>1794091737447</timestamp>\n\t<status>OK</status>\n</graphics-frame-rate>', 59.894665],
    ['<graphics-frame-rate>30</graphics-frame-rate>', 30],
    ['<graphics-frame-rate><frame-rate>24</frame-rate></graphics-frame-rate>', 24],
    ['<response fps="60"/>', 60],
  ])('finds the rate in %s', (xml, fps) => {
    expect(parseGraphicsFrameRate(xml).fps).toBe(fps);
  });

  it('throws when there is no rate, quoting the response', () => {
    expect(() => parseGraphicsFrameRate('<graphics-frame-rate><status>OK</status></graphics-frame-rate>')).toThrow(
      /Couldn't find a frame rate.*graphics-frame-rate/,
    );
  });

  it('throws on a non-OK status', () => {
    expect(() => parseGraphicsFrameRate('<x><status>FAILED</status></x>')).toThrow(/status FAILED/);
  });
});

describe('checkFpsAssertions', () => {
  it('fails fps on the average and on the 5th percentile', () => {
    const summary = summarize([20, 60, 60, 60]);
    expect(checkFpsAssertions(summary, 55, 30)).toEqual(['Average 50.0 fps is under --assert-min 55', '5th percentile 20.0 fps is under --assert-min-p5 30']);
    expect(checkFpsAssertions(summary, 50, 20)).toEqual([]);
  });
});
