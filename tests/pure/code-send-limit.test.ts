import { expect, test } from "vitest";

import {
  codeSendLimit,
  codeSendLimitKey,
  consumeCodeSendLimit,
} from "#/server/viewer/code-send-limit";

process.env.GATE_RATELIMIT_SALT ??= "test-gate-ratelimit-salt";

test("code sends are keyed by the normalized address across every Link", () => {
  expect(codeSendLimitKey("visitor@example.com", "salt")).toBe(
    codeSendLimitKey("visitor@example.com", "salt"),
  );
  expect(codeSendLimitKey("visitor@example.com", "salt")).not.toBe(
    codeSendLimitKey("other@example.com", "salt"),
  );
  expect(codeSendLimitKey("visitor@example.com", "salt")).toMatch(
    /^gate:rl:recipient:[0-9a-f]{32}$/,
  );
});

test("the sixth code send to one address in the window is refused", async () => {
  const counts = new Map<string, number>();
  const redis = {
    async incr(key: string) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    async expire() {},
    async ttl() {
      return 3600;
    },
  };

  for (let attempt = 0; attempt < codeSendLimit; attempt++) {
    expect(await consumeCodeSendLimit(redis, "visitor@example.com", "link-a")).toEqual({
      allowed: true,
    });
  }

  expect(await consumeCodeSendLimit(redis, "visitor@example.com", "link-a")).toEqual({
    allowed: false,
    retryAfterSeconds: 3600,
  });
});
