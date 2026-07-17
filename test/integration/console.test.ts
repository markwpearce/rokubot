import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as net from 'net';
import { sendAndCollect } from '../../src/commands/console';

/**
 * A tiny fake debug-console server: echoes back a canned response for whatever line it
 * receives, simulating a Roku BrightScript debugger session over telnet (port 8085).
 */
describe('sendAndCollect', () => {
  let server: net.Server;
  let port: number;

  beforeAll(async () => {
    server = net.createServer((socket) => {
      socket.on('data', (chunk) => {
        const command = chunk.toString().trim();
        if (command === 'print 1+1') {
          socket.write('2\r\n');
        } else {
          socket.write(`Syntax Error: ${command}\r\n`);
        }
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('server did not start with an address');
        }
        port = address.port;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  it('sends a command and collects the response until the console goes quiet', async () => {
    const output = await sendAndCollect('127.0.0.1', 'print 1+1', 200, 2000, port);
    expect(output.trim()).toBe('2');
  });

  it('returns whatever came back for an unrecognized command', async () => {
    const output = await sendAndCollect('127.0.0.1', 'garbage', 200, 2000, port);
    expect(output.trim()).toBe('Syntax Error: garbage');
  });
});
