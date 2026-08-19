import { expect, test } from "vitest";

import { maskCapturedEmail } from "#/server/viewer/mask-email";

test("a captured address keeps the first and last local characters and the domain", () => {
  expect(maskCapturedEmail("visitor@example.com")).toBe("v*****r@example.com");
  expect(maskCapturedEmail("ab@x.test")).toBe("a*@x.test");
  expect(maskCapturedEmail("a@x.test")).toBe("a***@x.test");
});
