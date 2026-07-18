import { Jimp } from 'jimp';

/**
 * Scales an image file in place by the given factor (e.g. 0.5 halves both dimensions - a
 * quarter of the pixels). Useful for shrinking screenshots before an agent reads them, since
 * smaller images cost less to transmit/process without losing the info needed to pick a next action.
 */
export async function scaleImageFile(filePath: string, scale: number): Promise<void> {
  const image = await Jimp.read(filePath);
  image.scale(scale);
  // Jimp's write() type expects the path's extension as a literal type; filePath is a dynamic
  // string so it can't satisfy that statically even though the runtime behavior is fine.
  await image.write(filePath as `${string}.${string}`);
}
