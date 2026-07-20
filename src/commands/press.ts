import type { CommandModule } from 'yargs';
import { RokuDeploy } from 'roku-deploy';
import type { RokuKey } from 'roku-deploy';
import { resolveConfig } from '../config';
import { printResult, printError } from '../output';
import { captureScreenshot } from './screenshot';
import type { GlobalArgs } from '../cli-types';

interface PressArgs extends GlobalArgs {
  key: string[];
  action: 'keypress' | 'keydown' | 'keyup';
  screenshot: boolean;
  scale: number;
  delay: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const pressCommand: CommandModule<GlobalArgs, PressArgs> = {
  command: 'press <key..>',
  describe:
    'Send one or more remote-control keys in order, e.g. up/down/left/right/select/back/home/play/rev/fwd/instantreplay/info/backspace/search/enter',
  builder: (yargs) =>
    yargs
      .positional('key', {
        type: 'string',
        array: true,
        demandOption: true,
        describe: 'One or more ECP keys to send in order, e.g. `press up up select`',
      })
      .option('action', {
        type: 'string',
        choices: ['keypress', 'keydown', 'keyup'] as const,
        default: 'keypress' as const,
        describe: 'Key event type',
      })
      .option('screenshot', {
        type: 'boolean',
        default: false,
        describe: 'Capture a screenshot immediately after sending the key(s), to see the result in one call',
      })
      .option('scale', {
        type: 'number',
        default: 1,
        describe: 'With --screenshot, shrink it by this factor, e.g. 0.5 for half size',
      })
      .option('delay', {
        type: 'number',
        default: 0.25,
        describe:
          'Seconds to wait between each key when sending more than one, and (with --screenshot) after the last ' +
          "key before capturing - the device's UI can take a moment to react, so this avoids a screenshot of a " +
          'stale/mid-transition screen',
      }),
  handler: async (argv) => {
    try {
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const rokuDeploy = new RokuDeploy();
      const keys = argv.key as RokuKey[];

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!;
        if (argv.action === 'keydown') {
          await rokuDeploy.keyDown({ host: config.host, key });
        } else if (argv.action === 'keyup') {
          await rokuDeploy.keyUp({ host: config.host, key });
        } else {
          await rokuDeploy.keyPress({ host: config.host, key });
        }
        if (i < keys.length - 1 || argv.screenshot) {
          await sleep(argv.delay * 1000);
        }
      }

      const screenshotPath = argv.screenshot ? await captureScreenshot(config, undefined, argv.scale) : undefined;
      printResult(
        { sent: keys, action: argv.action, delay: argv.delay, screenshot: screenshotPath ?? null },
        argv.json,
        (r) => `Sent ${r.action} ${r.sent.map((k: string) => `'${k}'`).join(', ')}` + (r.screenshot ? `\n${r.screenshot}` : ''),
      );
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
