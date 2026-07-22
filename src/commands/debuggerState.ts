import type { CommandModule } from 'yargs';
import { resolveConfig } from '../config';
import { printResult, printError } from '../output';
import { checkDebuggerState } from './console';
import type { GlobalArgs } from '../cli-types';

export const debuggerStateCommand: CommandModule<GlobalArgs, GlobalArgs> = {
  command: 'debugger-state',
  describe:
    'Check whether the app is currently paused at a BrightScript Micro Debugger prompt (e.g. crashed or hit a ' +
    'breakpoint), as opposed to just idle/unchanged - distinguishes the two without a manual console detour',
  handler: async (argv) => {
    try {
      const config = resolveConfig({ host: argv.host, password: argv.password });
      const pausedAtBreakpoint = await checkDebuggerState(config.host);
      printResult({ pausedAtBreakpoint }, argv.json, (r) =>
        r.pausedAtBreakpoint
          ? 'Paused at a BrightScript Debugger prompt (crashed or hit a breakpoint)'
          : 'Not paused at a debugger prompt',
      );
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
