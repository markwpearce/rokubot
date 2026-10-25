import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  diffTextureReports,
  formatBytes,
  groupBitmapsByName,
  isUnnamedBitmap,
  largestBitmaps,
  parseR2d2Bitmaps,
  UNNAMED_BITMAPS,
  type TextureBitmap,
  type TextureReport,
} from '../../src/textures';
import { checkTextureAssertions } from '../../src/commands/textures';

// Trimmed from a real Roku Ultra (OS 15.3.4) response.
const fixtureXml = fs.readFileSync(path.join(__dirname, '../fixtures/r2d2-bitmaps.xml'), 'utf8');

function reportWith(bitmaps: TextureBitmap[], used: number): TextureReport {
  return {
    timestamp: 0,
    textureMemory: { used, available: 1000 - used, max: 1000 },
    bitmapCount: bitmaps.length,
    instances: [{ systemMemoryUsed: 0, textureMemory: { used, available: 1000 - used, max: 1000 }, bitmaps }],
  };
}

function bitmap(name: string, size: number, width = 10, height = 10): TextureBitmap {
  return { name, width, height, bpp: 4, size };
}

describe('parseR2d2Bitmaps', () => {
  const report = parseR2d2Bitmaps(fixtureXml);

  it('reads the header and every instance', () => {
    expect(report.timestamp).toBe(1792938647349);
    expect(report.channelId).toBe('dev');
    expect(report.instances).toHaveLength(2);
    expect(report.instances[1]?.systemMemoryUsed).toBe(16384);
    expect(report.bitmapCount).toBe(6);
  });

  it('totals usage across instances instead of trusting an idle one reporting the whole pool free', () => {
    expect(report.textureMemory).toEqual({ used: 236384256, available: 3615744, max: 240000000 });
  });

  it('reads each bitmap', () => {
    expect(report.instances[1]?.bitmaps[2]).toEqual({
      name: 'pkg:/sprites/tree2.png',
      width: 256,
      height: 256,
      bpp: 4,
      size: 262144,
    });
  });

  it('decodes XML entities in names', () => {
    const xml = fixtureXml.replace('pkg:/sprites/tree2.png', 'pkg:/a&amp;b.png');
    expect(parseR2d2Bitmaps(xml).instances[1]?.bitmaps[2]?.name).toBe('pkg:/a&b.png');
  });

  it('throws on a non-OK status', () => {
    expect(() => parseR2d2Bitmaps(fixtureXml.replace('<status>OK</status>', '<status>FAILED</status>'))).toThrow(/FAILED/);
  });

  it('throws on an unexpected response', () => {
    expect(() => parseR2d2Bitmaps('<apps></apps>')).toThrow(/r2d2-bitmaps/);
  });
});

describe('isUnnamedBitmap', () => {
  it('treats an address as unnamed and anything else as named', () => {
    expect(isUnnamedBitmap('WL-0x76f48e18')).toBe(true);
    expect(isUnnamedBitmap('')).toBe(true);
    expect(isUnnamedBitmap('pkg:/a.png')).toBe(false);
    expect(isUnnamedBitmap('604')).toBe(false);
  });
});

describe('largestBitmaps', () => {
  it('sorts by size and limits to the count', () => {
    const report = parseR2d2Bitmaps(fixtureXml);
    expect(largestBitmaps(report, 2).map((b) => b.name)).toEqual(['WL-0x68f8d3a0', 'pkg:/sprites/tree2.png']);
    expect(largestBitmaps(report)).toHaveLength(6);
  });
});

describe('groupBitmapsByName', () => {
  it('totals repeated names and puts every unnamed bitmap in one group', () => {
    const groups = groupBitmapsByName(parseR2d2Bitmaps(fixtureXml));
    expect(groups[0]).toEqual({ name: UNNAMED_BITMAPS, count: 2, size: 4734976 + 4096 });
    expect(groups.find((g) => g.name === '604')).toEqual({ name: '604', count: 2, size: 32768 });
  });
});

describe('diffTextureReports', () => {
  it('lists added and removed bitmaps and the change in usage', () => {
    const before = reportWith([bitmap('keep', 100), bitmap('gone', 50)], 150);
    const after = reportWith([bitmap('keep', 100), bitmap('new', 200)], 300);
    const diff = diffTextureReports(before, after);
    expect(diff.usedDelta).toBe(150);
    expect(diff.added.map((b) => b.name)).toEqual(['new']);
    expect(diff.removed.map((b) => b.name)).toEqual(['gone']);
  });

  it('matches repeated names by count', () => {
    const before = reportWith([bitmap('604', 10)], 10);
    const after = reportWith([bitmap('604', 10), bitmap('604', 10), bitmap('604', 10)], 30);
    expect(diffTextureReports(before, after).added).toHaveLength(2);
  });

  it('treats an address reused at a different size as removed and added', () => {
    const before = reportWith([bitmap('WL-0x1', 400, 10, 10)], 400);
    const after = reportWith([bitmap('WL-0x1', 1600, 20, 20)], 1600);
    const diff = diffTextureReports(before, after);
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(1);
  });
});

describe('formatBytes', () => {
  it('uses decimal units', () => {
    expect(formatBytes(240000000)).toBe('240.0 MB');
    expect(formatBytes(4096)).toBe('4.1 kB');
    expect(formatBytes(12)).toBe('12 B');
    expect(formatBytes(-1500000)).toBe('-1.5 MB');
  });
});

describe('checkTextureAssertions', () => {
  const memory = { used: 236_000_000, available: 4_000_000, max: 240_000_000 };

  it('passes when within limits or no limits are given', () => {
    expect(checkTextureAssertions(memory)).toEqual([]);
    expect(checkTextureAssertions(memory, 237, 3)).toEqual([]);
  });

  it('reports each limit that is broken', () => {
    expect(checkTextureAssertions(memory, 200, 10)).toHaveLength(2);
  });
});
