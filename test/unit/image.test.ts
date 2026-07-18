import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Jimp } from 'jimp';
import { scaleImageFile } from '../../src/image';
import { captureScreenshot } from '../../src/commands/screenshot';

describe('scaleImageFile', () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rokubot-image-test-'));
    filePath = path.join(dir, 'test.png');
    const image = new Jimp({ width: 200, height: 100, color: 0xff0000ff });
    await image.write(filePath as `${string}.${string}`);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('halves both dimensions at scale 0.5', async () => {
    await scaleImageFile(filePath, 0.5);
    const resized = await Jimp.read(filePath);
    expect(resized.width).toBe(100);
    expect(resized.height).toBe(50);
  });

  it('leaves the image unchanged at scale 1', async () => {
    await scaleImageFile(filePath, 1);
    const resized = await Jimp.read(filePath);
    expect(resized.width).toBe(200);
    expect(resized.height).toBe(100);
  });
});

describe('captureScreenshot scale validation', () => {
  it('rejects a scale of 0 before making any network call', async () => {
    await expect(captureScreenshot({ host: 'unused', password: 'unused' }, undefined, 0)).rejects.toThrow(
      /Invalid --scale/,
    );
  });

  it('rejects a scale greater than 1 before making any network call', async () => {
    await expect(captureScreenshot({ host: 'unused', password: 'unused' }, undefined, 1.5)).rejects.toThrow(
      /Invalid --scale/,
    );
  });

  it('rejects a negative scale before making any network call', async () => {
    await expect(captureScreenshot({ host: 'unused', password: 'unused' }, undefined, -0.5)).rejects.toThrow(
      /Invalid --scale/,
    );
  });
});
