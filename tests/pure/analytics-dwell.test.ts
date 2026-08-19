import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { dwellPagesWithZeros } from "#/lib/analytics-fold";

const screenSource = readFileSync(
  fileURLToPath(
    new URL("../../src/routes/_authenticated/dashboard/analytics.$linkId.tsx", import.meta.url),
  ),
  "utf8",
);

test("a PDF with no Dwell still lists every page at zero", () => {
  expect(dwellPagesWithZeros(4, [])).toEqual([
    { page: 1, ms: 0 },
    { page: 2, ms: 0 },
    { page: 3, ms: 0 },
    { page: 4, ms: 0 },
  ]);
});

test("a PDF keeps recorded Dwell on its pages and fills the rest with zero", () => {
  expect(dwellPagesWithZeros(3, [{ page: 2, ms: 4_000 }])).toEqual([
    { page: 1, ms: 0 },
    { page: 2, ms: 4_000 },
    { page: 3, ms: 0 },
  ]);
});

test("the markdown analytics arm says reading position is not recorded", () => {
  expect(screenSource).toMatch(/kind === "markdown"/);
  expect(screenSource).toMatch(/reading position is not recorded/i);
});

test("the image analytics arm does not say reading position is not recorded", () => {
  expect(screenSource).not.toMatch(
    /kind === "image"[\s\S]{0,200}reading position is not recorded/i,
  );
  expect(screenSource).not.toMatch(
    /reading position is not recorded[\s\S]{0,200}kind === "image"/i,
  );
});

test("the PDF analytics arm shows pages at zero alongside the open count", () => {
  expect(screenSource).toMatch(/kind === "pdf"/);
  expect(screenSource).toMatch(/Views/);
  expect(screenSource).toMatch(/Opened and ignored/);
  expect(screenSource).toMatch(/dwellPagesWithZeros\(document\?\.pageCount/);
  expect(screenSource).not.toMatch(/kind === undefined && row\.pages\.length > 0/);
});

test("a truncated range is never headed Totals", () => {
  expect(screenSource).not.toMatch(/<CardTitle>Totals<\/CardTitle>/);
  expect(screenSource).toMatch(/not a total/);
});
