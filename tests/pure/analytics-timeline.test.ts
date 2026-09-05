import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { formatDownloadCount, unidentifiedVisitorLabel } from "#/lib/analytics-format";

const timelineSource = readFileSync(
  fileURLToPath(new URL("../../src/components/analytics-visit-timeline.tsx", import.meta.url)),
  "utf8",
);
const screenSource = readFileSync(
  fileURLToPath(
    new URL("../../src/routes/_authenticated/dashboard/analytics.$linkId.tsx", import.meta.url),
  ),
  "utf8",
);

test("a captured email is rendered in full and the Gate mask stays off the Dashboard", () => {
  expect(timelineSource).toMatch(/identity\.email !== null/);
  expect(timelineSource).toMatch(/\{identity\.email\}/);
  expect(`${screenSource}\n${timelineSource}`).not.toMatch(/maskCapturedEmail/);
});

test("an unidentified identity is Visitor plus eight monospaced characters", () => {
  expect(unidentifiedVisitorLabel("abcdefghijklmnop")).toBe("Visitor abcdefgh");
  expect(timelineSource).toMatch(/font-mono/);
  expect(timelineSource).toMatch(/unidentifiedVisitorLabel/);
  expect(timelineSource).toMatch(/TooltipContent>\s*\{identity\.visitorId\}/);
});

test("zero downloads render as blank rather than 0", () => {
  expect(formatDownloadCount(0)).toBe("");
  expect(formatDownloadCount(2)).toBe("2");
  expect(timelineSource).toMatch(/formatDownloadCount\(row\.downloads\)/);
});

test("the Visit timeline states that Viewer identity grouping is non-transitive", () => {
  expect(timelineSource).toMatch(/can appear as separate visitors/);
  expect(screenSource).toMatch(/AnalyticsVisitTimeline/);
});
