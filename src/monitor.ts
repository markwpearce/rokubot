import { formatBytes } from './textures';
import { summarize, type Summary } from './sampling';

export const MONITOR_METRICS = ['perf', 'textures', 'fps'] as const;
export type MonitorMetric = (typeof MONITOR_METRICS)[number];

/** One row of the monitor timeline. A metric is missing when it wasn't requested or its query failed. */
export interface MonitorSample {
  /** Seconds since monitoring started. */
  elapsed: number;
  timestamp: number;
  /** The key-script step that was running, or "start" before the first key. */
  step: string;
  cpuPercent?: number;
  memoryUsed?: number;
  textureUsed?: number;
  textureMax?: number;
  fps?: number;
  /** How long this sample's ECP queries took together - a rough measure of polling overhead. */
  queryMs: number;
  errors?: string[];
}

export interface MonitorStepSummary {
  step: string;
  samples: number;
  cpuPercent?: Summary;
  memoryUsed?: Summary;
  textureUsed?: Summary;
  fps?: Summary;
}

export interface MonitorSummary {
  samples: number;
  queryMs?: Summary;
  overall: MonitorStepSummary;
  /** Only when a key script ran: one entry per step, in the order they ran. */
  steps?: MonitorStepSummary[];
}

export const MONITOR_CSV_COLUMNS = [
  'elapsed',
  'timestamp',
  'step',
  'cpuPercent',
  'memoryUsed',
  'textureUsed',
  'textureMax',
  'fps',
  'queryMs',
  'errors',
];

export function monitorCsvRow(sample: MonitorSample) {
  return { ...sample, errors: sample.errors?.join('; ') };
}

function values(samples: MonitorSample[], key: 'cpuPercent' | 'memoryUsed' | 'textureUsed' | 'fps'): number[] {
  return samples.flatMap((sample) => (sample[key] === undefined ? [] : [sample[key]!]));
}

function summarizeStep(step: string, samples: MonitorSample[]): MonitorStepSummary {
  return {
    step,
    samples: samples.length,
    cpuPercent: summarize(values(samples, 'cpuPercent')),
    memoryUsed: summarize(values(samples, 'memoryUsed')),
    textureUsed: summarize(values(samples, 'textureUsed')),
    fps: summarize(values(samples, 'fps')),
  };
}

export function summarizeMonitor(samples: MonitorSample[], withSteps: boolean): MonitorSummary {
  const summary: MonitorSummary = {
    samples: samples.length,
    queryMs: summarize(samples.map((sample) => sample.queryMs)),
    overall: summarizeStep('all', samples),
  };
  if (withSteps) {
    const byStep = new Map<string, MonitorSample[]>();
    for (const sample of samples) {
      byStep.set(sample.step, [...(byStep.get(sample.step) ?? []), sample]);
    }
    summary.steps = [...byStep].map(([step, stepSamples]) => summarizeStep(step, stepSamples));
  }
  return summary;
}

/** Splits `--keys "down down" select` into one key per step. */
export function parseKeyScript(keys: string[]): string[] {
  return keys.flatMap((entry) => entry.split(/[\s,]+/)).filter(Boolean);
}

export function stepLabel(index: number, key: string): string {
  return `${index + 1} ${key}`;
}

const dash = '-';

export function formatCell(value: number | undefined, format: (value: number) => string): string {
  return value === undefined ? dash : format(value);
}

export const formatPercent = (value: number) => `${value.toFixed(1)}%`;
export const formatFps = (value: number) => value.toFixed(1);

export const MONITOR_TABLE_HEADER = `${'time'.padStart(7)}  ${'cpu'.padStart(6)}  ${'memory'.padStart(9)}  ${'texture'.padStart(9)}  ${'fps'.padStart(5)}  ${'query'.padStart(6)}  step`;

