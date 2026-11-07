import type { CommandModule } from 'yargs';
import * as fs from 'fs';
import { RokuDeploy } from 'roku-deploy';
import { EcpClient } from '../ecp/client';
import { resolveConfig } from '../config';
import { printError } from '../output';
import { resolveKey } from '../keys';
import type { GlobalArgs } from '../cli-types';
import { csvHeader, csvLine, round, sampleLoop, validateSampling, writeSamplesFile } from '../sampling';
import {
  MONITOR_CSV_COLUMNS,
  MONITOR_METRICS,
  MONITOR_TABLE_HEADER,
  monitorCsvRow,
  monitorTableRow,
  parseKeyScript,
  renderMonitorHtml,
  renderMonitorSummary,
  stepLabel,
  summarizeMonitor,
  type MonitorMetric,
  type MonitorSample,
} from '../monitor';

interface MonitorArgs extends GlobalArgs {
  appId?: string;
  cpuWindow?: number;
  interval: number;
  duration?: number;
  metrics: MonitorMetric[];
  keys?: string[];
  delay: number;
  csv: boolean;
  out?: string;
  html?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Queries every requested metric in parallel, so one sample costs roughly one round trip. */
async function takeSample(
  ecp: EcpClient,
  metrics: MonitorMetric[],
  appId: string | undefined,
  cpuWindow: number | undefined,
  elapsed: number,
  step: string,
): Promise<MonitorSample> {
  const started = Date.now();
  const [perf, textures, fps] = await Promise.allSettled([
    metrics.includes('perf') ? ecp.getChanperf(appId, cpuWindow) : Promise.resolve(undefined),
    metrics.includes('textures') ? ecp.getTextureReport() : Promise.resolve(undefined),
    metrics.includes('fps') ? ecp.getGraphicsFrameRate() : Promise.resolve(undefined),
  ]);
  const sample: MonitorSample = { elapsed: round(elapsed, 2), timestamp: started, step, queryMs: Date.now() - started };
  const errors: string[] = [];
  if (perf.status === 'fulfilled' && perf.value) {
    sample.cpuPercent = round(perf.value.cpu.total, 2);
    sample.memoryUsed = perf.value.memory.used;
  } else if (perf.status === 'rejected') {
    errors.push(`perf: ${message(perf.reason)}`);
  }
  if (textures.status === 'fulfilled' && textures.value) {
    sample.textureUsed = textures.value.textureMemory.used;
    sample.textureMax = textures.value.textureMemory.max;
  } else if (textures.status === 'rejected') {
    errors.push(`textures: ${message(textures.reason)}`);
  }
  if (fps.status === 'fulfilled' && fps.value) {
    sample.fps = fps.value.fps;
  } else if (fps.status === 'rejected') {
    errors.push(`fps: ${message(fps.reason)}`);
  }
  if (errors.length > 0) {
    sample.errors = errors;
  }
  return sample;
}

export const monitorCommand: CommandModule<GlobalArgs, MonitorArgs> = {
  command: 'monitor [appId]',
  describe:
    'Live CPU, memory, texture memory and fps on one timeline, optionally while a key script runs. Needs ' +
    'developer mode and "Control by mobile apps" enabled',
  builder: (yargs) =>
    yargs
      .positional('appId', {
        type: 'string',
        describe: 'App to measure CPU/memory for (e.g. dev). Defaults to whatever is in the foreground',
      })
      .option('cpu-window', {
        type: 'number',
        describe:
          'Seconds the device measures CPU over for each sample (default 1). The perf query waits this long to ' +
          'answer, so samples can be no closer together than this',
      })
      .option('interval', { type: 'number', default: 1, describe: 'Seconds between samples' })
      .option('duration', {
        type: 'number',
        describe: 'Stop after this many seconds. Defaults to running until Ctrl+C, or until --keys finish',
      })
      .option('metrics', {
        type: 'string',
        array: true,
        choices: MONITOR_METRICS,
        default: [...MONITOR_METRICS],
        describe: 'Which queries to run each sample: perf (CPU/memory), textures, fps. Fewer queries means less polling overhead',
      })
      .option('keys', {
        type: 'string',
        array: true,
        describe:
          'Keys to press while monitoring, e.g. --keys "down down select". Each sample is tagged with the step that ' +
          'was running, and the summary breaks the run down by step',
      })
      .option('delay', { type: 'number', default: 1, describe: 'Seconds before the first key, between keys, and after the last' })
      .option('csv', { type: 'boolean', default: false, describe: 'Print CSV lines instead of a table' })
      .option('out', { type: 'string', describe: 'Write every sample to this file - CSV for a .csv name, JSON otherwise' })
      .option('html', { type: 'string', describe: 'Write an HTML report with a chart per metric to this file' }),
  handler: async (argv) => {
    try {
      validateSampling(argv.interval, argv.duration);
      if (!(argv.delay >= 0)) {
        throw new Error(`Invalid --delay '${argv.delay}' - must be a number of seconds, 0 or more`);
      }
      if (argv.json && argv.csv) {
        throw new Error("--json and --csv can't be combined");
      }
      const keys = parseKeyScript(argv.keys ?? []).map(resolveKey);
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const ecp = new EcpClient({ host: config.host });
      const rokuDeploy = new RokuDeploy();

      let step = 'start';
      let sampling = true;
      // Without --duration, a key script ends the run --delay seconds after its last key.
      const runKeys = async () => {
        for (let i = 0; i < keys.length; i++) {
          await sleep(argv.delay * 1000);
          if (!sampling) {
            // Ctrl+C or --duration ended the run; don't keep pressing keys after it.
            return;
          }
          step = stepLabel(i, keys[i]!);
          await rokuDeploy.keyPress({ host: config.host, key: keys[i]! });
        }
        await sleep(argv.delay * 1000);
      };
      const keysDone = keys.length > 0 ? runKeys() : undefined;
      // Surface a failed key press after sampling stops rather than as an unhandled rejection.
      const keysResult = keysDone?.then(
        () => undefined,
        (error: unknown) => error,
      );

      const samples: MonitorSample[] = [];
      if (argv.csv) {
        console.log(csvHeader(MONITOR_CSV_COLUMNS));
      } else if (!argv.json) {
        console.log(MONITOR_TABLE_HEADER);
      }
      await sampleLoop({
        intervalSeconds: argv.interval,
        durationSeconds: argv.duration,
        stop: argv.duration === undefined && keysResult ? keysResult.then(() => undefined) : undefined,
        tick: async (elapsed) => {
          const sample = await takeSample(ecp, argv.metrics, argv.appId, argv.cpuWindow, elapsed, step);
          samples.push(sample);
          if (argv.json) {
            // One JSON object per line, so a script can read samples as they arrive.
            console.log(JSON.stringify(sample));
          } else if (argv.csv) {
            console.log(csvLine(MONITOR_CSV_COLUMNS, monitorCsvRow(sample)));
          } else {
            console.log(monitorTableRow(sample));
          }
        },
      });

      sampling = false;
      const summary = summarizeMonitor(samples, keys.length > 0);
      if (argv.out) {
        writeSamplesFile(argv.out, MONITOR_CSV_COLUMNS, samples.map(monitorCsvRow), { samples, summary });
      }
      if (argv.html) {
        fs.writeFileSync(argv.html, renderMonitorHtml(samples, summary, `rokubot monitor - ${config.host}`));
      }
      if (argv.json) {
        console.log(JSON.stringify({ summary, savedTo: argv.out, htmlReport: argv.html }));
      } else if (!argv.csv) {
        console.log(renderMonitorSummary(summary));
        for (const file of [argv.out, argv.html].filter(Boolean)) {
          console.log(`Saved to ${file}`);
        }
      }

      const keyError = await keysResult;
      if (keyError) {
        throw keyError;
      }
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
