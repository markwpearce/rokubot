import type { CommandModule } from 'yargs';
import { EcpClient } from '../ecp/client';
import { resolveConfig } from '../config';
import { printResult, printError } from '../output';
import type { GlobalArgs } from '../cli-types';
import { formatBytes } from '../textures';
import type { ChanperfSample } from '../perf';
import { collectSamples, round, summarize, validateSampling, writeSamplesFile, type Summary } from '../sampling';

interface PerfArgs extends GlobalArgs {
  appId?: string;
  cpuWindow?: number;
  watch: boolean;
  duration?: number;
  interval: number;
  out?: string;
  assertMaxMem?: number;
  assertMaxCpu?: number;
}

export interface PerfSummary {
  cpuPercent?: Summary;
  memoryUsed?: Summary;
}

interface PerfResult {
  sample?: ChanperfSample;
  samples?: ChanperfSample[];
  summary?: PerfSummary;
  errors?: string[];
  savedTo?: string;
  failures: string[];
}

const MB = 1_000_000;
const CSV_COLUMNS = ['timestamp', 'appId', 'pid', 'cpuUser', 'cpuSys', 'cpuTotal', 'memUsed', 'memRes', 'memAnon', 'memSwap', 'memFile', 'memShared', 'memLimit'];

function csvRow(sample: ChanperfSample) {
  return {
    timestamp: sample.timestamp,
    appId: sample.appId,
    pid: sample.pid,
    cpuUser: sample.cpu.user,
    cpuSys: sample.cpu.sys,
    cpuTotal: round(sample.cpu.total, 2),
    memUsed: sample.memory.used,
    memRes: sample.memory.res,
    memAnon: sample.memory.anon,
    memSwap: sample.memory.swap,
    memFile: sample.memory.file,
    memShared: sample.memory.shared,
    memLimit: sample.memory.limit,
  };
}

export function summarizePerf(samples: ChanperfSample[]): PerfSummary {
  return {
    cpuPercent: summarize(samples.map((sample) => sample.cpu.total)),
    memoryUsed: summarize(samples.map((sample) => sample.memory.used)),
  };
}

/** Asserts are checked against the peak, so one bad sample in a run is enough to fail it. */
export function checkPerfAssertions(summary: PerfSummary, assertMaxMemMb?: number, assertMaxCpu?: number): string[] {
  const failures: string[] = [];
  if (assertMaxMemMb !== undefined && summary.memoryUsed && summary.memoryUsed.max > assertMaxMemMb * MB) {
    failures.push(`Memory used ${formatBytes(summary.memoryUsed.max)} is over --assert-max-mem ${assertMaxMemMb} MB`);
  }
  if (assertMaxCpu !== undefined && summary.cpuPercent && summary.cpuPercent.max > assertMaxCpu) {
    failures.push(`CPU ${summary.cpuPercent.max.toFixed(1)}% is over --assert-max-cpu ${assertMaxCpu}%`);
  }
  return failures;
}

function sampleLine(sample: ChanperfSample): string {
  return `cpu ${sample.cpu.total.toFixed(1).padStart(5)}%  mem ${formatBytes(sample.memory.used).padStart(9)}`;
}

function renderSample(sample: ChanperfSample): string {
  const app = sample.appId ? `${sample.appId}${sample.pid !== undefined ? ` (pid ${sample.pid})` : ''}` : 'foreground app';
  const window = sample.cpu.durationSeconds !== undefined ? ` over ${sample.cpu.durationSeconds}s` : '';
  const memoryParts = (['res', 'anon', 'file', 'shared', 'swap'] as const)
    .filter((key) => sample.memory[key] !== undefined)
    .map((key) => `${key} ${formatBytes(sample.memory[key]!)}`);
  const { limit: memoryLimit } = sample.memory;
  const limit = memoryLimit
    ? ` of ${formatBytes(memoryLimit)} limit (${((sample.memory.used / memoryLimit) * 100).toFixed(1)}%)`
    : '';
  return [
    `App: ${app}`,
    `CPU: ${sample.cpu.total.toFixed(1)}%${window} (user ${sample.cpu.user}%, sys ${sample.cpu.sys}%)`,
    `Memory: ${formatBytes(sample.memory.used)} used${limit}${memoryParts.length ? ` (${memoryParts.join(', ')})` : ''}`,
  ].join('\n');
}

