const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function assertTestModeLoopback(testMode: boolean, host: string) {
  if (testMode && !LOOPBACK_HOSTS.has(host.trim().toLowerCase()))
    throw new Error(`TEST_MODE requires a loopback HOST, received ${host}`);
}
