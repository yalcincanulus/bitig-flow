import { expect, test } from "vitest";

import { viewerSenderFirstName, viewerSenderLine } from "#/lib/viewer-sender";

test("the sender line names the User at the Organization", () => {
  expect(viewerSenderLine("Yalçıncan Ulus", "Bitig Studio")).toBe("Yalçıncan Ulus at Bitig Studio");
});

test("the sender line degrades to the Organization when the creator is gone", () => {
  expect(viewerSenderLine(null, "Bitig Studio")).toBe("Bitig Studio");
});

test("the password ask uses the sender's first name, or the Organization", () => {
  expect(viewerSenderFirstName("Yalçıncan Ulus", "Bitig Studio")).toBe("Yalçıncan");
  expect(viewerSenderFirstName(null, "Bitig Studio")).toBe("Bitig Studio");
});
