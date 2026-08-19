import { expect, test } from "vitest";

import { RedisUnavailableError } from "#/server/redis";
import { readGateProgress, writeGateProgress } from "#/server/viewer/gate-progress";

test("Redis unavailable fails closed instead of returning Gate progress", async () => {
  const redis = {
    get: async () => {
      throw new Error("ECONNREFUSED");
    },
  };

  await expect(readGateProgress(redis, "opaque-id")).rejects.toBeInstanceOf(RedisUnavailableError);
});

test("Gate progress stores the Link id, gate version, and password Receipt", async () => {
  const store = new Map<string, string>();
  const redis = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string) {
      store.set(key, value);
    },
  };

  await writeGateProgress(
    redis,
    "opaque-id",
    { linkId: "link-1", gateVersion: 2, password: true },
    900,
  );

  expect(JSON.parse(store.get("gate:progress:opaque-id") ?? "null")).toEqual({
    link_id: "link-1",
    gate_version: 2,
    password: true,
  });
  expect(await readGateProgress(redis, "opaque-id")).toEqual({
    linkId: "link-1",
    gateVersion: 2,
    password: true,
  });
});
