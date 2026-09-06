import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { release, cpus, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { summarize } from './metrics';
import type { OrbitalDebug } from '../../client/src/debug/test-bridge';

const root = process.cwd(),
  output = resolve(root, 'artifacts/session-01');
const channel = process.env.PERF_BROWSER ?? 'chrome',
  backend = process.env.PERF_BACKEND ?? 'webgpu';
const warmupSeconds = Number(process.env.PERF_WARMUP ?? 60),
  sampleSeconds = Number(process.env.PERF_SECONDS ?? 300);
if (!['chrome', 'msedge'].includes(channel) || !['webgpu', 'webgl2'].includes(backend))
  throw new Error('Use chrome/msedge and webgpu/webgl2');
if (!(sampleSeconds > 0 && sampleSeconds <= 400 && warmupSeconds >= 0))
  throw new Error('Invalid sample duration');
const origin = 'http://127.0.0.1:5173';
for (const url of [origin, 'http://127.0.0.1:8787/health']) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) });
    throw new Error(`Port already occupied: ${url}. Stop pnpm dev first.`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Port already')) throw e;
  }
}
await mkdir(output, { recursive: true });
const children = [
  spawn(process.execPath, ['--import', 'tsx', 'packages/server/src/main.ts'], {
    cwd: root,
    env: { ...process.env, PORT: '8787', TEST_MODE: '0' },
    stdio: 'pipe',
  }),
  spawn(
    process.execPath,
    [
      resolve('packages/client/node_modules/vite/bin/vite.js'),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      '5173',
      '--strictPort',
    ],
    { cwd: resolve('packages/client'), env: { ...process.env, PORT: '8787' }, stdio: 'pipe' },
  ),
];
const logs: string[] = [];
for (const child of children) {
  child.stdout?.on('data', (d) => logs.push(String(d)));
  child.stderr?.on('data', (d) => logs.push(String(d)));
}
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  for (let tries = 0; ; tries++) {
    try {
      const responses = await Promise.all([fetch(origin), fetch('http://127.0.0.1:8787/health')]);
      if (responses.every((r) => r.ok)) break;
    } catch {
      /* Startup is polled, never treated as ready after a fixed sleep. */
    }
    if (tries > 60) throw new Error(`Startup timeout: ${logs.join('')}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({ channel, headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/?scene=orbit_day&backend=${backend}`);
  await page.waitForFunction(() => (window.__ORBITAL__?.getMetrics().frames ?? 0) > 10, undefined, {
    timeout: 60000,
  });
  const actual = await page.evaluate(() => window.__ORBITAL__!.getMetrics().backend);
  if (actual !== (backend === 'webgpu' ? 'WebGPU' : 'WebGL2'))
    throw new Error(`Requested ${backend}, received ${actual}`);
  console.log(
    `${channel} ${actual}: ${warmupSeconds}s warmup, then ${sampleSeconds}s 1920x1080 sample. Production build; one development ship.`,
  );
  for (let elapsed = 0; elapsed < warmupSeconds; elapsed += 30) {
    await page.waitForTimeout(Math.min(30, warmupSeconds - elapsed) * 1000);
    console.log(`Warmup ${Math.min(elapsed + 30, warmupSeconds)}/${warmupSeconds}s`);
  }
  const startCount = await page.evaluate(() => window.__ORBITAL__!.getFrameTimes().length),
    start = performance.now();
  const samples: ReturnType<OrbitalDebug['getMetrics']>[] = [];
  for (let elapsed = 0; elapsed < sampleSeconds; elapsed += 30) {
    await page.waitForTimeout(Math.min(30, sampleSeconds - elapsed) * 1000);
    samples.push(await page.evaluate(() => window.__ORBITAL__!.getMetrics()));
    console.log(
      `Sample ${Math.min(elapsed + 30, sampleSeconds)}/${sampleSeconds}s: ${samples.at(-1)!.fps.toFixed(1)} recent FPS`,
    );
  }
  const elapsedSeconds = (performance.now() - start) / 1000,
    frames = await page.evaluate((n) => window.__ORBITAL__!.getFrameTimes().slice(n), startCount);
  const summary = summarize(frames),
    last = samples.at(-1)!;
  const state = await page.evaluate(() => window.__ORBITAL__!.getState());
  const outputName = `performance-${channel}-${backend}`;
  const result = {
    kind: 'production-local-hardware-measurement',
    timestamp: new Date().toISOString(),
    scene: 'orbit_day',
    browser: {
      channel,
      version: browser.version(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      headless: true,
    },
    os: release(),
    cpu: cpus()[0]?.model,
    logicalCores: cpus().length,
    ramGiB: totalmem() / 1024 ** 3,
    backend: actual,
    adapter: last.adapter,
    viewport: last.viewport,
    pixelRatio: 1,
    warmupSeconds,
    sampleSeconds,
    elapsedSeconds,
    summary,
    drawCallsMax: Math.max(...samples.map((x) => x.drawCalls)),
    trianglesMax: Math.max(...samples.map((x) => x.triangles)),
    rttMaxMs: Math.max(...samples.map((x) => x.rttMs)),
    serverTickP95MaxMs: Math.max(...samples.map((x) => x.server?.tickP95Ms ?? 0)),
    serverTickP99MaxMs: Math.max(...samples.map((x) => x.server?.tickP99Ms ?? 0)),
    backlogMaxMs: Math.max(...samples.map((x) => x.server?.backlogMs ?? 0)),
    snapshots: samples,
    finalTick: state?.tick,
    errors,
    referenceGpuAcceptance:
      'UNVERIFIED: identify GPU against hardware.json; this is not a GTX 1660/RTX 2060 certificate.',
    buildManifest: JSON.parse(await readFile(resolve('package.json'), 'utf8')).version,
  };
  await page.screenshot({ path: resolve(output, `${outputName}.png`) });
  await writeFile(resolve(output, `${outputName}.json`), JSON.stringify(result, null, 2));
  await writeFile(resolve(output, `${outputName}-frames.json`), JSON.stringify(frames));
  console.log(JSON.stringify({ file: outputName, summary, errors }));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of children) child.kill();
  await Promise.all(
    children.map((c) =>
      c.exitCode !== null ? Promise.resolve() : new Promise<void>((r) => c.once('exit', () => r())),
    ),
  );
  await writeFile(resolve(output, `performance-${channel}-${backend}-server.log`), logs.join(''));
}
