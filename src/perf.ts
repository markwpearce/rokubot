import { block, checkEcpStatus, field, numberField } from './ecp/xml';

/** App memory in bytes, as reported by ECP `query/chanperf`. Only `used` is always present. */
export interface ChanperfMemory {
  used: number;
  res?: number;
  anon?: number;
  swap?: number;
  file?: number;
  shared?: number;
  /** The most memory the app may use before the OS kills it. Not in Roku's docs, but reported by OS 15.3. */
  limit?: number;
}

export interface ChanperfCpu {
  /** Percent of one CPU, averaged over `durationSeconds`. */
  user: number;
  sys: number;
  total: number;
  durationSeconds?: number;
}

/** One `query/chanperf` reading. */
export interface ChanperfSample {
  timestamp: number;
  appId?: string;
  /** Documented as reported when a specific app id is queried, though OS 15.3 leaves it out for a sideloaded app. */
  pid?: number;
  cpu: ChanperfCpu;
  memory: ChanperfMemory;
  /** Raw Linux `/proc/<pid>/stat` fields, Roku OS 15.2+. */
  procStat?: Record<string, string>;
}

export function parseChanperf(xml: string): ChanperfSample {
  checkEcpStatus(
    xml,
    'query/chanperf',
    'is an app running in the foreground, with developer mode and "Control by mobile apps" enabled?',
  );
  if (!xml.includes('<chanperf')) {
    throw new Error('Unexpected response from query/chanperf (no <chanperf> element)');
  }
  const plugin = block(xml, 'plugin') ?? xml;
  const cpuXml = block(plugin, 'cpu-percent') ?? '';
  const memoryXml = block(plugin, 'memory') ?? '';
  const user = numberField(cpuXml, 'user') ?? 0;
  const sys = numberField(cpuXml, 'sys') ?? 0;

  const sample: ChanperfSample = {
    timestamp: numberField(xml, 'timestamp') ?? Date.now(),
    appId: field(plugin, 'id') || undefined,
    pid: numberField(block(plugin, 'unsecured') ?? '', 'process-id'),
    cpu: { user, sys, total: user + sys, durationSeconds: numberField(cpuXml, 'duration-seconds') },
    memory: {
      used: numberField(memoryXml, 'used') ?? 0,
      res: numberField(memoryXml, 'res'),
      anon: numberField(memoryXml, 'anon'),
      swap: numberField(memoryXml, 'swap'),
      file: numberField(memoryXml, 'file'),
      shared: numberField(memoryXml, 'shared'),
      limit: numberField(memoryXml, 'limit'),
    },
  };

  const procStatXml = block(plugin, 'proc-stat');
  if (procStatXml !== undefined) {
    const procStat: Record<string, string> = {};
    for (const match of procStatXml.matchAll(/<([\w-]+)(?:\s[^>]*)?>([^<]*)<\/\1>/g)) {
      procStat[match[1]!] = match[2]!.trim();
    }
    for (const match of (xml.match(/<proc-stat\s([^>]*)>/)?.[1] ?? '').matchAll(/([\w-]+)="([^"]*)"/g)) {
      procStat[match[1]!] = match[2]!;
    }
    sample.procStat = procStat;
  }
  return sample;
}
