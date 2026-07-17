import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveConfig } from '../../src/config';

describe('resolveConfig', () => {
  let cwd: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'rokubot-config-test-'));
    delete process.env.ROKU_HOST;
    delete process.env.ROKU_PASSWORD;
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it('throws a helpful error when nothing is configured', () => {
    expect(() => resolveConfig({}, cwd)).toThrow(/Missing Roku host and password/);
  });

  it('falls back to rokubot.config.json in cwd', () => {
    fs.writeFileSync(path.join(cwd, 'rokubot.config.json'), JSON.stringify({ host: '10.0.0.5', password: 'file-pw' }));
    expect(resolveConfig({}, cwd)).toEqual({ host: '10.0.0.5', password: 'file-pw' });
  });

  it('env vars override the config file', () => {
    fs.writeFileSync(path.join(cwd, 'rokubot.config.json'), JSON.stringify({ host: '10.0.0.5', password: 'file-pw' }));
    process.env.ROKU_HOST = '10.0.0.9';
    process.env.ROKU_PASSWORD = 'env-pw';
    expect(resolveConfig({}, cwd)).toEqual({ host: '10.0.0.9', password: 'env-pw' });
  });

  it('CLI flag overrides override everything else', () => {
    process.env.ROKU_HOST = '10.0.0.9';
    process.env.ROKU_PASSWORD = 'env-pw';
    expect(resolveConfig({ host: '10.0.0.1', password: 'flag-pw' }, cwd)).toEqual({
      host: '10.0.0.1',
      password: 'flag-pw',
    });
  });

  it('partial overrides still require the missing piece from somewhere', () => {
    process.env.ROKU_HOST = '10.0.0.9';
    expect(() => resolveConfig({}, cwd)).toThrow(/Missing Roku password/);
  });
});
