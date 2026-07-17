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