export function summaryLine(label: string, summary: Summary | undefined, format: (value: number) => string): string {
  if (!summary) {
    return `${label}: no samples`;
  }
  return `${label}: min ${format(summary.min)}  avg ${format(summary.avg)}  p95 ${format(summary.p95)}  max ${format(summary.max)}`;
}

function renderPerf(result: PerfResult): string {
  const lines: string[] = [];
  if (result.sample) {
    lines.push(renderSample(result.sample));
  }
  if (result.summary && result.samples) {
    lines.push(
      `Samples: ${result.samples.length}${result.errors?.length ? ` (${result.errors.length} failed)` : ''}`,
      summaryLine('CPU', result.summary.cpuPercent, (value) => `${value.toFixed(1)}%`),
      summaryLine('Memory', result.summary.memoryUsed, formatBytes),
    );
  }
  if (result.savedTo) {
    lines.push('', `Saved to ${result.savedTo}`);
  }
  for (const failure of result.failures) {
    lines.push('', `FAILED: ${failure}`);
  }
  return lines.join('\n');
}

export const perfCommand: CommandModule<GlobalArgs, PerfArgs> = {
  command: 'perf [appId]',
  describe:
    'Show the foreground (or a given) app\'s CPU and memory use, once or sampled over time. Needs developer ' +
    'mode and "Control by mobile apps" enabled',
  builder: (yargs) =>
    yargs
      .positional('appId', {
        type: 'string',
        describe: 'App to measure (e.g. dev). Defaults to whatever is in the foreground',
      })
      .option('cpu-window', {
        type: 'number',
        describe: 'Seconds the device measures CPU over for each sample (default 1). Each query waits this long to answer',
      })
      .option('watch', { type: 'boolean', default: false, describe: 'Sample every --interval until Ctrl+C, then summarize' })
      .option('duration', { type: 'number', describe: 'Sample every --interval for this many seconds, then summarize' })
      .option('interval', { type: 'number', default: 1, describe: 'Seconds between samples with --watch/--duration' })
      .option('out', { type: 'string', describe: 'Write every sample to this file - CSV for a .csv name, JSON otherwise' })
      .option('assert-max-mem', { type: 'number', describe: 'Exit with an error if memory used ever goes over this many MB' })
      .option('assert-max-cpu', { type: 'number', describe: 'Exit with an error if CPU ever goes over this percent' }),
  handler: async (argv) => {
    try {
      validateSampling(argv.interval, argv.duration);
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const ecp = new EcpClient({ host: config.host });
      const result: PerfResult = { failures: [] };
      let samples: ChanperfSample[];

      if (argv.watch || argv.duration !== undefined) {
        const collected = await collectSamples({
          intervalSeconds: argv.interval,
          durationSeconds: argv.duration,
          query: () => ecp.getChanperf(argv.appId, argv.cpuWindow),
          onSample: (sample) => !argv.json && console.log(`${new Date().toLocaleTimeString()}  ${sampleLine(sample)}`),
          onError: (error) => !argv.json && printError(error, false),
        });
        samples = collected.samples;
        Object.assign(result, { samples, summary: summarizePerf(samples), errors: collected.errors });
      } else {
        const sample = await ecp.getChanperf(argv.appId, argv.cpuWindow);
        samples = [sample];
        result.sample = sample;
      }

      result.failures = checkPerfAssertions(result.summary ?? summarizePerf(samples), argv.assertMaxMem, argv.assertMaxCpu);
      if (argv.out) {
        writeSamplesFile(argv.out, CSV_COLUMNS, samples.map(csvRow), { samples, summary: result.summary });
        result.savedTo = argv.out;
      }
      printResult(result, argv.json, renderPerf);
      if (result.failures.length > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
