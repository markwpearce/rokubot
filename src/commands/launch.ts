import type { CommandModule } from 'yargs';
import { EcpClient } from '../ecp/client';
import { resolveConfig } from '../config';
import { printResult, printError } from '../output';
import type { GlobalArgs } from '../cli-types';

interface LaunchArgs extends GlobalArgs {
  appId: string;
  param: string[];
}

export function parseParams(pairs: string[]): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq === -1) {
      throw new Error(`Invalid --param '${pair}' - expected the form key=value`);
    }
    params[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return params;
}

export const launchCommand: CommandModule<GlobalArgs, LaunchArgs> = {
  command: 'launch [appId]',
  describe: "Launch (or deep-link into) an app. Defaults to 'dev', the id a sideloaded channel always runs as.",
  builder: (yargs) =>
    yargs
      .positional('appId', { type: 'string', default: 'dev', describe: 'The app/channel id to launch' })
      .option('param', {
        type: 'string',
        array: true,
        default: [] as string[],
        describe: 'A deep-link param as key=value; repeatable',
      }),
  handler: async (argv) => {
    try {
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const ecp = new EcpClient({ host: config.host });
      const params = parseParams(argv.param);
      await ecp.launch(argv.appId, params);
      printResult({ launched: argv.appId, params }, argv.json, () => `Launched '${argv.appId}'`);
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
