import type { CommandModule } from 'yargs';
import { RokuDeploy } from 'roku-deploy';
import { resolveConfig } from '../config';
import { printResult, printError } from '../output';
import type { GlobalArgs } from '../cli-types';

export const infoCommand: CommandModule<GlobalArgs, GlobalArgs> = {
  command: 'info',
  describe: "Get the Roku device's info (model, OS version, display type, etc.)",
  handler: async (argv) => {
    try {
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const rokuDeploy = new RokuDeploy();
      const deviceInfo = await rokuDeploy.getDeviceInfo({ host: config.host, enhance: true });
      printResult(
        deviceInfo,
        argv.json,
        (info) =>
          `${info.modelDisplayName ?? info.modelNumber ?? 'Unknown model'} - ` +
          `Roku OS ${info.softwareVersion ?? 'unknown'} (${info.friendlyDeviceName ?? config.host})`,
      );
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
