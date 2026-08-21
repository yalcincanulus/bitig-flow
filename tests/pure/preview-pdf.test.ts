import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { sourceFilePaths } from "./tier-scan";

const projectDirectory = fileURLToPath(new URL("../../", import.meta.url));

function sourceOf(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const previewPdf = sourceOf("../../src/components/preview-pdf-document.tsx");
const visiblePage = sourceOf("../../src/components/viewer-pdf-visible-page-context.ts");
const detailRoute = sourceOf(
  "../../src/routes/_authenticated/dashboard/documents/$documentId/index.tsx",
);

test("the Preview mounts the same PDF island the Viewer uses", () => {
  expect(previewPdf).toMatch(/lazy\(\(\)\s*=>\s*import\("#\/components\/viewer-pdf"\)\)/);
  expect(detailRoute).toMatch(/<PreviewPdfDocument/);
});

test("the Preview passes the Dashboard byte route's URL and no Viewer credential", () => {
  expect(previewPdf).toMatch(/documentBytesUrl\(/);
  expect(previewPdf).not.toMatch(/viewerBytesUrl|viewerBeaconUrl|["'`]\/v\//);
});

test("the Preview mounts no Dwell accumulator", () => {
  for (const source of [previewPdf, detailRoute]) {
    expect(source).not.toMatch(
      /from "#\/components\/viewer-dwell"|from "#\/lib\/dwell-accumulator"/,
    );
    expect(source).not.toMatch(/ViewerDwell|useDwellPage|sendBeacon/);
  }
});

// The island calls useReportPdfVisiblePage() unconditionally. Off the /v layout there is no
// provider, so ADR-0060's "the Preview passes nothing" rests entirely on the context's no-op
// default — which is why the default, and the Preview's lack of a provider, are asserted here.
test("the Preview names no visible page, and the reporter defaults to a no-op", () => {
  expect(visiblePage).toMatch(/createContext<\(page: number\) => void>\(\(\) => \{\}\)/);
  expect(previewPdf).not.toMatch(/PdfVisiblePageProvider/);
  expect(detailRoute).not.toMatch(/PdfVisiblePageProvider/);
});

test("a Document that is not a PDF renders the uploading state or its own pane, never the island", () => {
  expect(detailRoute.indexOf('status === "pending"')).toBeLessThan(
    detailRoute.indexOf("<PreviewPdfDocument"),
  );
  // The pending branch's markup is the Preview's business; that it is the branch a pending
  // Document lands in, and that only the PDF branch reaches the island, is not.
  expect(detailRoute).toMatch(/status === "pending" \? \([^)]*Uploading…/);
  expect(detailRoute).toMatch(/document\.kind === "pdf" \? \(\s*<PreviewPdfDocument/);
});

// Every route that is not a PDF pane must be able to render without the engine reaching the
// bundle, so the one module that pulls pdfjs-dist may only ever be reached through a lazy import.
test("nothing imports the PDF island statically", () => {
  const staticImporters = sourceFilePaths(`${projectDirectory}src`).filter((path) =>
    /^import[^\n]*from ["']#\/components\/viewer-pdf["']/m.test(readFileSync(path, "utf8")),
  );

  expect(staticImporters).toEqual([]);
});
