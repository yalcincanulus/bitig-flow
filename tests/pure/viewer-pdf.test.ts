import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

function sourceOf(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const viewerPdf =
  sourceOf("../../src/components/viewer-pdf.tsx") +
  sourceOf("../../src/components/viewer-pdf-engine.ts");
const viewerPdfDocument = sourceOf("../../src/components/viewer-pdf-document.tsx");
const viewerContentPage = sourceOf("../../src/components/viewer-content-page.tsx");
const dwellAccumulator = sourceOf("../../src/lib/dwell-accumulator.ts");

test("the PDF island takes a byte URL and a page count and nothing else", () => {
  expect(viewerPdf).toMatch(/bytesUrl:\s*string/);
  expect(viewerPdf).toMatch(/pageCount:\s*number\s*\|\s*null/);
  expect(viewerPdf).not.toMatch(/allowDownload/);
  expect(viewerPdf).not.toMatch(/documentId/);
  expect(viewerPdf).not.toMatch(/useDwellPage/);
  expect(viewerPdf).not.toMatch(/dwell-accumulator/);
});

test("the PDF island is loaded only from the PDF document branch", () => {
  expect(viewerPdfDocument).toMatch(/lazy\(\(\)\s*=>\s*import\("#\/components\/viewer-pdf"\)\)/);
  expect(viewerContentPage).not.toMatch(/viewer-pdf["']/);
  expect(viewerContentPage).toMatch(/ViewerPdfDocument/);
});

test("markdown and image panes never import pdfjs-dist", () => {
  expect(viewerContentPage).not.toMatch(/pdfjs-dist/);
  expect(sourceOf("../../src/components/viewer-image.tsx")).not.toMatch(/pdfjs-dist/);
  expect(sourceOf("../../src/components/viewer-page.tsx")).not.toMatch(/pdfjs-dist/);
  expect(sourceOf("../../src/components/viewer-pdf.tsx")).not.toMatch(
    /^import (?!type)[^\n]*from ["']pdfjs-dist["']/m,
  );
});

test("workerSrc is a URL string from a ?url import", () => {
  expect(viewerPdf).toMatch(/pdf\.worker(?:\.min)?\.mjs\?url/);
  expect(viewerPdf).not.toMatch(/\?worker(?!&url)/);
  expect(viewerPdf).not.toMatch(/node_modules\/pdfjs-dist/);
  expect(viewerPdf).not.toMatch(/new URL\([^)]*import\.meta\.url/);
});

test("bytes reach pdf.js as getDocument data, never a url", () => {
  expect(viewerPdf).toMatch(/getDocument\(\{[\s\S]*data/);
  expect(viewerPdf).not.toMatch(/getDocument\(\{[\s\S]*url:/);
});

test("cmaps are loaded from a same-origin static path", () => {
  expect(viewerPdf).toMatch(/cMapUrl:\s*["']\/pdfjs\/cmaps\/["']/);
  expect(viewerPdf).not.toMatch(/cdnjs|unpkg|jsdelivr|cdn\.mozilla/);
});

test("the dwell accumulator module is unchanged by the PDF island", () => {
  expect(dwellAccumulator).not.toMatch(/pdfjs|IntersectionObserver|viewer-pdf/);
});

// Clearing canvas.width blanks the page. The visible-page flag is for Dwell, not for paint, so
// it must not appear in the render effect's deps — otherwise every page crossing repaints the
// pages still on screen, which is the flash the Viewer and the Preview share.
test("painting a page does not restart when the visible page changes", () => {
  const paintEffect = sourceOf("../../src/components/viewer-pdf.tsx").match(
    /pageProxy\.render\([\s\S]*?\}, \[([^\]]*)\]\)/,
  );
  expect(paintEffect?.[1]).toBeDefined();
  expect(paintEffect?.[1]).not.toMatch(/showText/);
});

test("Viewer documents lay out as paper on the desk, not edge to edge", () => {
  const paper = sourceOf("../../src/components/viewer-paper.ts");
  expect(paper).toMatch(/max-w-\[51rem\]/);
  // The Gate keeps its own narrow measure; only the document takes the page width.
  expect(sourceOf("../../src/components/viewer-column.tsx")).toMatch(/max-w-\[26rem\]/);
  expect(sourceOf("../../src/components/viewer-shell.tsx")).toMatch(/bg-viewer-desk/);
  for (const pane of [
    viewerPdfDocument,
    viewerContentPage,
    sourceOf("../../src/components/viewer-image.tsx"),
  ]) {
    expect(pane).not.toMatch(/w-screen/);
    expect(pane).not.toMatch(/-translate-x-1\/2/);
  }
  expect(sourceOf("../../src/components/viewer-pdf.tsx")).toMatch(/viewerPaperSurface/);
});

test("rendered Markdown reaches the page through one styled body", () => {
  expect(viewerContentPage).toMatch(/MarkdownBody/);
  expect(viewerContentPage).not.toMatch(/dangerouslySetInnerHTML/);
  const markdownBody = sourceOf("../../src/components/markdown-body.tsx");
  expect(markdownBody).toMatch(/markdown-body\.css/);
});
