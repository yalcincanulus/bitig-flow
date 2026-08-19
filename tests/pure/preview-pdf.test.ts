import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

function sourceOf(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const previewPdf = sourceOf("../../src/components/preview-pdf-document.tsx");
const detailRoute = sourceOf(
  "../../src/routes/_authenticated/dashboard/documents/$documentId/index.tsx",
);

test("the Preview mounts the same PDF island the Viewer uses", () => {
  expect(previewPdf).toMatch(/lazy\(\(\)\s*=>\s*import\("#\/components\/viewer-pdf"\)\)/);
  expect(detailRoute).toMatch(/PreviewPdfDocument/);
  expect(detailRoute).not.toMatch(/viewer-pdf["']/);
  expect(detailRoute).not.toMatch(/pdfjs-dist/);
});

test("the Preview passes the Dashboard byte route's URL and nothing of the Viewer", () => {
  expect(previewPdf).toMatch(/documentBytesUrl\(/);
  expect(previewPdf).not.toMatch(/viewerBytesUrl|slug|visit/);
});

test("the Preview mounts no Dwell accumulator", () => {
  for (const source of [previewPdf, detailRoute]) {
    expect(source).not.toMatch(/dwell/i);
    expect(source).not.toMatch(/viewerBeaconUrl|sendBeacon/);
  }
});

test("a pending PDF shows the uploading state rather than the island", () => {
  const pendingBranch = previewPdf.indexOf("pending");
  expect(pendingBranch).toBe(-1);
  expect(detailRoute.indexOf('status === "pending"')).toBeLessThan(
    detailRoute.indexOf("<PreviewPdfDocument"),
  );
});
