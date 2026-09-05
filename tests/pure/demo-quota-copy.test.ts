import { expect, test } from "vitest";

import { demoMutationErrorMessage } from "#/lib/demo-quota-copy";

test("the per-upload byte limit names the limit", () => {
  expect(
    demoMutationErrorMessage(
      { code: "DEMO_QUOTA_EXCEEDED", limit: "uploadBytes", limitValue: 1_024 },
      "Could not upload.",
    ),
  ).toContain("per-upload size limit");
});

test("a simultaneous resource limit names the resource and a remedy", () => {
  expect(
    demoMutationErrorMessage(
      {
        code: "DEMO_QUOTA_EXCEEDED",
        limit: "documentCount",
        usage: 20,
        limitValue: 20,
      },
      "Could not create the Document.",
    ),
  ).toBe("Demo document limit reached (20 of 20). Delete a document before creating another.");
});

test("a lifetime limit explains that deletion does not restore capacity", () => {
  expect(
    demoMutationErrorMessage(
      {
        code: "DEMO_QUOTA_EXCEEDED",
        limit: "linkLifetimeCount",
        usage: 20,
        limitValue: 20,
      },
      "Could not create the Link.",
    ),
  ).toBe(
    "Demo lifetime link limit reached (20 of 20). Deleting links does not restore this limit.",
  );
});

test("shared pressure and maintenance avoid exposing internal dimensions", () => {
  expect(
    demoMutationErrorMessage(
      { code: "DEMO_QUOTA_EXCEEDED", limit: "globalConfirmationCount" },
      "Could not upload.",
    ),
  ).toBe("Demo uploads are busy. Try again later.");
  expect(demoMutationErrorMessage({ code: "DEMO_UPLOAD_UNAVAILABLE" }, "Could not upload.")).toBe(
    "Demo uploads are temporarily unavailable. Try again later.",
  );
});

test("unknown failures keep the action-specific fallback", () => {
  expect(demoMutationErrorMessage(new Error("network"), "Could not create the Vault.")).toBe(
    "Could not create the Vault.",
  );
});
