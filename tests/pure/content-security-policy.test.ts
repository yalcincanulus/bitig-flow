import { expect, test } from "vitest";

import {
  documentContentSecurityPolicy,
  isViewerPath,
  storageOriginFromEndpoint,
  viewerContentSecurityPolicy,
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

test("the Viewer CSP does not list the Storage origin", () => {
  expect(viewerContentSecurityPolicy()).toContain("connect-src 'self'");
  expect(viewerContentSecurityPolicy()).not.toContain("http://127.0.0.1:3900");
});

test("only the /v subtree is the Viewer path", () => {
  expect(isViewerPath("/v")).toBe(true);
  expect(isViewerPath("/v/")).toBe(true);
  expect(isViewerPath("/v/unknownslug1")).toBe(true);
  expect(isViewerPath("/verify-email")).toBe(false);
  expect(isViewerPath("/dashboard/documents")).toBe(false);
});
