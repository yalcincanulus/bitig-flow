import { expect, test } from "vitest";

import { rateLimitsEnabled } from "#/server/rate-limits-enabled";

test("local development is unmetered", () => {
  expect(rateLimitsEnabled({ NODE_ENV: "development" })).toBe(false);
});

test("production and the test suite stay metered", () => {
  expect(rateLimitsEnabled({ NODE_ENV: "production" })).toBe(true);
  expect(rateLimitsEnabled({ NODE_ENV: "development", VITEST: "true" })).toBe(true);
  expect(rateLimitsEnabled({ NODE_ENV: "production", VITEST: "true" })).toBe(true);
});
