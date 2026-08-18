import { expect, test } from "vitest";

import {
  documentContentSecurityPolicy,
  storageOriginFromEndpoint,
} from "#/lib/content-security-policy";

test("the Storage origin is the endpoint's origin, never a path", () => {
  expect(storageOriginFromEndpoint("http://127.0.0.1:3900")).toBe("http://127.0.0.1:3900");
  expect(storageOriginFromEndpoint("http://localhost:3900/bitig")).toBe("http://localhost:3900");
});

test("connect-src lists self and the Storage origin so a presigned PUT is allowed", () => {
  expect(documentContentSecurityPolicy("http://127.0.0.1:3900")).toContain(
    "connect-src 'self' http://127.0.0.1:3900",
  );
});
