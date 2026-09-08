/**
 * Abuse counters (ADR-0037), Demo admission, and Better Auth metering stay on in production
 * and in the test suite. Local `vite dev` is unmetered so HMR, preview automation, repeated
 * Gate walks, and Demo entry retries do not trip a limiter that then blocks the rest of the
 * window.
 */
export function rateLimitsEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.VITEST) return true;
  return env.NODE_ENV === "production";
}
