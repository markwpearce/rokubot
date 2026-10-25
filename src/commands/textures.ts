import type { CommandModule } from 'yargs';
import * as fs from 'fs';
import { EcpClient } from '../ecp/client';
import { resolveConfig } from '../config';
import { printResult, printError } from '../output';
import type { GlobalArgs } from '../cli-types';
import {
  diffTextureReports,
  formatBytes,
  groupBitmapsByName,
  largestBitmaps,
  type BitmapGroup,
  type TextureBitmap,
  type TextureDiff,
  type TextureMemory,
  type TextureReport,
} from '../textures';

interface TexturesArgs extends GlobalArgs {
  top: number;
  all: boolean;
  group: boolean;
  save?: string;
  watch: boolean;
  interval: number;
  assertMaxUsed?: number;
  assertMinFree?: number;
}

interface TexturesDiffArgs extends GlobalArgs {
  before: string;
  after?: string;
}

interface TexturesResult {
  report: TextureReport;
  largest?: TextureBitmap[];
  groups?: BitmapGroup[];
  savedTo?: string;
  failures: string[];
}

const MB = 1_000_000;

function percentUsed(memory: TextureMemory): string {
  return memory.max > 0 ? `${((memory.used / memory.max) * 100).toFixed(1)}%` : 'n/a';
}

function memoryLine(memory: TextureMemory): string {
  return (
    `${formatBytes(memory.used)} used of ${formatBytes(memory.max)} (${percentUsed(memory)}), ` +
    `${formatBytes(memory.available)} free`
  );
}

function bitmapLine(bitmap: TextureBitmap): string {
  return `  ${formatBytes(bitmap.size).padStart(9)}  ${`${bitmap.width}x${bitmap.height}`.padEnd(11)} ${bitmap.name}`;
}

function groupLine(group: BitmapGroup): string {
  return `  ${formatBytes(group.size).padStart(9)}  ${`x${group.count}`.padEnd(6)} ${group.name}`;
}

export function checkTextureAssertions(
  memory: TextureMemory,
  assertMaxUsedMb?: number,
  assertMinFreeMb?: number,
): string[] {
  const failures: string[] = [];
  if (assertMaxUsedMb !== undefined && memory.used > assertMaxUsedMb * MB) {
    failures.push(`Texture memory used ${formatBytes(memory.used)} is over --assert-max-used ${assertMaxUsedMb} MB`);
  }
  if (assertMinFreeMb !== undefined && memory.available < assertMinFreeMb * MB) {
    failures.push(`Texture memory free ${formatBytes(memory.available)} is under --assert-min-free ${assertMinFreeMb} MB`);
  }
  return failures;
}

function renderTextures(result: TexturesResult): string {
  const { report } = result;
  const lines = [`Texture memory: ${memoryLine(report.textureMemory)}`, `Bitmaps: ${report.bitmapCount}`];
  if (result.groups) {
    lines.push('', 'Largest by name (unnamed = created by the app, not loaded from a file):', ...result.groups.map(groupLine));
  }
  if (result.largest) {
    const heading = result.largest.length === report.bitmapCount ? 'All bitmaps:' : `Largest ${result.largest.length}:`;
    lines.push('', heading, ...result.largest.map(bitmapLine));
  }
  if (result.savedTo) {
    lines.push('', `Saved to ${result.savedTo}`);
  }
  for (const failure of result.failures) {
    lines.push('', `FAILED: ${failure}`);
  }
  return lines.join('\n');
}

export function renderTextureDiff(diff: TextureDiff): string {
  const sign = diff.usedDelta > 0 ? '+' : '';
  const lines = [
    `Texture memory: ${formatBytes(diff.before.used)} -> ${formatBytes(diff.after.used)} (${sign}${formatBytes(diff.usedDelta)})`,
  ];
  const addedBytes = diff.added.reduce((total, bitmap) => total + bitmap.size, 0);
  const removedBytes = diff.removed.reduce((total, bitmap) => total + bitmap.size, 0);
  lines.push('', `Added: ${diff.added.length} (${formatBytes(addedBytes)})`, ...diff.added.map(bitmapLine));
  lines.push('', `Removed: ${diff.removed.length} (${formatBytes(removedBytes)})`, ...diff.removed.map(bitmapLine));
  return lines.join('\n');
}

