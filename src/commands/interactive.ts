import type { CommandModule } from 'yargs';
import * as readline from 'readline';
import { RokuDeploy } from 'roku-deploy';
import type { RokuKey } from 'roku-deploy';
import { resolveConfig } from '../config';
import { printError } from '../output';
import { openConsoleSocket, sendAndCollect } from './console';
import type { GlobalArgs } from '../cli-types';

/** Keys recognized by their readline `key.name`, e.g. arrow keys and named editing keys. */
const NAMED_KEY_MAP: Record<string, RokuKey> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  return: 'select',
  backspace: 'back',
};

/** Single-character shortcuts, checked when there's no NAMED_KEY_MAP match. */
const CHAR_KEY_MAP: Record<string, RokuKey> = {
  h: 'home',
  i: 'info',
  r: 'rev',
  f: 'fwd',
  ' ': 'play',
  '*': 'instantreplay',
};

const KEY_TABLE = [
  ['Up / Down / Left / Right', 'up / down / left / right'],
  ['Enter', 'select'],
  ['Backspace', 'back'],
  ['Space', 'play'],
  ['h', 'home'],
  ['i', 'info'],
  ['r', 'rev'],
  ['f', 'fwd'],
  ['*', 'instantreplay'],
  ['Esc', 'send a one-off debug-console command'],
  ['q / Ctrl+C', 'quit'],
] as const;

function formatKeyTable(rows: readonly (readonly [string, string])[]): string {
  const width = Math.max(...rows.map(([keyboard]) => keyboard.length));
  return rows.map(([keyboard, action]) => `  ${keyboard.padEnd(width)}   ${action}`).join('\n');
}

const HELP_TEXT = `--- rokubot interactive ---\n${formatKeyTable(KEY_TABLE)}\n`;

interface InteractiveArgs extends GlobalArgs {}

export const interactiveCommand: CommandModule<GlobalArgs, InteractiveArgs> = {
  command: 'interactive',
  describe:
    'Open an interactive session: arrow keys/Enter/etc. drive the device live while the debug console streams in ' +
    'the background, Esc drops to a one-off debug-console command line, q/Ctrl+C quits',
  builder: (yargs) => yargs.epilogue(`Keyboard mapping:\n${formatKeyTable(KEY_TABLE)}`),
  handler: async (argv) => {
    try {
      const config = resolveConfig({ host: argv.host, password: argv.password });
      await runInteractive(config.host);
    } catch (error) {
      printError(error, argv.json);
      process.exitCode = 1;
    }
  },
};

function runInteractive(host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const rokuDeploy = new RokuDeploy();
    const consoleSocket = openConsoleSocket(host);
    consoleSocket.on('data', (chunk) => process.stdout.write(chunk));
    consoleSocket.on('error', reject);

    process.stdout.write(HELP_TEXT);

    readline.emitKeypressEvents(process.stdin);
    const isRawCapable = Boolean(process.stdin.isTTY);
    if (isRawCapable) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    let closed = false;
    const cleanup = () => {
      if (closed) {
        return;
      }
      closed = true;
      process.stdin.removeListener('keypress', onKeypress);
      if (isRawCapable) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      consoleSocket.destroy();
      resolve();
    };

    const send = (key: RokuKey) => {
      rokuDeploy.keyPress({ host, key }).catch((error) => console.error(`Error: ${(error as Error).message}`));
    };

    const enterCommandMode = () => {
      process.stdin.removeListener('keypress', onKeypress);
      if (isRawCapable) {
        process.stdin.setRawMode(false);
      }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('console> ', (command) => {
        rl.close();
        const resume = () => {
          if (isRawCapable) {
            process.stdin.setRawMode(true);
          }
          process.stdin.on('keypress', onKeypress);
        };
        if (!command.trim()) {
          resume();
          return;
        }
        sendAndCollect(host, command, 500, 3000)
          .then((output) => console.log(output))
          .catch((error) => console.error(`Error: ${(error as Error).message}`))
          .finally(resume);
      });
    };

    function onKeypress(str: string | undefined, key: readline.Key): void {
      if ((key.ctrl && key.name === 'c') || str === 'q') {
        cleanup();
        return;
      }
      if (key.name === 'escape') {
        enterCommandMode();
        return;
      }
      const mapped = (key.name && NAMED_KEY_MAP[key.name]) ?? (str ? CHAR_KEY_MAP[str] : undefined);
      if (mapped) {
        send(mapped);
      }
    }

    process.stdin.on('keypress', onKeypress);
    process.once('SIGINT', cleanup);
  });
}
