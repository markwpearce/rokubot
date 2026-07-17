import type { CommandModule } from 'yargs';
import { RokuDeploy } from 'roku-deploy';
import type { RokuKey } from 'roku-deploy';
import { resolveConfig } from '../config';
import { printResult, printError } from '../output';
import { captureScreenshot } from './screenshot';
import type { GlobalArgs } from '../cli-types';

interface PressArgs extends GlobalArgs {
  key: string;
  action: 'keypress' | 'keydown' | 'keyup';
  screenshot: boolean;
}

export const pressCommand: CommandModule<GlobalArgs, PressArgs> = {
  command: 'press <key>',
  describe:
    'Send a remote-control key, e.g. up/down/left/right/select/back/home/play/rev/fwd/instantreplay/info/backspace/search/enter',
  builder: (yargs) =>
    yargs
      .positional('key', { type: 'string', demandOption: true, describe: 'The ECP key to send' })
      .option('action', {
        type: 'string',
        choices: ['keypress', 'keydown', 'keyup'] as const,
        default: 'keypress' as const,
        describe: 'Key event type',
      })
      .option('screenshot', {
        type: 'boolean',
        default: false,
        describe: 'Capture a screenshot immediately after sending the key, to see the result in one call',
      }),
  handler: async (argv) => {
    try {
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const rokuDeploy = new RokuDeploy();
      const key = argv.key as RokuKey;
      if (argv.action === 'keydown') {
        await rokuDeploy.keyDown({ host: config.host, key });
      } else if (argv.action === 'keyup') {
        await rokuDeploy.keyUp({ host: config.host, key });
      } else {
        await rokuDeploy.keyPress({ host: config.host, key });
      }

      const screenshotPath = argv.screenshot ? await captureScreenshot(config) : undefined;
      printResult(
        { sent: argv.key, action: argv.action, screenshot: screenshotPath ?? null },
        argv.json,
        (r) => `Sent ${r.action} '${r.sent}'` + (r.screenshot ? `\n${r.screenshot}` : ''),
      );
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
