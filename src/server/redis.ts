import { createClient, type RedisClientType } from "redis";

import { requiredEnv } from "#/server/runtime-env";

export class RedisUnavailableError extends Error {
  override readonly name = "RedisUnavailableError";

  constructor() {
    super("Redis is unavailable");
  }
}

const redisGlobal = globalThis as typeof globalThis & {
  bitigFlowRedis?: RedisClientType;
};

function redisClient() {
  if (!redisGlobal.bitigFlowRedis) {
    const client = createClient({ url: requiredEnv("REDIS_URL") });
    client.on("error", () => undefined);
    redisGlobal.bitigFlowRedis = client as RedisClientType;
  }
  return redisGlobal.bitigFlowRedis;
}

export async function redisCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RedisUnavailableError) throw error;
    throw new RedisUnavailableError();
  }
}

export async function getRedis() {
  const client = redisClient();
  if (!client.isOpen) {
    try {
      await client.connect();
    } catch {
      throw new RedisUnavailableError();
    }
  }
  return client;
}

export async function closeRedis() {
  const client = redisGlobal.bitigFlowRedis;
  if (client?.isOpen) await client.quit();
}
