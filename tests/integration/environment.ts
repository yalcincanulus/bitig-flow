export const testDatabaseName = "bitig_test";
export const testRedisIndex = "15";
export const testPort = "3100";
export const testBaseUrl = `http://127.0.0.1:${testPort}`;

export function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`Missing env var ${name} — is .env populated?`);
  return value;
}

export function mailpitBaseUrl(environment: NodeJS.ProcessEnv): string {
  return `http://${required(environment, "SMTP_HOST")}:8025`;
}
