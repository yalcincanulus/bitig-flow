import { createHmac } from "node:crypto";

import { redisCall } from "#/server/redis";
import { requiredEnv } from "#/server/runtime-env";

export const credentialGuessLimit = 10;
export const credentialGuessWindowSeconds = 15 * 60;

type RedisLimiter = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
  del(key: string): Promise<unknown>;
};

export function credentialGuessLimitKey(linkId: string, ip: string, salt: string) {
  const digest = createHmac("sha256", salt).update(`${linkId}\0${ip}`).digest("hex").slice(0, 32);
  return `gate:rl:credential:${digest}`;
}

function keyFor(linkId: string, ip: string) {
  return credentialGuessLimitKey(linkId, ip, requiredEnv("GATE_RATELIMIT_SALT"));
}

export async function consumeCredentialGuessLimit(redis: RedisLimiter, linkId: string, ip: string) {
  const key = keyFor(linkId, ip);
  const count = await redisCall(() => redis.incr(key));
  if (count === 1) await redisCall(() => redis.expire(key, credentialGuessWindowSeconds));
  if (count <= credentialGuessLimit) return { allowed: true as const };

  const ttl = await redisCall(() => redis.ttl(key));
  console.warn("gate limiter tripped", {
    dimension: "credential",
    key: key.slice(-8),
    linkId,
  });
  return {
    allowed: false as const,
    retryAfterSeconds: Math.max(ttl, 1),
  };
}

export async function clearCredentialGuessLimit(redis: RedisLimiter, linkId: string, ip: string) {
  await redisCall(() => redis.del(keyFor(linkId, ip)));
}
