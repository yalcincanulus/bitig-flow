import { expect, test } from "vitest";

import {
  gateProgressTtlSeconds,
  visitCookiePath,
  visitorIdCookiePath,
} from "#/server/viewer/visit-cookies";

test("the Visit cookie is scoped to one Slug", () => {
  expect(visitCookiePath("abc123ABC789")).toBe("/v/abc123ABC789");
});

test("visitor_id is scoped to the whole origin", () => {
  expect(visitorIdCookiePath).toBe("/");
});

test("Gate progress lasts about 15 minutes", () => {
  expect(gateProgressTtlSeconds).toBe(15 * 60);
});
