import { RokuDeploy } from 'roku-deploy';
import type { RokuConfig } from '../config';

/**
 * roku-deploy v4 takes host/password on every call rather than a single configured instance,
 * so this just gives call sites one shared RokuDeploy instance plus the resolved config to
 * spread into each call's options.
 */
export function createRokuDeployClient(config: RokuConfig) {
  return {
    rokuDeploy: new RokuDeploy(),
    host: config.host,
    password: config.password,
  };
}
