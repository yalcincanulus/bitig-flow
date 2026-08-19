import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { dwellPagesWithZeros } from "#/lib/analytics-fold";

import { sourceFilePaths } from "./tier-scan";

const projectDirectory = fileURLToPath(new URL("../../", import.meta.url));
const screenSource = readFileSync(
  fileURLToPath(
    new URL("../../src/routes/_authenticated/dashboard/analytics.$linkId.tsx", import.meta.url),
  ),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

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

test("the Dwell chart is pinned at exact Charts 0.14.0 and adds no d3 package", () => {
  expect(packageJson.dependencies?.["@tanstack/charts"]).toBe("0.14.0");
  const declared = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ];
  expect(declared.filter((name) => name === "d3" || name.startsWith("d3-"))).toEqual([]);
});

test("exactly one component imports Charts, and its props are page and millisecond pairs", () => {
  const importers = sourceFilePaths(`${projectDirectory}src`).filter((path) =>
    /from\s+["']@tanstack\/charts(?:\/[^"']*)?["']/.test(readFileSync(path, "utf8")),
  );

  expect(importers.map((path) => relative(projectDirectory, path))).toEqual([
    "src/components/analytics-dwell-chart.tsx",
  ]);

  const chartSource = readFileSync(importers[0]!, "utf8");
  expect(chartSource).toMatch(/pages:\s*ReadonlyArray<\{\s*page:\s*number;\s*ms:\s*number\s*\}>/);
  expect(chartSource).toMatch(/useMemo\(\(\)\s*=>\s*\{[\s\S]*defineChart\(/);
  expect(chartSource).toMatch(/row\.page === .*page && row\.ms === .*ms/);
  expect(chartSource).toMatch(/,\s*\[pages\]\)/);
  expect(chartSource).toMatch(/ariaLabel=/);
  expect(chartSource).toMatch(/from ["']@tanstack\/charts["']/);
  expect(chartSource).toMatch(/from ["']@tanstack\/charts\/react["']/);
  expect(chartSource).toMatch(/from ["']@tanstack\/charts\/scales\/band["']/);
  expect(chartSource).toMatch(/from ["']@tanstack\/charts\/scales\/linear["']/);
  expect(chartSource).not.toMatch(/from ["']d3(?:-[^"']*)?["']/);
});

test("the numbers table still renders, with the Dwell chart above it on the PDF arm", () => {
  expect(screenSource).toMatch(/<DwellTable/);
  expect(screenSource.indexOf("<AnalyticsDwellChart")).toBeLessThan(
    screenSource.indexOf("<DwellTable"),
  );
  expect(screenSource).toMatch(/showPages \?[\s\S]*<AnalyticsDwellChart[\s\S]*<DwellTable/);
  expect(screenSource).toMatch(/const showPages = kind === "pdf"/);
});
