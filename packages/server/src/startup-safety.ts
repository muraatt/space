const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function assertTestModeLoopback(testMode: boolean, host: string) {
  if (testMode && !LOOPBACK_HOSTS.has(host.trim().toLowerCase()))
    throw new Error(`TEST_MODE requires a loopback HOST, received ${host}`);
}

export function parseAllowedOrigins(value: string | undefined) {
  return (value ?? '').split(',').map((item) => item.trim()).filter(Boolean).map((origin) => {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`ALLOWED_ORIGINS must contain exact HTTP(S) origins, received ${origin}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin)
      throw new Error(`ALLOWED_ORIGINS must contain exact HTTP(S) origins, received ${origin}`);
    return origin;
  });
}

export function assertDeploymentRequirements(
  databaseRequired: boolean,
  databaseUrl: string | undefined,
  originsRequired: boolean,
  allowedOrigins: readonly string[],
) {
  if (databaseRequired && !databaseUrl)
    throw new Error('REQUIRE_DATABASE_URL=1 requires DATABASE_URL');
  if (originsRequired && allowedOrigins.length === 0)
    throw new Error('REQUIRE_ALLOWED_ORIGINS=1 requires ALLOWED_ORIGINS');
}
