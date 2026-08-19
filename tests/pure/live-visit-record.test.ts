import { expect, test } from "vitest";

import { RedisUnavailableError } from "#/server/redis";
import { readLiveVisitRecord } from "#/server/viewer/live-visit-record";

test("Redis unavailable fails closed instead of returning a live Visit record", async () => {
  const redis = {
    get: async () => {
      throw new Error("ECONNREFUSED");
    },
  };

  await expect(readLiveVisitRecord(redis, "opaque-id")).rejects.toBeInstanceOf(
    RedisUnavailableError,
  );
});
