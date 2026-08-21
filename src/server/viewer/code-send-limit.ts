import { createHmac } from "node:crypto";

import { redisCall } from "#/server/redis";
import { requiredEnv } from "#/server/runtime-env";
import { rateLimitsEnabled } from "#/server/rate-limits-enabled";

export const codeSendLimit = 5;
export const codeSendWindowSeconds = 60 * 60;

type RedisLimiter = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
};

export function codeSendLimitKey(normalizedEmail: string, salt: string) {
  const digest = createHmac("sha256", salt).update(normalizedEmail).digest("hex").slice(0, 32);
  return `gate:rl:recipient:${digest}`;
}

export async function consumeCodeSendLimit(
  redis: RedisLimiter,
  normalizedEmail: string,
  linkId: string,
) {
  if (!rateLimitsEnabled()) return { allowed: true as const };
  const key = codeSendLimitKey(normalizedEmail, requiredEnv("GATE_RATELIMIT_SALT"));
  const count = await redisCall(() => redis.incr(key));
  if (count === 1) await redisCall(() => redis.expire(key, codeSendWindowSeconds));
  if (count <= codeSendLimit) return { allowed: true as const };

  const ttl = await redisCall(() => redis.ttl(key));
  console.warn("gate limiter tripped", {
    dimension: "recipient",
    key: key.slice(-8),
    linkId,
  });
  return {
    allowed: false as const,
    retryAfterSeconds: Math.max(ttl, 1),
  };
}
