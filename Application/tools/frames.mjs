#!/usr/bin/env node
/**
 * Capture per-frame render timings from a running Android app and draw them as a chart.
 *
 *   node frames.mjs <package> [outfile.html]
 *
 * Reads `dumpsys gfxinfo <pkg> framestats`, which reports nanosecond timestamps for every frame the
 * app has drawn recently (the buffer holds ~120). Frame time is FrameCompleted - IntendedVsync: the
 * whole trip from "the display asked for a frame" to "the frame was done", which is what the user
 * actually perceives as smooth or not.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const pkg = process.argv[2];
const out = process.argv.find((a, i) => i > 2 && !a.startsWith('--')) ?? 'frames.html';
const recordAt = process.argv.indexOf('--record');
const seconds = recordAt > 0 ? Number(process.argv[recordAt + 1] ?? 10) : 0;

if (!pkg)
{
    console.error('usage: node frames.mjs <package> [out.html] [--record <seconds>]');
    process.exit(1);
}

const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const dump = () => adb('shell', 'dumpsys', 'gfxinfo', pkg, 'framestats');

/**
 * Newest IntendedVsync currently in the buffer.
 *
 * `framestats` is a ring of roughly the last 120 frames and `gfxinfo reset` does NOT clear it, so a
 * naive read mixes in whatever came before — app startup especially, which is far slower than steady
 * state and drags every percentile up. Recording a baseline first and keeping only newer frames is
 * what makes the window mean what it says.
 */
const newest = (text) =>
{
    let max = 0;

    for (const block of text.split('---PROFILEDATA---').slice(1))
    {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        const head = lines.find((l) => l.startsWith('Flags,'));

        if (head === undefined) continue;

        const i = head.split(',').indexOf('IntendedVsync');

        for (const line of lines)
        {
            if (line === head || !/^\d/.test(line)) continue;

            max = Math.max(max, Number(line.split(',')[i]) || 0);
        }
    }

    return max;
};

let floor = 0;

