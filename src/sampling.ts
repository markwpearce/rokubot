import * as fs from 'fs';

export interface Summary {
  count: number;
  min: number;
  max: number;
  avg: number;
  /** 5th percentile - the "worst normal" reading for fps, where a low value is the bad one. */
  p5: number;
  p95: number;
}

/** Nearest-rank percentile of already-sorted values. */
function percentile(sorted: number[], p: number): number {
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
}

export function summarize(values: number[]): Summary | undefined {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return undefined;
  }
  const sorted = [...finite].sort((a, b) => a - b);
  return {
    count: sorted.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    avg: sorted.reduce((total, value) => total + value, 0) / sorted.length,
    p5: percentile(sorted, 5),
    p95: percentile(sorted, 95),
  };
}

export interface SampleLoopOptions {
  intervalSeconds: number;
  /** Stop after this long. Omit to run until stop() resolves or Ctrl+C. */
  durationSeconds?: number;
  /** Resolves when sampling should end early, e.g. once a key script finishes. */
  stop?: Promise<void>;
  /** Called once per tick with the seconds elapsed since the loop started. */
  tick: (elapsedSeconds: number) => Promise<void>;
}

/**
 * Ticks on a fixed schedule from the start time rather than sleeping a fixed interval after each
 * tick, so a slow ECP query doesn't make samples drift further apart over a long run. Ctrl+C ends
 * the loop (instead of the process) so the caller still gets to print its summary.
 */
export async function sampleLoop(options: SampleLoopOptions): Promise<void> {
  let stopped = false;
  let wake: (() => void) | undefined;
  const stop = () => {
    stopped = true;
    wake?.();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  void options.stop?.then(stop);
  try {
    const start = Date.now();
    for (let tick = 0; !stopped; tick++) {
      const elapsedSeconds = (Date.now() - start) / 1000;
      if (options.durationSeconds !== undefined && elapsedSeconds >= options.durationSeconds) {
        break;
      }
      await options.tick(elapsedSeconds);
      const nextAt = start + (tick + 1) * options.intervalSeconds * 1000;
      const waitMs = Math.max(0, nextAt - Date.now());
      if (!stopped && waitMs > 0) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, waitMs);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

export function validateSampling(intervalSeconds: number, durationSeconds?: number): void {
  if (!(intervalSeconds > 0)) {
    throw new Error(`Invalid --interval '${intervalSeconds}' - must be a number of seconds greater than 0`);
  }
  if (durationSeconds !== undefined && !(durationSeconds > 0)) {
    throw new Error(`Invalid --duration '${durationSeconds}' - must be a number of seconds greater than 0`);
  }
}

export type CsvRow = Record<string, string | number | null | undefined>;

function csvCell(value: string | number | null | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvHeader(columns: string[]): string {
  return columns.map(csvCell).join(',');
}

export function csvLine(columns: string[], row: CsvRow): string {
  return columns.map((column) => csvCell(row[column])).join(',');
}

export function toCsv(columns: string[], rows: CsvRow[]): string {
  return [csvHeader(columns), ...rows.map((row) => csvLine(columns, row))].join('\n') + '\n';
}

/** `--out` writes CSV for a `.csv` file and JSON for anything else. */
export function writeSamplesFile(file: string, columns: string[], rows: CsvRow[], json: unknown): void {
  if (file.toLowerCase().endsWith('.csv')) {
    fs.writeFileSync(file, toCsv(columns, rows));
  } else {
    fs.writeFileSync(file, JSON.stringify(json, null, 2));
  }
}

export function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
