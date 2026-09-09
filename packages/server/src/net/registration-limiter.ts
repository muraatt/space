/** Closed-alpha limits on the transport peer, never untrusted forwarded headers. */
export class RegistrationLimiter {
  private sources = new Map<string, { since: number; attempts: number }>();
  constructor(private readonly clock = Date.now) {}
  allow(source: string) {
    const now = this.clock();
    for (const [key, value] of this.sources) if (now - value.since >= 600_000) this.sources.delete(key);
    let entry = this.sources.get(source);
    if (!entry) {
      if (this.sources.size >= 1024) return false;
      entry = { since: now, attempts: 0 }; this.sources.set(source, entry);
    }
    return ++entry.attempts <= 10;
  }
}

export function registrationSource(remoteAddress: string | undefined, forwardedFor: string | string[] | undefined) {
  if (process.env.TRUST_PROXY === '1' && typeof forwardedFor === 'string') {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first && first.length <= 64) return first;
  }
  return remoteAddress ?? 'unknown';
}
