import type { CommandModule } from 'yargs';
import { EcpClient } from '../ecp/client';
import { resolveConfig } from '../config';
import { printResult, printError } from '../output';
import type { GlobalArgs } from '../cli-types';

export const activeAppCommand: CommandModule<GlobalArgs, GlobalArgs> = {
  command: 'active-app',
  describe: 'Show which app/channel is currently in the foreground',
  handler: async (argv) => {
    try {
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const ecp = new EcpClient({ host: config.host });
      const activeApp = await ecp.getActiveApp();
      printResult(activeApp ?? null, argv.json, (app) =>
        app ? `${app.id}${app.title ? ` (${app.title})` : ''}` : 'No active app (device may be on Home screensaver)',
      );
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
