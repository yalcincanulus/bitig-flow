import { expect, test } from "vitest";

import {
  consumeCredentialGuessLimit,
  credentialGuessLimit,
  credentialGuessLimitKey,
} from "#/server/viewer/credential-guess-limit";

process.env.GATE_RATELIMIT_SALT ??= "test-gate-ratelimit-salt";

test("credential guesses are keyed per Link and IP", () => {
  expect(credentialGuessLimitKey("link-a", "203.0.113.10", "salt")).not.toBe(
    credentialGuessLimitKey("link-b", "203.0.113.10", "salt"),
  );
  expect(credentialGuessLimitKey("link-a", "203.0.113.10", "salt")).not.toBe(
    credentialGuessLimitKey("link-a", "203.0.113.11", "salt"),
  );
  expect(credentialGuessLimitKey("link-a", "203.0.113.10", "salt")).toMatch(
    /^gate:rl:credential:[0-9a-f]{32}$/,
  );
});

test("the eleventh credential guess in the window is refused", async () => {
  const counts = new Map<string, number>();
  const redis = {
    async incr(key: string) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    async expire() {},
    async ttl() {
      return 900;
    },
    async del() {},
  };

  for (let attempt = 0; attempt < credentialGuessLimit; attempt++) {
    expect(await consumeCredentialGuessLimit(redis, "link-a", "203.0.113.10")).toEqual({
      allowed: true,
    });
  }

  expect(await consumeCredentialGuessLimit(redis, "link-a", "203.0.113.10")).toEqual({
    allowed: false,
    retryAfterSeconds: 900,
  });
});
