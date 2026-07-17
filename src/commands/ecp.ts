import type { CommandModule } from 'yargs';
import { EcpClient } from '../ecp/client';
import { resolveConfig } from '../config';
import { printResult, printError } from '../output';
import type { GlobalArgs } from '../cli-types';

interface EcpArgs extends GlobalArgs {
  method: 'GET' | 'POST';
  path: string;
}

export const ecpCommand: CommandModule<GlobalArgs, EcpArgs> = {
  command: 'ecp <method> <path>',
  describe:
    "Raw ECP escape hatch for anything not covered by a dedicated command, e.g. `rokubot ecp GET /query/icon/dev`",
  builder: (yargs) =>
    yargs
      .positional('method', { type: 'string', choices: ['GET', 'POST'] as const, demandOption: true })
      .positional('path', { type: 'string', demandOption: true, describe: 'The ECP path, e.g. /query/apps' }),
  handler: async (argv) => {
    try {
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const ecp = new EcpClient({ host: config.host });
      const body = await ecp.raw(argv.method, argv.path);
      printResult({ body }, argv.json, (r) => r.body);
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
