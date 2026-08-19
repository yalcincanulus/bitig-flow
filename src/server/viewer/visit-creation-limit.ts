import { createHmac } from "node:crypto";

import { requiredEnv } from "#/server/runtime-env";
import { redisCall } from "#/server/redis";

export const visitCreationLimit = 30;
export const visitCreationWindowSeconds = 60 * 60;

type RedisLimiter = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
};

export function visitCreationLimitKey(ip: string, salt: string) {
  const digest = createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
  return `gate:rl:visit:${digest}`;
}

export async function consumeVisitCreationLimit(redis: RedisLimiter, ip: string) {
  const key = visitCreationLimitKey(ip, requiredEnv("GATE_RATELIMIT_SALT"));
  const count = await redisCall(() => redis.incr(key));
  if (count === 1) await redisCall(() => redis.expire(key, visitCreationWindowSeconds));
  if (count <= visitCreationLimit) return { allowed: true as const };

  const ttl = await redisCall(() => redis.ttl(key));
  return {
    allowed: false as const,
    retryAfterSeconds: Math.max(ttl, 1),
  };
}
