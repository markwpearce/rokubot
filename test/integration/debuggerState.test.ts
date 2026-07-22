import { describe, it, expect, afterEach } from 'vitest';
import * as net from 'net';
import { checkDebuggerState } from '../../src/commands/console';

/**
 * A tiny fake debug-console server (port 8085 stand-in) whose behavior is driven by a callback,
 * so each test can simulate a different console scenario: idle, mid-crash replay, or currently
 * paused at the debugger prompt.
 */
function startFakeConsole(onConnect: (socket: net.Socket) => void): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve) => {
    const server = net.createServer(onConnect);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('server did not start with an address');
      }
      resolve({ server, port: address.port });
    });
  });
}

describe('checkDebuggerState', () => {
  let server: net.Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it('resolves false when the console stays quiet', async () => {
    const started = await startFakeConsole(() => {});
    server = started.server;

    const pausedAtBreakpoint = await checkDebuggerState('127.0.0.1', started.port, 50, 100);
    expect(pausedAtBreakpoint).toBe(false);
  });

  it('resolves false for stale scrollback that mentions the debugger prompt before the probe', async () => {
    const started = await startFakeConsole((socket) => {
      socket.write('Brightscript Debugger> \r\n');
    });
    server = started.server;

    const pausedAtBreakpoint = await checkDebuggerState('127.0.0.1', started.port, 50, 100);
    expect(pausedAtBreakpoint).toBe(false);
  });

  it('resolves true when the prompt reappears in response to the probe', async () => {
    const started = await startFakeConsole((socket) => {
      socket.on('data', () => {
        socket.write('Brightscript Debugger> \r\n');
      });
    });
    server = started.server;

    const pausedAtBreakpoint = await checkDebuggerState('127.0.0.1', started.port, 50, 200);
    expect(pausedAtBreakpoint).toBe(true);
  });

  it('is case-insensitive about the prompt text', async () => {
    const started = await startFakeConsole((socket) => {
      socket.on('data', () => {
        socket.write('BrightScript Debugger> \r\n');
      });
    });
    server = started.server;

    const pausedAtBreakpoint = await checkDebuggerState('127.0.0.1', started.port, 50, 200);
    expect(pausedAtBreakpoint).toBe(true);
  });
});
