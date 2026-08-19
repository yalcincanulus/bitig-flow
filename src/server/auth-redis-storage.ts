import { getRedis } from "#/server/redis";

const incrementScript = `
local value = redis.call("INCR", KEYS[1])
if value == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return value
`;

export function redisSecondaryStorage() {
  return {
    async get(key: string) {
      const redis = await getRedis();
      return redis.get(key);
    },
    async getAndDelete(key: string) {
      const redis = await getRedis();
      return redis.getDel(key);
    },
    async increment(key: string, ttl: number) {
      const redis = await getRedis();
      const value = await redis.eval(incrementScript, {
        keys: [key],
        arguments: [String(ttl)],
      });
      return Number(value);
    },
    async set(key: string, value: string, ttl?: number) {
      const redis = await getRedis();
      if (ttl) await redis.set(key, value, { EX: ttl });
      else await redis.set(key, value);
    },
    async delete(key: string) {
      const redis = await getRedis();
      await redis.del(key);
    },
  };
}
