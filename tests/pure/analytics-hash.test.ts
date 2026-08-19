import { createHash } from "node:crypto";

import { expect, test } from "vitest";

import { hashAnalyticsValue } from "#/server/analytics-hash";

test("an analytics identifier is sha256 of the analytics salt concatenated with the value", () => {
  expect(hashAnalyticsValue("analytics-salt", "203.0.113.10")).toBe(
    createHash("sha256").update("analytics-salt203.0.113.10").digest("hex"),
  );
});

test("the analytics salt and the gate rate-limit salt produce different hashes for the same IP", () => {
  expect(hashAnalyticsValue("analytics-salt", "203.0.113.10")).not.toBe(
    hashAnalyticsValue("gate-ratelimit-salt", "203.0.113.10"),
  );
});
