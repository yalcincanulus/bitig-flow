import { expect, test } from "vitest";

import {
  consumeFormSubmissionLimit,
  formSubmissionLimit,
  formSubmissionLimitKey,
} from "#/server/viewer/form-submission-limit";

process.env.GATE_RATELIMIT_SALT ??= "test-gate-ratelimit-salt";

test("form submissions are keyed per Link and IP", () => {
  expect(formSubmissionLimitKey("link-a", "203.0.113.10", "salt")).not.toBe(
    formSubmissionLimitKey("link-b", "203.0.113.10", "salt"),
  );
  expect(formSubmissionLimitKey("link-a", "203.0.113.10", "salt")).not.toBe(
    formSubmissionLimitKey("link-a", "203.0.113.11", "salt"),
  );
  expect(formSubmissionLimitKey("link-a", "203.0.113.10", "salt")).toMatch(
    /^gate:rl:submit:[0-9a-f]{32}$/,
  );
});

test("the twenty-first form submission in the window is refused", async () => {
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
  };

  for (let attempt = 0; attempt < formSubmissionLimit; attempt++) {
    expect(await consumeFormSubmissionLimit(redis, "link-a", "203.0.113.10")).toEqual({
      allowed: true,
    });
  }

  expect(await consumeFormSubmissionLimit(redis, "link-a", "203.0.113.10")).toEqual({
    allowed: false,
    retryAfterSeconds: 900,
  });
});