export function monitorTableRow(sample: MonitorSample): string {
  return [
    `${sample.elapsed.toFixed(1)}s`.padStart(7),
    formatCell(sample.cpuPercent, formatPercent).padStart(6),
    formatCell(sample.memoryUsed, formatBytes).padStart(9),
    formatCell(sample.textureUsed, formatBytes).padStart(9),
    formatCell(sample.fps, formatFps).padStart(5),
    `${Math.round(sample.queryMs)}ms`.padStart(6),
    sample.step + (sample.errors?.length ? `  (${sample.errors.length} failed)` : ''),
  ].join('  ');
}

function stepRow(step: MonitorStepSummary): string {
  return [
    step.step.padEnd(16),
    String(step.samples).padStart(7),
    formatCell(step.cpuPercent?.avg, formatPercent).padStart(8),
    formatCell(step.memoryUsed?.max, formatBytes).padStart(9),
    formatCell(step.textureUsed?.max, formatBytes).padStart(11),
    formatCell(step.fps?.avg, formatFps).padStart(7),
    formatCell(step.fps?.p5, formatFps).padStart(6),
  ].join('  ');
}

export function renderMonitorSummary(summary: MonitorSummary): string {
  const header = [
    'step'.padEnd(16),
    'samples'.padStart(7),
    'avg cpu'.padStart(8),
    'max mem'.padStart(9),
    'max texture'.padStart(11),
    'avg fps'.padStart(7),
    'p5 fps'.padStart(6),
  ].join('  ');
  const lines = ['', header, ...(summary.steps ?? []).map(stepRow), stepRow(summary.overall)];
  if (summary.queryMs) {
    lines.push('', `ECP query time per sample: avg ${Math.round(summary.queryMs.avg)}ms, max ${Math.round(summary.queryMs.max)}ms`);
  }
  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface ChartSpec {
  title: string;
  key: 'cpuPercent' | 'memoryUsed' | 'textureUsed' | 'fps';
  format: (value: number) => string;
  /** Fixed top of the y axis, e.g. the texture pool size; otherwise the largest value. */
  max?: number;
}

const CHART_WIDTH = 760;
const CHART_HEIGHT = 160;
const PAD = { left: 64, right: 12, top: 12, bottom: 24 };

function chart(spec: ChartSpec, samples: MonitorSample[], duration: number, stepStarts: MonitorSample[]): string {
  const points = samples.filter((sample) => sample[spec.key] !== undefined);
  if (points.length === 0) {
    return '';
  }
  const top = Math.max(spec.max ?? 0, ...points.map((sample) => sample[spec.key]!)) || 1;
  const plotWidth = CHART_WIDTH - PAD.left - PAD.right;
  const plotHeight = CHART_HEIGHT - PAD.top - PAD.bottom;
  const x = (elapsed: number) => PAD.left + (duration > 0 ? (elapsed / duration) * plotWidth : 0);
  const y = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;
  const line = points.map((sample) => `${x(sample.elapsed).toFixed(1)},${y(sample[spec.key]!).toFixed(1)}`).join(' ');
  const markers = stepStarts
    .map(
      (sample) =>
        `<line class="step" x1="${x(sample.elapsed).toFixed(1)}" x2="${x(sample.elapsed).toFixed(1)}" y1="${PAD.top}" y2="${PAD.top + plotHeight}"><title>${escapeHtml(sample.step)}</title></line>`,
    )
    .join('');
  return `<section>
<h2>${escapeHtml(spec.title)}</h2>
<svg viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="${escapeHtml(spec.title)} over time">
<line class="axis" x1="${PAD.left}" x2="${CHART_WIDTH - PAD.right}" y1="${PAD.top + plotHeight}" y2="${PAD.top + plotHeight}"/>
<line class="grid" x1="${PAD.left}" x2="${CHART_WIDTH - PAD.right}" y1="${PAD.top}" y2="${PAD.top}"/>
<text x="${PAD.left - 6}" y="${PAD.top + 4}" text-anchor="end">${escapeHtml(spec.format(top))}</text>
<text x="${PAD.left - 6}" y="${PAD.top + plotHeight + 4}" text-anchor="end">0</text>
<text x="${PAD.left}" y="${CHART_HEIGHT - 4}">0s</text>
<text x="${CHART_WIDTH - PAD.right}" y="${CHART_HEIGHT - 4}" text-anchor="end">${duration.toFixed(1)}s</text>
${markers}
<polyline points="${line}"/>
</svg>
</section>`;
}

function summaryTableHtml(summary: MonitorSummary): string {
  const rows = [...(summary.steps ?? []), summary.overall]
    .map(
      (step) =>
        `<tr><td>${escapeHtml(step.step)}</td><td>${step.samples}</td><td>${formatCell(step.cpuPercent?.avg, formatPercent)}</td>` +
        `<td>${formatCell(step.memoryUsed?.max, formatBytes)}</td><td>${formatCell(step.textureUsed?.max, formatBytes)}</td>` +
        `<td>${formatCell(step.fps?.avg, formatFps)}</td><td>${formatCell(step.fps?.p5, formatFps)}</td></tr>`,
    )
    .join('\n');
  return `<table>
<thead><tr><th>Step</th><th>Samples</th><th>Avg CPU</th><th>Max memory</th><th>Max texture</th><th>Avg fps</th><th>p5 fps</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
}

/** A self-contained page (no scripts or external assets) with one chart per metric, for sharing a run. */
export function renderMonitorHtml(samples: MonitorSample[], summary: MonitorSummary, title: string): string {
  const duration = samples.length > 0 ? samples[samples.length - 1]!.elapsed : 0;
  const stepStarts = samples.filter((sample, index) => index > 0 && sample.step !== samples[index - 1]!.step);
  const textureMax = Math.max(0, ...samples.map((sample) => sample.textureMax ?? 0)) || undefined;
  const charts = [
    chart({ title: 'CPU', key: 'cpuPercent', format: formatPercent }, samples, duration, stepStarts),
    chart({ title: 'Memory used', key: 'memoryUsed', format: formatBytes }, samples, duration, stepStarts),
    chart({ title: 'Texture memory used', key: 'textureUsed', format: formatBytes, max: textureMax }, samples, duration, stepStarts),
    chart({ title: 'Graphics fps', key: 'fps', format: formatFps }, samples, duration, stepStarts),
  ].join('\n');
  const started = samples[0] ? new Date(samples[0].timestamp).toLocaleString() : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { --bg: #ffffff; --fg: #1d1d1f; --muted: #6e6e73; --line: #2563eb; --rule: #d2d2d7; --step: #d97706; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #161618; --fg: #f5f5f7; --muted: #a1a1a6; --line: #60a5fa; --rule: #3a3a3c; --step: #fbbf24; }
}
body { background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, sans-serif; margin: 0 auto; max-width: 800px; padding: 16px; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 15px; margin: 24px 0 4px; }
p { color: var(--muted); margin: 0; }
svg { width: 100%; height: auto; }
svg text { fill: var(--muted); font-size: 11px; }
svg polyline { fill: none; stroke: var(--line); stroke-width: 1.5; }
svg .axis { stroke: var(--rule); }
svg .grid { stroke: var(--rule); stroke-dasharray: 2 3; }
svg .step { stroke: var(--step); stroke-dasharray: 3 3; }
table { border-collapse: collapse; margin-top: 24px; width: 100%; font-variant-numeric: tabular-nums; }
th, td { border-bottom: 1px solid var(--rule); padding: 4px 8px; text-align: right; }
th:first-child, td:first-child { text-align: left; }
.table { overflow-x: auto; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${samples.length} samples over ${duration.toFixed(1)}s${started ? `, started ${escapeHtml(started)}` : ''}. Dashed lines mark key-script steps (hover for the key).</p>
${charts}
<div class="table">${summaryTableHtml(summary)}</div>
</body>
</html>
`;
}
