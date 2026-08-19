import { expect, test, vi } from "vitest";

import {
  beaconLimit,
  beaconLimitKey,
  beaconWindowSeconds,
  consumeBeaconLimit,
} from "#/server/viewer/beacon-limit";

process.env.GATE_RATELIMIT_SALT ??= "test-gate-ratelimit-salt";

test("Beacons are keyed per Visit", () => {
  expect(beaconLimitKey("visit-a", "salt")).not.toBe(beaconLimitKey("visit-b", "salt"));
  expect(beaconLimitKey("visit-a", "salt")).toMatch(/^beacon:rl:[0-9a-f]{32}$/);
});

test("the window is one fixed minute", () => {
  expect(beaconWindowSeconds).toBe(60);
});

test("the twenty-first Beacon in the window is refused", async () => {
  const counts = new Map<string, number>();
  const redis = {
    async incr(key: string) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    async expire() {},
    async ttl() {
      return 60;
    },
  };

  for (let attempt = 0; attempt < beaconLimit; attempt++) {
    expect(await consumeBeaconLimit(redis, "visit-a", "link-a")).toEqual({
      allowed: true,
    });
  }

  expect(await consumeBeaconLimit(redis, "visit-a", "link-a")).toEqual({
    allowed: false,
    retryAfterSeconds: 60,
  });
});

test("a tripped Beacon limiter logs one warn line", async () => {
  const redis = {
    async incr() {
      return beaconLimit + 1;
    },
    async expire() {},
    async ttl() {
      return 60;
    },
  };
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    await consumeBeaconLimit(redis, "visit-a", "link-a");

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]).toEqual([
      "gate limiter tripped",
      { dimension: "beacon", key: expect.stringMatching(/^[0-9a-f]{8}$/), linkId: "link-a" },
    ]);
  } finally {
    warn.mockRestore();
  }
});
