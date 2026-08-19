import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

function sourceOf(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const documentPage = sourceOf(
  "../../src/routes/_authenticated/dashboard/documents/$documentId/index.tsx",
);
const linkTotalsCard = sourceOf("../../src/components/analytics-link-totals-card.tsx");

test("a Document in no Links says so", () => {
  expect(documentPage).toMatch(/This Document is in no Links/);
});

test("the Document analytics panel uses the shared trust module", () => {
  expect(documentPage).toMatch(/AnalyticsLinkTotalsCard/);
  expect(linkTotalsCard).toMatch(/analyticsTrustworthy/);
  expect(linkTotalsCard).toMatch(/Public Link/);
  expect(linkTotalsCard).toMatch(/password or email Requirement/);
});
