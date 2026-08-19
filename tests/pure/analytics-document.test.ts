import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const documentPage = readFileSync(
  fileURLToPath(
    new URL(
      "../../src/routes/_authenticated/dashboard/documents/$documentId/index.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);

test("a Document in no Links says so", () => {
  expect(documentPage).toMatch(/This Document is in no Links/);
});

test("the Document analytics panel uses the shared trust module", () => {
  expect(documentPage).toMatch(/analyticsTrustworthy/);
});
