import type { CommandModule } from 'yargs';
import { EcpClient } from '../ecp/client';
import { resolveConfig } from '../config';
import { printResult, printError } from '../output';
import type { GlobalArgs } from '../cli-types';

export const appsCommand: CommandModule<GlobalArgs, GlobalArgs> = {
  command: 'apps',
  describe: 'List the apps/channels installed on the device',
  handler: async (argv) => {
    try {
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const ecp = new EcpClient({ host: config.host });
      const apps = await ecp.listApps();
      printResult(apps, argv.json, (list) =>
        list.length === 0 ? 'No apps found.' : list.map((app: any) => `${app.id}\t${app.title}`).join('\n'),
      );
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
