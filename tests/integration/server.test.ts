import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { expect } from "vitest";

import { testStorageKeyPrefix } from "./environment";
import { test } from "./http";

test("the integration project reaches the running dev server", async ({ http }) => {
  const response = await http(process.env.BETTER_AUTH_URL!);

  expect(response.ok).toBe(true);
});

test("the integration project is isolated from development state", () => {
  const development = parseEnv(readFileSync(new URL("../../.env", import.meta.url), "utf8"));
  const developmentDatabase = new URL(development.DATABASE_URL!);
  const testDatabase = new URL(process.env.DATABASE_URL!);
  const developmentRedis = new URL(development.REDIS_URL!);
  const testRedis = new URL(process.env.REDIS_URL!);
  const authBaseUrl = new URL(process.env.BETTER_AUTH_URL!);

  expect(testDatabase.pathname).toBe("/bitig_test");
  expect(decodeURIComponent(developmentDatabase.pathname.slice(1))).not.toBe("bitig_test");
  expect(testRedis.pathname).toBe("/15");
  expect(Number(developmentRedis.pathname.slice(1) || "0")).not.toBe(15);
  expect(process.env.PORT).toBe("3100");
  expect(authBaseUrl.port).toBe(process.env.PORT);
  expect(process.env.S3_KEY_PREFIX).toBe(testStorageKeyPrefix);
  expect(development.S3_KEY_PREFIX ?? "").not.toBe(testStorageKeyPrefix);
});
