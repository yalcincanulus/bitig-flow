import { createHmac } from "node:crypto";

import { redisCall } from "#/server/redis";
import { requiredEnv } from "#/server/runtime-env";
import { rateLimitsEnabled } from "#/server/rate-limits-enabled";

export const formSubmissionLimit = 20;
export const formSubmissionWindowSeconds = 15 * 60;

type RedisLimiter = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
};

export function formSubmissionLimitKey(linkId: string, ip: string, salt: string) {
  const digest = createHmac("sha256", salt).update(`${linkId}\0${ip}`).digest("hex").slice(0, 32);
  return `gate:rl:submit:${digest}`;
}

function keyFor(linkId: string, ip: string) {
  return formSubmissionLimitKey(linkId, ip, requiredEnv("GATE_RATELIMIT_SALT"));
}

export async function consumeFormSubmissionLimit(redis: RedisLimiter, linkId: string, ip: string) {
  if (!rateLimitsEnabled()) return { allowed: true as const };
  const key = keyFor(linkId, ip);
  const count = await redisCall(() => redis.incr(key));
  if (count === 1) await redisCall(() => redis.expire(key, formSubmissionWindowSeconds));
  if (count <= formSubmissionLimit) return { allowed: true as const };

  const ttl = await redisCall(() => redis.ttl(key));
  console.warn("gate limiter tripped", {
    dimension: "submit",
    key: key.slice(-8),
    linkId,
  });
  return {
    allowed: false as const,
    retryAfterSeconds: Math.max(ttl, 1),
  };
}
