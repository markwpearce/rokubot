import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { RokuDeploy } from 'roku-deploy';
import type { RokuConfig } from '../config';

export interface SideloadInput {
  /** Path to a Roku project's root folder (containing manifest/, source/, components/), or a pre-built .zip */
  projectPathOrZip: string;
  deleteDevChannel?: boolean;
}

export interface SideloadResult {
  zipPath: string;
  message: string;
}

/**
 * Works against any Roku project - no assumption about how the caller builds it. If given a
 * directory, stages+zips it fresh; if given an existing .zip, sideloads it directly.
 */
export async function sideload(config: RokuConfig, input: SideloadInput): Promise<SideloadResult> {
  const rokuDeploy = new RokuDeploy();
  const isZip = input.projectPathOrZip.toLowerCase().endsWith('.zip');

  let zipPath: string;

  if (isZip) {
    zipPath = path.resolve(input.projectPathOrZip);
  } else {
    const rootDir = path.resolve(input.projectPathOrZip);
    if (!fs.existsSync(path.join(rootDir, 'manifest'))) {
      throw new Error(`No 'manifest' file found in ${rootDir} - expected a Roku project root or a .zip file`);
    }
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rokubot-package-'));
    const stagingDir = path.join(outDir, '.staging');
    await rokuDeploy.stage({ rootDir, out: stagingDir });
    ({ zipPath } = await rokuDeploy.zip({ dir: stagingDir, out: path.join(outDir, 'rokubot-package.zip') }));
  }

  const result = await rokuDeploy.sideload({
    device: { host: config.host },
    password: config.password,
    zip: zipPath,
    deleteDevChannel: input.deleteDevChannel,
  });

  return { zipPath, message: result.message };
}
