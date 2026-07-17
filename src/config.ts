import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

export interface RokuConfig {
  host: string;
  password: string;
}

export interface ConfigOverrides {
  host?: string;
  password?: string;
}

interface ConfigFileShape {
  host?: string;
  password?: string;
}

function readConfigFile(cwd: string): ConfigFileShape {
  const configPath = path.join(cwd, 'rokubot.config.json');
  if (!fs.existsSync(configPath)) {
    return {};
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw) as ConfigFileShape;
}

/**
 * Resolution order: CLI flags > ROKU_HOST/ROKU_PASSWORD env vars > .env in cwd > rokubot.config.json in cwd.
 * dotenv.config() only sets vars that aren't already in process.env, so an already-exported
 * ROKU_HOST/ROKU_PASSWORD naturally wins over .env without extra bookkeeping here.
 */
export function resolveConfig(overrides: ConfigOverrides = {}, cwd: string = process.cwd()): RokuConfig {
  dotenv.config({ path: path.join(cwd, '.env') });

  const fileConfig = readConfigFile(cwd);

  const host = overrides.host ?? process.env.ROKU_HOST ?? fileConfig.host;
  const password = overrides.password ?? process.env.ROKU_PASSWORD ?? fileConfig.password;

  if (!host || !password) {
    const missing = [!host && 'host', !password && 'password'].filter(Boolean).join(' and ');
    throw new Error(
      `Missing Roku ${missing}. Provide it via --host/--password, the ROKU_HOST/ROKU_PASSWORD ` +
        `environment variables, a .env file, or rokubot.config.json in the current directory.`,
    );
  }

  return { host, password };
}
