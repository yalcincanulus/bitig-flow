import { expect, test } from "vitest";

import {
  viewerSenderFirstName,
  viewerSenderLine,
  viewerSharedWithYouLine,
} from "#/lib/viewer-sender";

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

test("a Document page says the sender shared this Document", () => {
  expect(viewerSharedWithYouLine("Yalçıncan Ulus", "Bitig Studio", "document")).toBe(
    "Yalçıncan Ulus at Bitig Studio shared this document with you.",
  );
  expect(viewerSharedWithYouLine(null, "Bitig Studio", "document")).toBe(
    "Bitig Studio shared this document with you.",
  );
});

test("a Vault index says the sender shared these Documents", () => {
  expect(viewerSharedWithYouLine("Yalçıncan Ulus", "Bitig Studio", "vault")).toBe(
    "Yalçıncan Ulus at Bitig Studio shared these documents with you.",
  );
  expect(viewerSharedWithYouLine(null, "Bitig Studio", "vault")).toBe(
    "Bitig Studio shared these documents with you.",
  );
});
