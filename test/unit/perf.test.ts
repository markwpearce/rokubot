import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseChanperf } from '../../src/perf';
import { checkPerfAssertions, summarizePerf } from '../../src/commands/perf';
import { summarize } from '../../src/sampling';

const chanperfXml = fs.readFileSync(path.join(__dirname, '../fixtures/chanperf.xml'), 'utf8');

describe('parseChanperf', () => {
  it('reads cpu, memory, the app id and proc-stat', () => {
    const sample = parseChanperf(chanperfXml);
    expect(sample.timestamp).toBe(1794091777214);
    expect(sample.appId).toBe('dev');
    // OS 15.3 doesn't report a pid for a sideloaded app.
    expect(sample.pid).toBeUndefined();
    expect(sample.cpu).toMatchObject({ user: 25.1, sys: 0.1, durationSeconds: 2 });
    expect(sample.cpu.total).toBeCloseTo(25.2);
    expect(sample.memory).toEqual({
      used: 23183360,
      res: 23183360,
      anon: 7643136,
      swap: 0,
      file: 15286272,
      shared: 253952,
      limit: 859832320,
    });
    expect(sample.procStat).toMatchObject({ utime: '1194', stime: '37', state: 'S', 'clk-tck': '100' });
    expect(Object.keys(sample.procStat ?? {})).toHaveLength(11);
  });

  it('reads a pid from <unsecured>', () => {
    const sample = parseChanperf(
      '<chanperf><plugin><memory><used>1</used></memory><unsecured><process-id>4321</process-id></unsecured></plugin><status>OK</status></chanperf>',
    );
    expect(sample.pid).toBe(4321);
  });

  it('accepts values as attributes and leaves out what is missing', () => {
    const sample = parseChanperf(
      '<chanperf><plugin><cpu-percent user="1" sys="2"/><memory used="1000"/></plugin><status>OK</status></chanperf>',
    );
    expect(sample.cpu.total).toBe(3);
    expect(sample.memory).toMatchObject({ used: 1000, res: undefined, limit: undefined });
    expect(sample.pid).toBeUndefined();
    expect(sample.procStat).toBeUndefined();
  });

  it('throws on a non-OK status, with the device error', () => {
    // What the device answers from the Home screen.
    expect(() => parseChanperf('<chanperf><status>FAILED</status><error>Channel not running: active UI</error></chanperf>')).toThrow(
      /status FAILED \(Channel not running: active UI\)/,
    );
  });

  it('throws on something that is not a chanperf response', () => {
    expect(() => parseChanperf('<other/>')).toThrow(/no <chanperf> element/);
  });
});

describe('summarize', () => {
  it('returns min/max/avg and nearest-rank percentiles', () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(summarize(values)).toEqual({ count: 20, min: 1, max: 20, avg: 10.5, p5: 1, p95: 19 });
  });

  it('returns undefined with nothing to summarize', () => {
    expect(summarize([])).toBeUndefined();
  });
});

describe('assertions', () => {
  const samples = [parseChanperf(chanperfXml)];

  it('fails perf past the memory and cpu peaks', () => {
    const summary = summarizePerf(samples);
    expect(checkPerfAssertions(summary, 20, 10)).toEqual([
      'Memory used 23.2 MB is over --assert-max-mem 20 MB',
      'CPU 25.2% is over --assert-max-cpu 10%',
    ]);
    expect(checkPerfAssertions(summary, 50, 50)).toEqual([]);
  });
});
