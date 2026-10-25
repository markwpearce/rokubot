/** One bitmap in texture memory, as reported by ECP `query/r2d2-bitmaps`. */
export interface TextureBitmap {
  /** A file path (`pkg:/images/a.png`), a font (`Font: ...`), or an address (`WL-0x...`) for a bitmap the app created itself. */
  name: string;
  width: number;
  height: number;
  bpp: number;
  /** Bytes of texture memory used, including padding. */
  size: number;
}

export interface TextureMemory {
  used: number;
  available: number;
  max: number;
}

/** One `<rographics>` instance. A device can report several; they share one texture memory pool. */
export interface GraphicsInstance {
  systemMemoryUsed: number;
  textureMemory: TextureMemory;
  bitmaps: TextureBitmap[];
}

export interface TextureReport {
  timestamp: number;
  channelId?: string;
  /** Texture memory across all instances. */
  textureMemory: TextureMemory;
  bitmapCount: number;
  instances: GraphicsInstance[];
}

export interface BitmapGroup {
  name: string;
  count: number;
  size: number;
}

export interface TextureDiff {
  usedDelta: number;
  before: TextureMemory;
  after: TextureMemory;
  added: TextureBitmap[];
  removed: TextureBitmap[];
}

/** Bitmaps the app created itself have no name, only an address. */
export const UNNAMED_BITMAPS = '(unnamed)';

function tagText(xml: string, tag: string): string | undefined {
  return xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1]?.trim();
}

function tagNumber(xml: string, tag: string): number {
  return Number(tagText(xml, tag) ?? 0);
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseTextureMemory(xml: string): TextureMemory {
  const block = xml.match(/<texture-memory>([\s\S]*?)<\/texture-memory>/)?.[1] ?? '';
  return { used: tagNumber(block, 'used'), available: tagNumber(block, 'available'), max: tagNumber(block, 'max') };
}

export function parseR2d2Bitmaps(xml: string): TextureReport {
  const status = tagText(xml, 'status');
  if (status && status !== 'OK') {
    throw new Error(`query/r2d2-bitmaps returned status ${status} - this is sometimes transient, so try again`);
  }
  if (!xml.includes('<r2d2-bitmaps')) {
    throw new Error('Unexpected response from query/r2d2-bitmaps (no <r2d2-bitmaps> element)');
  }

  const instances: GraphicsInstance[] = [];
  for (const match of xml.matchAll(/<rographics>([\s\S]*?)<\/rographics>/g)) {
    const block = match[1] ?? '';
    // Roku spells it "sytem-memory"; accept the correct spelling too in case that's ever fixed.
    const systemBlock = block.match(/<sy(?:s)?tem-memory>([\s\S]*?)<\/sy(?:s)?tem-memory>/)?.[1] ?? '';
    const bitmaps: TextureBitmap[] = [];
    for (const bitmapMatch of block.matchAll(/<bitmap>([\s\S]*?)<\/bitmap>/g)) {
      const bitmapXml = bitmapMatch[1] ?? '';
      bitmaps.push({
        name: decodeXml(tagText(bitmapXml, 'name') ?? ''),
        width: tagNumber(bitmapXml, 'width'),
        height: tagNumber(bitmapXml, 'height'),
        bpp: tagNumber(bitmapXml, 'bpp'),
        size: tagNumber(bitmapXml, 'size'),
      });
    }
    instances.push({ systemMemoryUsed: tagNumber(systemBlock, 'used'), textureMemory: parseTextureMemory(block), bitmaps });
  }

  return {
    timestamp: tagNumber(xml, 'timestamp'),
    channelId: tagText(xml, 'channel-id') || undefined,
    textureMemory: combineTextureMemory(instances),
    bitmapCount: instances.reduce((total, instance) => total + instance.bitmaps.length, 0),
    instances,
  };
}

/**
 * Instances share one pool - each reports the same max - but an idle instance still reports the
 * whole pool as available, so total the usage rather than trusting any one instance's `available`.
 */
function combineTextureMemory(instances: GraphicsInstance[]): TextureMemory {
  if (instances.length === 0) {
    return { used: 0, available: 0, max: 0 };
  }
  const max = Math.max(...instances.map((instance) => instance.textureMemory.max));
  const used = instances.reduce((total, instance) => total + instance.textureMemory.used, 0);
  return { used, available: Math.max(0, max - used), max };
}

export function allBitmaps(report: TextureReport): TextureBitmap[] {
  return report.instances.flatMap((instance) => instance.bitmaps);
}

export function isUnnamedBitmap(name: string): boolean {
  return name === '' || /^WL-0x[0-9a-f]+$/i.test(name);
}

export function largestBitmaps(report: TextureReport, count?: number): TextureBitmap[] {
  const sorted = [...allBitmaps(report)].sort((a, b) => b.size - a.size);
  return count === undefined ? sorted : sorted.slice(0, count);
}

/** Totals by name, with every unnamed bitmap in one group, largest first. */
export function groupBitmapsByName(report: TextureReport): BitmapGroup[] {
  const groups = new Map<string, BitmapGroup>();
  for (const bitmap of allBitmaps(report)) {
    const name = isUnnamedBitmap(bitmap.name) ? UNNAMED_BITMAPS : bitmap.name;
    const group = groups.get(name) ?? { name, count: 0, size: 0 };
    group.count++;
    group.size += bitmap.size;
    groups.set(name, group);
  }
  return [...groups.values()].sort((a, b) => b.size - a.size);
}

function bitmapKey(bitmap: TextureBitmap): string {
  return `${bitmap.name}|${bitmap.width}x${bitmap.height}|${bitmap.bpp}|${bitmap.size}`;
}

function countByKey(bitmaps: TextureBitmap[]): Map<string, TextureBitmap[]> {
  const byKey = new Map<string, TextureBitmap[]>();
  for (const bitmap of bitmaps) {
    const key = bitmapKey(bitmap);
    byKey.set(key, [...(byKey.get(key) ?? []), bitmap]);
  }
  return byKey;
}

/**
 * Bitmaps are matched by name and dimensions, so an address reused for a different-sized
 * bitmap counts as one removed and one added. Names can repeat, so each is matched by count.
 */
export function diffTextureReports(before: TextureReport, after: TextureReport): TextureDiff {
  const beforeByKey = countByKey(allBitmaps(before));
  const afterByKey = countByKey(allBitmaps(after));
  const added: TextureBitmap[] = [];
  const removed: TextureBitmap[] = [];
  for (const [key, afterBitmaps] of afterByKey) {
    added.push(...afterBitmaps.slice(beforeByKey.get(key)?.length ?? 0));
  }
  for (const [key, beforeBitmaps] of beforeByKey) {
    removed.push(...beforeBitmaps.slice(afterByKey.get(key)?.length ?? 0));
  }
  const bySizeDescending = (a: TextureBitmap, b: TextureBitmap) => b.size - a.size;
  return {
    usedDelta: after.textureMemory.used - before.textureMemory.used,
    before: before.textureMemory,
    after: after.textureMemory,
    added: added.sort(bySizeDescending),
    removed: removed.sort(bySizeDescending),
  };
}

/** Texture memory is quoted in decimal megabytes (a 240000000-byte pool is "240 MB"). */
export function formatBytes(bytes: number): string {
  const sign = bytes < 0 ? '-' : '';
  const value = Math.abs(bytes);
  if (value >= 1_000_000) {
    return `${sign}${(value / 1_000_000).toFixed(1)} MB`;
  }
  if (value >= 1_000) {
    return `${sign}${(value / 1_000).toFixed(1)} kB`;
  }
  return `${sign}${value} B`;
}
