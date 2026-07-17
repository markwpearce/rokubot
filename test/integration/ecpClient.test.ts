import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as http from 'http';
import { EcpClient } from '../../src/ecp/client';

/**
 * Stand up a plain http.Server that mimics ECP responses instead of pulling in a mocking
 * library or requiring a real device - mirrors the approach roku-deploy itself uses for tests.
 */
describe('EcpClient', () => {
  let server: http.Server;
  let port: number;
  let requests: Array<{ method: string; url: string }> = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requests.push({ method: req.method ?? '', url: req.url ?? '' });

      if (req.url === '/query/active-app') {
        res.end('<app id="12345" version="1.0.0" subtype="rsg">My Channel</app>');
        return;
      }
      if (req.url === '/query/apps') {
        res.end(
          '<apps>' +
            '<app id="12" type="appl" version="1.2.3">Channel One</app>' +
            '<app id="dev" type="appl" version="0.0.1">Dev Channel</app>' +
            '</apps>',
        );
        return;
      }
      if (req.url?.startsWith('/launch/')) {
        res.statusCode = 200;
        res.end();
        return;
      }
      if (req.url === '/boom') {
        res.statusCode = 500;
        res.end('server error');
        return;
      }
      res.statusCode = 404;
      res.end('not found');
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

  beforeEach(() => {
    requests = [];
  });

  function client(): EcpClient {
    return new EcpClient({ host: '127.0.0.1', port });
  }

  it('parses active-app', async () => {
    const app = await client().getActiveApp();
    expect(app).toEqual({ id: '12345', title: 'My Channel' });
  });

  it('parses listApps', async () => {
    const apps = await client().listApps();
    expect(apps).toEqual([
      { id: '12', title: 'Channel One', type: 'appl', version: '1.2.3' },
      { id: 'dev', title: 'Dev Channel', type: 'appl', version: '0.0.1' },
    ]);
  });

  it('launch sends a POST to /launch/<id>?params', async () => {
    await client().launch('dev', { contentId: 'abc123' });
    expect(requests).toEqual([{ method: 'POST', url: '/launch/dev?contentId=abc123' }]);
  });

  it('launch defaults to the "dev" app id with no params', async () => {
    await client().launch();
    expect(requests).toEqual([{ method: 'POST', url: '/launch/dev' }]);
  });

  it('raw() exposes any path for anything not covered by a dedicated method', async () => {
    const body = await client().raw('GET', '/query/apps');
    expect(body).toContain('Channel One');
  });

  it('rejects on a non-2xx response', async () => {
    await expect(client().raw('GET', '/boom')).rejects.toThrow(/status 500/);
  });
});