function readSavedReport(file: string): TextureReport {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Accept either a bare report or a whole `textures --json` result.
  const report = data?.report ?? data;
  if (!report?.textureMemory || !Array.isArray(report.instances)) {
    throw new Error(`${file} isn't a saved texture report - create one with \`rokubot textures --save ${file}\``);
  }
  return report;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function watchTextures(ecp: EcpClient, intervalSeconds: number, json: boolean): Promise<void> {
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  while (!stopped) {
    const time = new Date().toLocaleTimeString();
    try {
      const report = await ecp.getTextureReport();
      if (json) {
        // One JSON object per line, so a script can read samples as they arrive.
        console.log(JSON.stringify({ timestamp: report.timestamp, textureMemory: report.textureMemory, bitmapCount: report.bitmapCount }));
      } else {
        console.log(`${time}  ${memoryLine(report.textureMemory)}, ${report.bitmapCount} bitmaps`);
      }
    } catch (error) {
      // The device occasionally answers FAILED for one query; one bad sample shouldn't end the watch.
      printError(error, json);
    }
    await sleep(intervalSeconds * 1000);
  }
}

export const texturesCommand: CommandModule<GlobalArgs, TexturesArgs> = {
  command: 'textures',
  describe:
    'Show texture (graphics) memory: used/free/max and the largest bitmaps. Needs developer mode and ' +
    '"Control by mobile apps" enabled',
  builder: (yargs) =>
    yargs
      .command<TexturesDiffArgs>(
        'diff <before> [after]',
        'Compare two saved reports (or a saved report against the device now) to find bitmaps that were never freed',
        (y) =>
          y
            .positional('before', { type: 'string', demandOption: true, describe: 'A report saved with `textures --save`' })
            .positional('after', { type: 'string', describe: 'A second saved report. Defaults to querying the device now' }),
        async (argv) => {
          try {
            const before = readSavedReport(argv.before);
            let after: TextureReport;
            if (argv.after) {
              after = readSavedReport(argv.after);
            } else {
              const config = resolveConfig({ host: argv.host, password: argv.password });
              after = await new EcpClient({ host: config.host }).getTextureReport();
            }
            printResult(diffTextureReports(before, after), argv.json, renderTextureDiff);
          } catch (error) {
            printError(error, argv.json);
            process.exitCode = 1;
          }
        },
      )
      .option('top', { type: 'number', default: 10, describe: 'How many of the largest bitmaps (or groups, with --group) to list' })
      .option('all', { type: 'boolean', default: false, describe: 'List every bitmap (or group), largest first' })
      .option('group', {
        type: 'boolean',
        default: false,
        describe: 'Total bitmaps by name (file path or font), with every app-created bitmap in one "(unnamed)" group',
      })
      .option('save', { type: 'string', describe: 'Write the full report as JSON to this file, for `textures diff` later' })
      .option('watch', { type: 'boolean', default: false, describe: 'Print one usage line per --interval until Ctrl+C' })
      .option('interval', { type: 'number', default: 1, describe: 'Seconds between samples with --watch' })
      .option('assert-max-used', {
        type: 'number',
        describe: 'Exit with an error if more than this many MB of texture memory is used',
      })
      .option('assert-min-free', {
        type: 'number',
        describe: 'Exit with an error if less than this many MB of texture memory is free',
      }),
  handler: async (argv) => {
    try {
      if (!(argv.interval > 0)) {
        throw new Error(`Invalid --interval '${argv.interval}' - must be a number of seconds greater than 0`);
      }
      // Checked here rather than with yargs' .conflicts(), which counts --watch's false default as set.
      if (argv.watch && (argv.save || argv.assertMaxUsed !== undefined || argv.assertMinFree !== undefined)) {
        throw new Error('--watch can\'t be combined with --save, --assert-max-used or --assert-min-free');
      }
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const ecp = new EcpClient({ host: config.host });
      if (argv.watch) {
        await watchTextures(ecp, argv.interval, argv.json);
        return;
      }

      const report = await ecp.getTextureReport();
      const result: TexturesResult = {
        report,
        failures: checkTextureAssertions(report.textureMemory, argv.assertMaxUsed, argv.assertMinFree),
      };
      if (argv.group) {
        const groups = groupBitmapsByName(report);
        result.groups = argv.all ? groups : groups.slice(0, argv.top);
      } else {
        result.largest = largestBitmaps(report, argv.all ? undefined : argv.top);
      }
      if (argv.save) {
        fs.writeFileSync(argv.save, JSON.stringify(report, null, 2));
        result.savedTo = argv.save;
      }
      printResult(result, argv.json, renderTextures);
      if (result.failures.length > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
