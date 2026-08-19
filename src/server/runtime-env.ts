export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function trustedProxyCount(): number {
  const raw = process.env.TRUSTED_PROXY_COUNT ?? "0";
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("TRUSTED_PROXY_COUNT must be a non-negative integer");
  }
  return count;
}
