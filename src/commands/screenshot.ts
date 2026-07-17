import type { CommandModule } from 'yargs';
import * as os from 'os';
import * as path from 'path';
import { RokuDeploy } from 'roku-deploy';
import { resolveConfig, type RokuConfig } from '../config';
import { printResult, printError } from '../output';
import type { GlobalArgs } from '../cli-types';

const defaultScreenshotDir = path.join(os.tmpdir(), 'rokubot-screenshots');

/** Shared by the `screenshot` command and the `--screenshot` flag on `press`/`text`. */
export async function captureScreenshot(config: RokuConfig, screenshotDir: string = defaultScreenshotDir): Promise<string> {
  const rokuDeploy = new RokuDeploy();
  return rokuDeploy.captureScreenshot({ host: config.host, password: config.password, screenshotDir });
}

interface ScreenshotArgs extends GlobalArgs {
  dir: string;
}

export const screenshotCommand: CommandModule<GlobalArgs, ScreenshotArgs> = {
  command: 'screenshot',
  describe: 'Capture a screenshot of what is currently on screen',
  builder: (yargs) =>
    yargs.option('dir', {
      type: 'string',
      default: defaultScreenshotDir,
      describe:
        'Directory to save the screenshot to. Defaults to the OS temp dir since screenshots are usually scratch ' +
        '- pass this explicitly to keep one on purpose.',
    }),
  handler: async (argv) => {
    try {
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const screenshotPath = await captureScreenshot(config, argv.dir);
      printResult({ path: screenshotPath }, argv.json, (r) => r.path);
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
