import type { CommandModule } from 'yargs';
import { resolveConfig } from '../config';
import { sideload } from '../deploy/sideload';
import { printResult, printError } from '../output';
import type { GlobalArgs } from '../cli-types';

interface SideloadArgs extends GlobalArgs {
  projectPathOrZip: string;
  deleteDevChannel: boolean;
}

export const sideloadCommand: CommandModule<GlobalArgs, SideloadArgs> = {
  command: 'sideload <projectPathOrZip>',
  describe:
    'Sideload a Roku app: pass a project root (containing manifest/, source/, components/) to stage+zip+sideload it, ' +
    'or an existing .zip to sideload directly. Run your own build step first - this does not build anything.',
  builder: (yargs) =>
    yargs
      .positional('projectPathOrZip', {
        type: 'string',
        demandOption: true,
        describe: 'Path to a Roku project root or a pre-built .zip',
      })
      .option('deleteDevChannel', {
        type: 'boolean',
        default: false,
        describe: 'Delete the previously installed dev channel before installing the new one',
      }),
  handler: async (argv) => {
    try {
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const result = await sideload(config, {
        projectPathOrZip: argv.projectPathOrZip,
        deleteDevChannel: argv.deleteDevChannel,
      });
      printResult(result, argv.json, (r) => `${r.message}\n${r.zipPath}`);
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
