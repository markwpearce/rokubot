import { describe, it, expect } from 'vitest';
import {
  monitorCsvRow,
  monitorTableRow,
  parseKeyScript,
  renderMonitorHtml,
  summarizeMonitor,
  type MonitorSample,
} from '../../src/monitor';
import { csvLine, sampleLoop, toCsv } from '../../src/sampling';

function sample(elapsed: number, step: string, values: Partial<MonitorSample> = {}): MonitorSample {
  return { elapsed, timestamp: 1_000_000 + elapsed * 1000, step, queryMs: 50, ...values };
}

const samples = [
  sample(0, 'start', { cpuPercent: 5, memoryUsed: 100, textureUsed: 10, textureMax: 100, fps: 60 }),
  sample(1, '1 down', { cpuPercent: 15, memoryUsed: 120, textureUsed: 30, textureMax: 100, fps: 40 }),
  sample(2, '1 down', { cpuPercent: 25, memoryUsed: 110, fps: 50, errors: ['textures: FAILED'] }),
];

describe('summarizeMonitor', () => {
  it('summarizes overall and per step, in the order steps ran', () => {
    const summary = summarizeMonitor(samples, true);
    expect(summary.samples).toBe(3);
    expect(summary.overall.cpuPercent?.avg).toBe(15);
    expect(summary.steps?.map((step) => [step.step, step.samples])).toEqual([
      ['start', 1],
      ['1 down', 2],
    ]);
    expect(summary.steps?.[1]?.memoryUsed?.max).toBe(120);
    // A failed texture query leaves a gap rather than a zero.
    expect(summary.steps?.[1]?.textureUsed?.count).toBe(1);
  });

  it('leaves out steps without a key script', () => {
    expect(summarizeMonitor(samples, false).steps).toBeUndefined();
  });
});

describe('parseKeyScript', () => {
  it('splits quoted and separate keys into steps', () => {
    expect(parseKeyScript(['down down', 'select', 'back,home'])).toEqual(['down', 'down', 'select', 'back', 'home']);
  });
});

describe('output', () => {
  it('shows missing metrics as a dash and counts failures', () => {
    const row = monitorTableRow(samples[2]!);
    expect(row).toContain('25.0%');
    expect(row).toMatch(/\s-\s/);
    expect(row).toContain('(1 failed)');
  });

  it('writes CSV with escaped cells', () => {
    expect(csvLine(['a', 'b', 'c'], { a: 'x,y', b: undefined, c: 'say "hi"' })).toBe('"x,y",,"say ""hi"""');
    expect(toCsv(['step', 'errors'], [monitorCsvRow(samples[2]!)])).toBe('step,errors\n1 down,textures: FAILED\n');
  });

  it('renders a self-contained HTML report with a chart per metric and step markers', () => {
    const html = renderMonitorHtml(samples, summarizeMonitor(samples, true), 'Run <1>');
    expect(html).toContain('<title>Run &lt;1&gt;</title>');
    expect(html.match(/<svg /g)).toHaveLength(4);
    expect(html).toContain('<title>1 down</title>');
    expect(html).not.toContain('<script');
  });
});

describe('sampleLoop', () => {
  it('ticks until the duration is up', async () => {
    const ticks: number[] = [];
    await sampleLoop({ intervalSeconds: 0.02, durationSeconds: 0.07, tick: async (elapsed) => void ticks.push(elapsed) });
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(5);
  });

  it("doesn't fire missed ticks back-to-back after a slow one", async () => {
    const ticks: number[] = [];
    await sampleLoop({
      intervalSeconds: 0.02,
      durationSeconds: 0.12,
      tick: async (elapsed) => {
        ticks.push(elapsed);
        if (ticks.length === 1) {
          await new Promise((resolve) => setTimeout(resolve, 70));
        }
      },
    });
    // Only the tick right after the stall can run immediately; the rest keep their spacing.
    for (let i = 2; i < ticks.length; i++) {
      expect(ticks[i]! - ticks[i - 1]!).toBeGreaterThanOrEqual(0.015);
    }
  });

  it('stops early when the stop promise resolves', async () => {
    let ticks = 0;
    await sampleLoop({
      intervalSeconds: 0.01,
      stop: new Promise((resolve) => setTimeout(resolve, 35)),
      tick: async () => void ticks++,
    });
    expect(ticks).toBeGreaterThanOrEqual(2);
    expect(ticks).toBeLessThanOrEqual(6);
  });
});
