export function summarize(values: number[]) {
  const a = [...values].sort((x, y) => x - y),
    mean = a.reduce((x, y) => x + y, 0) / (a.length || 1);
  return {
    samples: a.length,
    meanMs: mean,
    fps: mean ? 1000 / mean : 0,
    p50Ms: a[Math.floor(a.length * 0.5)] ?? 0,
    p95Ms: a[Math.floor(a.length * 0.95)] ?? 0,
    p99Ms: a[Math.floor(a.length * 0.99)] ?? 0,
    maxMs: a.at(-1) ?? 0,
  };
}
