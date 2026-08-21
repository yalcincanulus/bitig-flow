import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const projectDirectory = fileURLToPath(new URL("../../", import.meta.url));

test("Better Auth rate limiting follows the process rate-limit switch", () => {
  const source = readFileSync(join(projectDirectory, "src/server/auth.ts"), "utf8");

  expect(source).toMatch(/rateLimit:\s*\{[\s\S]*enabled:\s*rateLimitsEnabled\(\)/);
  expect(source).toMatch(/secondaryStorage/);
});

test("fixture Better Auth stays unmetered", () => {
  const source = readFileSync(join(projectDirectory, "tests/fixtures/auth.ts"), "utf8");

  expect(source).toMatch(/rateLimit:\s*\{\s*enabled:\s*false\s*\}/);
});
