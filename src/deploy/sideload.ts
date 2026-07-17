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

  let outDir: string;
  let outFile: string;

  if (isZip) {
    outDir = path.dirname(path.resolve(input.projectPathOrZip));
    outFile = path.basename(input.projectPathOrZip, '.zip');
  } else {
    const rootDir = path.resolve(input.projectPathOrZip);
    if (!fs.existsSync(path.join(rootDir, 'manifest'))) {
      throw new Error(`No 'manifest' file found in ${rootDir} - expected a Roku project root or a .zip file`);
    }
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rokubot-package-'));
    outFile = 'rokubot-package';
    await rokuDeploy.stage({ rootDir, stagingDir: path.join(outDir, '.staging') });
    await rokuDeploy.zip({ stagingDir: path.join(outDir, '.staging'), outDir, outFile });
  }

  const result = await rokuDeploy.sideload({
    host: config.host,
    password: config.password,
    outDir,
    outFile,
    deleteDevChannel: input.deleteDevChannel,
  });

  return { zipPath: path.join(outDir, `${outFile}.zip`), message: result.message };
}