if (seconds > 0)
{
    floor = newest(dump());

    console.log(`recording ${seconds}s — interact with the app now...`);

    execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${seconds * 1000})`]);
}

const raw = dump();

// Each profile block is one ViewRootImpl and carries its own header. Column count and order have
// changed across Android releases, so the header is read rather than assumed.
const frames = [];

for (const block of raw.split('---PROFILEDATA---').slice(1))
{
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const head = lines.find((l) => l.startsWith('Flags,'));

    if (head === undefined) continue;

    const cols = head.split(',');
    const iFlags = cols.indexOf('Flags');
    const iIntended = cols.indexOf('IntendedVsync');
    const iCompleted = cols.indexOf('FrameCompleted');
    const iDequeue = cols.indexOf('DequeueBufferDuration');

    if (iIntended < 0 || iCompleted < 0) continue;

    for (const line of lines)
    {
        if (line === head || !/^\d/.test(line)) continue;

        const cells = line.split(',');

        // Bit 0 marks a frame the platform itself says not to measure (first draw, layout change).
        if ((Number(cells[iFlags]) & 1) !== 0) continue;

        const intended = Number(cells[iIntended]);
        const completed = Number(cells[iCompleted]);

        if (!Number.isFinite(intended) || !Number.isFinite(completed) || completed <= intended) continue;
        if (intended <= floor) continue;

        // The platform's own percentiles forgive time spent blocked waiting for a display buffer:
        // that is the pipeline backed up, not the app being slow. Matching it keeps these numbers
        // comparable with `dumpsys gfxinfo` and Perfetto. The raw latency is kept alongside.
        const dequeue = iDequeue >= 0 ? (Number(cells[iDequeue]) || 0) : 0;

        frames.push({
            work: Math.max(0, completed - intended - dequeue) / 1e6,
            total: (completed - intended) / 1e6
        });
    }
}

if (frames.length === 0)
{
    console.error('no frames captured — interact with the app, then run again');
    process.exit(2);
}

const work = frames.map((f) => f.work);
const sorted = [...work].sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const medianOf = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const stats = {
    frames: frames.length,
    p50: pct(0.5),
    p90: pct(0.9),
    p95: pct(0.95),
    p99: pct(0.99),
    worst: sorted[sorted.length - 1],
    latency: medianOf(frames.map((f) => f.total)),
    over60: work.filter((f) => f > 16.7).length,
    over120: work.filter((f) => f > 8.3).length
};

const W = 1000, H = 320, PAD = 34;
const top = Math.max(40, stats.worst * 1.1);
const bw = (W - PAD * 2) / frames.length;
const y = (ms) => H - PAD - (ms / top) * (H - PAD * 2);

const bars = work.map((ms, i) =>
{
    const colour = ms > 33.3 ? '#ef4444' : ms > 16.7 ? '#f59e0b' : ms > 8.3 ? '#3b82f6' : '#22c55e';
    return `<rect x="${(PAD + i * bw).toFixed(2)}" y="${y(ms).toFixed(2)}" width="${Math.max(bw - 0.5, 0.6).toFixed(2)}" height="${(H - PAD - y(ms)).toFixed(2)}" fill="${colour}"/>`;
}).join('');

const line = (ms, label, colour) => `<line x1="${PAD}" x2="${W - PAD}" y1="${y(ms)}" y2="${y(ms)}" stroke="${colour}" stroke-width="1" stroke-dasharray="4 4"/><text x="${W - PAD + 4}" y="${y(ms) + 4}" font-size="11" fill="${colour}">${label}</text>`;

const row = (k, v) => `<tr><td>${k}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${v}</td></tr>`;

writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Frame times — ${pkg}</title>
<style>
 body{font:14px system-ui,sans-serif;margin:24px;background:#0d1117;color:#e6edf3}
 table{border-collapse:collapse;margin-top:12px} td{padding:3px 14px 3px 0;border-bottom:1px solid #21262d}
 .k{color:#8b949e} svg{background:#161b22;border-radius:8px}
 .legend span{margin-right:14px;font-size:12px}
</style>
<h2 style="margin:0 0 4px">Frame times — ${pkg}</h2>
<div class="k" style="margin-bottom:14px">Each bar is one frame's render cost, matching the platform's own percentiles (buffer-wait forgiven). Lower is better.</div>
<svg viewBox="0 0 ${W} ${H}" width="100%">
  ${bars}
  ${line(8.3, '8.3ms (120Hz)', '#8b949e')}
  ${line(16.7, '16.7ms (60Hz)', '#f59e0b')}
  ${line(33.3, '33.3ms (30Hz)', '#ef4444')}
</svg>
<div class="legend" style="margin-top:8px">
 <span style="color:#22c55e">■ ≤8.3ms</span><span style="color:#3b82f6">■ ≤16.7ms</span><span style="color:#f59e0b">■ ≤33.3ms</span><span style="color:#ef4444">■ dropped</span>
</div>
<table>
${row('frames captured', stats.frames)}
${row('median', stats.p50.toFixed(1) + ' ms')}
${row('90th percentile', stats.p90.toFixed(1) + ' ms')}
${row('95th percentile', stats.p95.toFixed(1) + ' ms')}
${row('99th percentile', stats.p99.toFixed(1) + ' ms')}
${row('worst', stats.worst.toFixed(1) + ' ms')}
${row('median end-to-end latency', stats.latency.toFixed(1) + ' ms')}
${row('missed 60Hz budget', stats.over60 + ' (' + (100 * stats.over60 / stats.frames).toFixed(1) + '%)')}
${row('missed 120Hz budget', stats.over120 + ' (' + (100 * stats.over120 / stats.frames).toFixed(1) + '%)')}
</table>`);

console.log(`${stats.frames} frames  median ${stats.p50.toFixed(1)}ms  p90 ${stats.p90.toFixed(1)}ms  p99 ${stats.p99.toFixed(1)}ms  worst ${stats.worst.toFixed(1)}ms`);
console.log(`missed 60Hz: ${(100 * stats.over60 / stats.frames).toFixed(1)}%   missed 120Hz: ${(100 * stats.over120 / stats.frames).toFixed(1)}%`);
console.log(`wrote ${out}`);
