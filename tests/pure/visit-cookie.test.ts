import { expect, test } from "vitest";

import { visitCookiePath, visitorIdCookiePath } from "#/server/viewer/visit-cookies";

test("the Visit cookie is scoped to one Slug", () => {
  expect(visitCookiePath("abc123ABC789")).toBe("/v/abc123ABC789");
});

test("visitor_id is scoped to the whole origin", () => {
  expect(visitorIdCookiePath).toBe("/");
});
