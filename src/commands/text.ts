import type { CommandModule } from 'yargs';
import { RokuDeploy } from 'roku-deploy';
import { resolveConfig } from '../config';
import { printResult, printError } from '../output';
import { captureScreenshot } from './screenshot';
import type { GlobalArgs } from '../cli-types';

interface TextArgs extends GlobalArgs {
  text: string;
  screenshot: boolean;
  scale: number;
}

export const textCommand: CommandModule<GlobalArgs, TextArgs> = {
  command: 'text <text>',
  describe: 'Type literal text, e.g. into a search box',
  builder: (yargs) =>
    yargs
      .positional('text', { type: 'string', demandOption: true, describe: 'The text to type' })
      .option('screenshot', {
        type: 'boolean',
        default: false,
        describe: 'Capture a screenshot immediately after typing, to see the result in one call',
      })
      .option('scale', {
        type: 'number',
        default: 1,
        describe: 'With --screenshot, shrink it by this factor, e.g. 0.5 for half size',
      }),
  handler: async (argv) => {
    try {
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const rokuDeploy = new RokuDeploy();
      // SendTextOptions' type extends SendKeyEventOptions and declares `key` as required, but
      // sendText() ignores any passed key and derives its own per-character `lit_<char>` key -
      // the required `key` field is a type-only artifact of that inheritance.
      await rokuDeploy.sendText({ host: config.host, text: argv.text } as Parameters<typeof rokuDeploy.sendText>[0]);

      const screenshotPath = argv.screenshot ? await captureScreenshot(config, undefined, argv.scale) : undefined;
      printResult(
        { sent: argv.text, screenshot: screenshotPath ?? null },
        argv.json,
        (r) => `Sent text '${r.sent}'` + (r.screenshot ? `\n${r.screenshot}` : ''),
      );
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
