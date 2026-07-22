import type { CommandModule } from 'yargs';
import * as net from 'net';
import { resolveConfig } from '../config';
import { printResult, printError } from '../output';
import type { GlobalArgs } from '../cli-types';

const CONSOLE_PORT = 8085;

/**
 * Opens the console over a raw socket (not the `telnet` binary) so it works the same whether
 * a human or an agent is driving - no real TTY required, unlike interactive telnet.
 */
export function openConsoleSocket(host: string, port: number = CONSOLE_PORT): net.Socket {
  return net.createConnection({ host, port });
}

/**
 * Sends one line to the debug console (e.g. a BrightScript `print`/`var` command while paused at
 * a breakpoint) and captures whatever comes back until the console goes quiet - this is what lets
 * an agent script SceneGraph/variable inspection without needing an interactive terminal.
 */
export function sendAndCollect(
  host: string,
  command: string,
  quietMs: number,
  maxMs: number,
  port?: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = openConsoleSocket(host, port);
    let output = '';
    let quietTimer: NodeJS.Timeout | undefined;
    const maxTimer = setTimeout(() => finish(), maxMs);

    const finish = () => {
      clearTimeout(maxTimer);
      clearTimeout(quietTimer);
      socket.destroy();
      resolve(output);
    };

    socket.on('connect', () => {
      socket.write(`${command}\r\n`);
    });
    socket.on('data', (chunk) => {
      output += chunk.toString();
      clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, quietMs);
    });
    socket.on('error', reject);
  });
}

const DEBUGGER_PROMPT_RE = /Brightscript\s+Debugger>/i;

/**
 * Checks whether the app is currently paused at a BrightScript Micro Debugger prompt (e.g. after
 * a crash, or an explicit breakpoint) rather than just quiet/idle. A stale/unchanged screenshot is
 * ambiguous on its own - it could mean nothing happened, or that the app died and is frozen at a
 * debugger prompt showing its last frame forever - so this settles that without a manual detour
 * through `console`.
 *
 * Connecting to the console replays some recent scrollback, which could contain an old debugger
 * prompt from a crash that's since been resumed (`cont`). To avoid that false positive, this waits
 * for the replay to settle, sends a blank line, and only counts a prompt seen *after* that probe -
 * the debugger reprints its prompt in response to input, while a running app won't echo anything
 * resembling it.
 */
export function checkDebuggerState(
  host: string,
  port?: number,
  settleMs: number = 400,
  probeMs: number = 800,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = openConsoleSocket(host, port);
    let probed = false;
    let pausedAtBreakpoint = false;
    let settleTimer: NodeJS.Timeout;
    let probeTimer: NodeJS.Timeout;

    const finish = () => {
      clearTimeout(settleTimer);
      clearTimeout(probeTimer);
      socket.destroy();
      resolve(pausedAtBreakpoint);
    };

    socket.on('connect', () => {
      settleTimer = setTimeout(() => {
        probed = true;
        socket.write('\r\n');
        probeTimer = setTimeout(finish, probeMs);
      }, settleMs);
    });
    socket.on('data', (chunk) => {
      if (probed && DEBUGGER_PROMPT_RE.test(chunk.toString())) {
        pausedAtBreakpoint = true;
      }
    });
    socket.on('error', reject);
  });
}

function streamConsole(host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = openConsoleSocket(host);
    socket.on('data', (chunk) => process.stdout.write(chunk));
    socket.on('error', reject);
    socket.on('close', () => resolve());
    process.once('SIGINT', () => socket.destroy());
  });
}

interface ConsoleArgs extends GlobalArgs {
  send?: string;
  timeout: number;
}

export const consoleCommand: CommandModule<GlobalArgs, ConsoleArgs> = {
  command: 'console',
  describe:
    'Stream the debug console (Ctrl+C to stop), or with --send, write one command and return its output ' +
    "(e.g. `rokubot console --send \"print 1+1\"` while the app is paused at a breakpoint)",
  builder: (yargs) =>
    yargs
      .option('send', { type: 'string', describe: 'A single command to send; returns its response and exits' })
      .option('timeout', {
        type: 'number',
        default: 3000,
        describe: 'With --send, max ms to wait for a response before giving up',
      }),
  handler: async (argv) => {
    try {
      const config = resolveConfig({ host: argv.host, password: argv.password });
      if (argv.send) {
        const output = await sendAndCollect(config.host, argv.send, 500, argv.timeout);
        printResult({ sent: argv.send, output }, argv.json, (r) => r.output);
      } else {
        await streamConsole(config.host);
      }
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};
