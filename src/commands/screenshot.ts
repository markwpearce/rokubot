import type { CommandModule } from 'yargs';
import * as os from 'os';
import * as path from 'path';
import { RokuDeploy } from 'roku-deploy';
import { resolveConfig, type RokuConfig } from '../config';
import { scaleImageFile } from '../image';
import { printResult, printError } from '../output';
import type { GlobalArgs } from '../cli-types';

const defaultScreenshotDir = path.join(os.tmpdir(), 'rokubot-screenshots');

function validateScale(scale: number): void {
  if (!(scale > 0) || scale > 1) {
    throw new Error(`Invalid --scale '${scale}' - must be a number greater than 0 and at most 1 (e.g. 0.5 for half size)`);
  }
}

/** Shared by the `screenshot` command and the `--screenshot` flag on `press`/`text`. */
export async function captureScreenshot(
  config: RokuConfig,
  screenshotDir: string = defaultScreenshotDir,
  scale: number = 1,
): Promise<string> {
  validateScale(scale);
  const rokuDeploy = new RokuDeploy();
  const screenshotPath = await rokuDeploy.captureScreenshot({ host: config.host, password: config.password, screenshotDir });
  if (scale < 1) {
    await scaleImageFile(screenshotPath, scale);
  }
  return screenshotPath;
}

interface ScreenshotArgs extends GlobalArgs {
  dir: string;
  scale: number;
}

export const screenshotCommand: CommandModule<GlobalArgs, ScreenshotArgs> = {
  command: 'screenshot',
  describe: 'Capture a screenshot of what is currently on screen',
  builder: (yargs) =>
    yargs
      .option('dir', {
        type: 'string',
        default: defaultScreenshotDir,
        describe:
          'Directory to save the screenshot to. Defaults to the OS temp dir since screenshots are usually scratch ' +
          '- pass this explicitly to keep one on purpose.',
      })
      .option('scale', {
        type: 'number',
        default: 1,
        describe:
          'Shrink the screenshot by this factor, e.g. 0.5 for half size (a quarter of the pixels) - useful for ' +
          'agents that want a cheaper image to read without losing the info needed to pick a next action.',
      }),
  handler: async (argv) => {
    try {
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const screenshotPath = await captureScreenshot(config, argv.dir, argv.scale);
      printResult({ path: screenshotPath }, argv.json, (r) => r.path);
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
