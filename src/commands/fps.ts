import type { CommandModule } from 'yargs';
import { EcpClient } from '../ecp/client';
import { resolveConfig } from '../config';
import { printResult, printError } from '../output';
import type { GlobalArgs } from '../cli-types';
import type { FrameRateSample } from '../fps';
import { sampleLoop, summarize, validateSampling, writeSamplesFile, type Summary } from '../sampling';

interface FpsArgs extends GlobalArgs {
  watch: boolean;
  duration?: number;
  interval: number;
  out?: string;
  assertMin?: number;
  assertMinP5?: number;
}

interface FpsResult {
  sample?: FrameRateSample;
  samples?: FrameRateSample[];
  summary?: Summary;
  errors?: string[];
  savedTo?: string;
  failures: string[];
}

function formatFps(value: number): string {
  return value.toFixed(1);
}

/** --assert-min checks the average; --assert-min-p5 the 5th percentile, to catch stutter an average hides. */
export function checkFpsAssertions(summary: Summary | undefined, assertMin?: number, assertMinP5?: number): string[] {
  const failures: string[] = [];
  if (!summary) {
    return failures;
  }
  if (assertMin !== undefined && summary.avg < assertMin) {
    failures.push(`Average ${formatFps(summary.avg)} fps is under --assert-min ${assertMin}`);
  }
  if (assertMinP5 !== undefined && summary.p5 < assertMinP5) {
    failures.push(`5th percentile ${formatFps(summary.p5)} fps is under --assert-min-p5 ${assertMinP5}`);
  }
  return failures;
}

function renderFps(result: FpsResult): string {
  const lines: string[] = [];
  if (result.sample) {
    lines.push(`Graphics frame rate: ${formatFps(result.sample.fps)} fps`);
  }
  if (result.summary && result.samples) {
    const { summary } = result;
    lines.push(
      `Samples: ${result.samples.length}${result.errors?.length ? ` (${result.errors.length} failed)` : ''}`,
      `fps: min ${formatFps(summary.min)}  p5 ${formatFps(summary.p5)}  avg ${formatFps(summary.avg)}  max ${formatFps(summary.max)}`,
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

export const fpsCommand: CommandModule<GlobalArgs, FpsArgs> = {
  command: 'fps',
  describe:
    'Show the rendered graphics frame rate (not video), once or sampled over time. Needs Roku OS 12.0+, ' +
    'developer mode and "Control by mobile apps" enabled',
  builder: (yargs) =>
    yargs
      .option('watch', { type: 'boolean', default: false, describe: 'Sample every --interval until Ctrl+C, then summarize' })
      .option('duration', { type: 'number', describe: 'Sample every --interval for this many seconds, then summarize' })
      .option('interval', { type: 'number', default: 1, describe: 'Seconds between samples with --watch/--duration' })
      .option('out', { type: 'string', describe: 'Write every sample to this file - CSV for a .csv name, JSON otherwise' })
      .option('assert-min', { type: 'number', describe: 'Exit with an error if the average fps is under this' })
      .option('assert-min-p5', {
        type: 'number',
        describe: 'Exit with an error if the 5th percentile fps is under this - catches stutter an average hides',
      }),
  handler: async (argv) => {
    try {
      validateSampling(argv.interval, argv.duration);
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const ecp = new EcpClient({ host: config.host });
      const result: FpsResult = { failures: [] };
      let samples: FrameRateSample[];

      if (argv.watch || argv.duration !== undefined) {
        samples = [];
        const errors: string[] = [];
        await sampleLoop({
          intervalSeconds: argv.interval,
          durationSeconds: argv.duration,
          tick: async () => {
            const time = new Date().toLocaleTimeString();
            try {
              const sample = await ecp.getGraphicsFrameRate();
              samples.push(sample);
              if (!argv.json) {
                console.log(`${time}  ${formatFps(sample.fps).padStart(5)} fps`);
              }
            } catch (error) {
              errors.push(error instanceof Error ? error.message : String(error));
              if (!argv.json) {
                printError(error, false);
              }
            }
          },
        });
        if (samples.length === 0) {
          throw new Error(errors[0] ?? 'No samples were taken');
        }
        Object.assign(result, { samples, summary: summarize(samples.map((sample) => sample.fps)), errors });
      } else {
        const sample = await ecp.getGraphicsFrameRate();
        samples = [sample];
        result.sample = sample;
      }

      result.failures = checkFpsAssertions(
        result.summary ?? summarize(samples.map((sample) => sample.fps)),
        argv.assertMin,
        argv.assertMinP5,
      );
      if (argv.out) {
        writeSamplesFile(argv.out, ['timestamp', 'fps'], samples.map((sample) => ({ ...sample })), { samples, summary: result.summary });
        result.savedTo = argv.out;
      }
      printResult(result, argv.json, renderFps);
      if (result.failures.length > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
