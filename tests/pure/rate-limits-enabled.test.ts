import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { rateLimitsEnabled } from "#/server/rate-limits-enabled";

const projectDirectory = fileURLToPath(new URL("../../", import.meta.url));

test("local development is unmetered", () => {
  expect(rateLimitsEnabled({ NODE_ENV: "development" })).toBe(false);
});

test("production and the test suite stay metered", () => {
  expect(rateLimitsEnabled({ NODE_ENV: "production" })).toBe(true);
  expect(rateLimitsEnabled({ NODE_ENV: "development", VITEST: "true" })).toBe(true);
  expect(rateLimitsEnabled({ NODE_ENV: "production", VITEST: "true" })).toBe(true);
});

test("Demo admission follows the process rate-limit switch", () => {
  const source = readFileSync(join(projectDirectory, "src/server/demo-admission.ts"), "utf8");
  expect(source).toMatch(/if \(!rateLimitsEnabled\(\)\) return \{ accepted: true as const, key \}/);
});
