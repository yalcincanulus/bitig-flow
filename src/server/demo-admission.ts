import { createHash, randomUUID } from "node:crypto";

import { hashAnalyticsValue } from "#/server/analytics-hash";
import { getClientIp } from "#/server/client-ip";
import { rateLimitsEnabled } from "#/server/rate-limits-enabled";
import { getRedis, redisCall } from "#/server/redis";
import { requiredEnv, trustedProxyCount } from "#/server/runtime-env";

const admissionWindowSeconds = 24 * 60 * 60;
const admissionLimit = 3;
const entryIdempotencySeconds = 5 * 60;
const entryIdempotencyWaitAttempts = 150;

const reserveAdmissionScript = `
local generation = redis.call("GET", KEYS[3])
local existingGeneration = redis.call("GET", KEYS[2])
if existingGeneration and generation and existingGeneration == generation then
  return 1
end
if existingGeneration then
  redis.call("DEL", KEYS[2])
end
local count = tonumber(redis.call("GET", KEYS[1]) or "0")
if count >= tonumber(ARGV[2]) then
  return 0
end
if count == 0 then
  count = 1
  generation = ARGV[3]
  redis.call("SET", KEYS[1], count, "EX", ARGV[1])
  redis.call("SET", KEYS[3], generation, "EX", ARGV[1])
else
  count = redis.call("INCR", KEYS[1])
  local remaining = redis.call("TTL", KEYS[1])
  if remaining < 1 then
    remaining = 1
  end
  if not generation then
    generation = ARGV[3]
    redis.call("SET", KEYS[3], generation, "EX", remaining)
  end
end
local reservationTtl = redis.call("TTL", KEYS[1])
if reservationTtl < 1 then
  reservationTtl = 1
end
redis.call("SET", KEYS[2], generation, "EX", reservationTtl)
return count
`;

const releaseAdmissionScript = `
local reservationGeneration = redis.call("GET", KEYS[2])
if not reservationGeneration then
  return 0
end
redis.call("DEL", KEYS[2])
if reservationGeneration ~= redis.call("GET", KEYS[3]) then
  return 0
end
local count = tonumber(redis.call("GET", KEYS[1]) or "0")
if count <= 1 then
  redis.call("DEL", KEYS[1])
  redis.call("DEL", KEYS[3])
  return 0
end
return redis.call("DECR", KEYS[1])
`;

const completeEntryScript = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
return 1
`;

const abandonEntryScript = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
return redis.call("DEL", KEYS[1])
`;

export class DemoEntryInProgressError extends Error {
  override readonly name = "DemoEntryInProgressError";

  constructor() {
    super("Demo entry is still being prepared");
  }
}

export function hashDemoEntryKey(idempotencyKey: string) {
  return createHash("sha256").update(idempotencyKey).digest("hex");
}

export const demoEntryRecoveryMs = entryIdempotencySeconds * 1_000;

function waitForEntryProgress() {
  return new Promise<void>((resolve) => setTimeout(resolve, 100));
}

export async function runIdempotentDemoEntry<T>(
  idempotencyKey: string,
  operation: () => Promise<T>,
): Promise<T> {
  const redis = await getRedis();
  const key = `demo:entry:${idempotencyKey}`;
  const owner = `provisioning:${randomUUID()}`;

  for (let attempt = 0; attempt < entryIdempotencyWaitAttempts; attempt += 1) {
    const acquired = await redisCall(() =>
      redis.set(key, owner, { NX: true, EX: entryIdempotencySeconds }),
    );
    if (acquired) {
      try {
        const result = await operation();
        const completed = `completed:${JSON.stringify(result)}`;
        const saved = await redisCall(() =>
          redis.eval(completeEntryScript, {
            keys: [key],
            arguments: [owner, completed, String(entryIdempotencySeconds)],
          }),
        );
        if (Number(saved) !== 1) throw new DemoEntryInProgressError();
        return result;
      } catch (error) {
        await redisCall(() => redis.eval(abandonEntryScript, { keys: [key], arguments: [owner] }));
        throw error;
      }
    }

    const existing = await redisCall(() => redis.get(key));
    if (existing?.startsWith("completed:")) {
      return JSON.parse(existing.slice("completed:".length)) as T;
    }
    await waitForEntryProgress();
  }

  throw new DemoEntryInProgressError();
}

export function demoAdmissionKey(headers: Headers) {
  const clientIp = getClientIp({ headers, trustedProxyCount: trustedProxyCount() });
  const networkHash = hashAnalyticsValue(requiredEnv("GATE_RATELIMIT_SALT"), clientIp);
  return `demo:admission:${networkHash}`;
}

function admissionReservationKey(key: string, reservationId: string) {
  return `${key}:reservation:${reservationId}`;
}

export async function reserveDemoAdmission(key: string, reservationId: string) {
  if (!rateLimitsEnabled()) return { accepted: true as const, key };
  const redis = await getRedis();
  const count = Number(
    await redisCall(() =>
      redis.eval(reserveAdmissionScript, {
        keys: [key, admissionReservationKey(key, reservationId), `${key}:generation`],
        arguments: [String(admissionWindowSeconds), String(admissionLimit), reservationId],
      }),
    ),
  );
  if (count > 0) return { accepted: true as const, key };
  return { accepted: false as const, reason: "ipDailyLimit" as const };
}

export async function releaseDemoAdmission(key: string, reservationId: string) {
  const redis = await getRedis();
  await redisCall(() =>
    redis.eval(releaseAdmissionScript, {
      keys: [key, admissionReservationKey(key, reservationId), `${key}:generation`],
    }),
  );
}
