import { createHmac } from "node:crypto";

import { redisCall } from "#/server/redis";
import { requiredEnv } from "#/server/runtime-env";
import { rateLimitsEnabled } from "#/server/rate-limits-enabled";

export const beaconLimit = 20;
export const beaconWindowSeconds = 60;

type RedisLimiter = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
};

export function beaconLimitKey(visitId: string, salt: string) {
  const digest = createHmac("sha256", salt).update(visitId).digest("hex").slice(0, 32);
  return `beacon:rl:${digest}`;
}

function keyFor(visitId: string) {
  return beaconLimitKey(visitId, requiredEnv("GATE_RATELIMIT_SALT"));
}

export async function consumeBeaconLimit(redis: RedisLimiter, visitId: string, linkId: string) {
  if (!rateLimitsEnabled()) return { allowed: true as const };
  const key = keyFor(visitId);
  const count = await redisCall(() => redis.incr(key));
  if (count === 1) await redisCall(() => redis.expire(key, beaconWindowSeconds));
  if (count <= beaconLimit) return { allowed: true as const };

  const ttl = await redisCall(() => redis.ttl(key));
  console.warn("gate limiter tripped", {
    dimension: "beacon",
    key: key.slice(-8),
    linkId,
  });
  return {
    allowed: false as const,
    retryAfterSeconds: Math.max(ttl, 1),
  };
}
