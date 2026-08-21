/**
 * Abuse counters (ADR-0037) and Better Auth metering stay on in production and in the test
 * suite. Local `vite dev` is unmetered so HMR, preview automation, and repeated Gate walks
 * do not trip a 429 that then blocks the rest of the hour.
 */
export function rateLimitsEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.VITEST) return true;
  return env.NODE_ENV === "production";
}
