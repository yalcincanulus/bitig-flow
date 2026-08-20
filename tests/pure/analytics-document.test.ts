import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

function sourceOf(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const documentPage = sourceOf(
  "../../src/routes/_authenticated/dashboard/documents/$documentId/index.tsx",
);
const linkBadges = sourceOf("../../src/components/link-badges.tsx");

test("a Document in no Links says so", () => {
  expect(documentPage).toMatch(/This Document is in no Links/);
});

test("the Document analytics panel uses the shared trust module", () => {
  expect(documentPage).toMatch(/AnalyticsTrustMark/);
  expect(linkBadges).toMatch(/analyticsTrustworthy/);
  expect(linkBadges).toMatch(/no Requirements/);
  expect(linkBadges).toMatch(/password or\s+an email Requirement/);
});
