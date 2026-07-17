import * as http from 'http';

export interface EcpClientOptions {
  host: string;
  /** Defaults to the real ECP port (8060); overridable so tests can target a local fixture server. */
  port?: number;
  timeoutMs?: number;
}

export interface RokuApp {
  id: string;
  title: string;
  type?: string;
  version?: string;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_ECP_PORT = 8060;

function request(
  host: string,
  port: number,
  method: 'GET' | 'POST',
  urlPath: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port, path: urlPath, method, timeout: timeoutMs },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`ECP ${method} ${urlPath} failed with status ${res.statusCode}: ${data}`));
            return;
          }
          resolve(data);
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timed out calling ECP ${method} ${urlPath}`));
    });
    req.end();
  });
}

function parseAttr(xml: string, tag: string, attr: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*\\b${attr}="([^"]*)"`);
  return xml.match(re)?.[1];
}

/**
 * Thin generic ECP HTTP client. roku-deploy's RokuDeploy class doesn't expose a way to hit
 * arbitrary ECP endpoints (only curated operations like keyPress/captureScreenshot/sideload),
 * so this fills that gap for /query/* and /launch/* and doubles as an escape hatch for anything
 * not covered by a dedicated rokubot command.
 */
export class EcpClient {
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;

  constructor(options: EcpClientOptions) {
    this.host = options.host;
    this.port = options.port ?? DEFAULT_ECP_PORT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Raw escape hatch: call any ECP path directly. */
  async raw(method: 'GET' | 'POST', urlPath: string): Promise<string> {
    return request(this.host, this.port, method, urlPath, this.timeoutMs);
  }

  async getActiveApp(): Promise<{ id: string; title?: string } | undefined> {
    const xml = await request(this.host, this.port, 'GET', '/query/active-app', this.timeoutMs);
    const id = parseAttr(xml, 'app', 'id');
    if (!id) {
      return undefined;
    }
    const title = xml.match(/<app[^>]*>([^<]*)<\/app>/)?.[1]?.trim();
    return { id, title: title || undefined };
  }

  async listApps(): Promise<RokuApp[]> {
    const xml = await request(this.host, this.port, 'GET', '/query/apps', this.timeoutMs);
    const apps: RokuApp[] = [];
    const appRe = /<app\s+([^>]*)>([^<]*)<\/app>/g;
    let match: RegExpExecArray | null;
    while ((match = appRe.exec(xml)) !== null) {
      const attrs = match[1] ?? '';
      const id = attrs.match(/\bid="([^"]*)"/)?.[1];
      if (!id) {
        continue;
      }
      apps.push({
        id,
        title: (match[2] ?? '').trim(),
        type: attrs.match(/\btype="([^"]*)"/)?.[1],
        version: attrs.match(/\bversion="([^"]*)"/)?.[1],
      });
    }
    return apps;
  }

  /** Launch (or deep-link into) an app. appId defaults to "dev", the id a sideloaded channel always runs as. */
  async launch(appId: string = 'dev', params: Record<string, string> = {}): Promise<void> {
    const query = new URLSearchParams(params).toString();
    const urlPath = `/launch/${encodeURIComponent(appId)}${query ? `?${query}` : ''}`;
    await request(this.host, this.port, 'POST', urlPath, this.timeoutMs);
  }
}
