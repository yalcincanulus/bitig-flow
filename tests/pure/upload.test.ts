import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

import {
  documentKindFromMimeType,
  isUploadOverSizeCap,
  sanitizeFileName,
  sniffUploadMimeType,
  storageKeyForDocument,
  uploadMaxBytes,
} from "#/lib/upload";

const samplesDirectory = fileURLToPath(new URL("../fixtures/samples", import.meta.url));

function sample(name: string) {
  return new Uint8Array(readFileSync(join(samplesDirectory, name)));
}

test("sniffs PDF, PNG, JPEG, WebP, and GIF from their magic signatures", () => {
  expect(sniffUploadMimeType(sample("one-page.pdf"))).toBe("application/pdf");
  expect(sniffUploadMimeType(sample("pixel.png"))).toBe("image/png");
  expect(sniffUploadMimeType(sample("pixel.jpg"))).toBe("image/jpeg");
  expect(sniffUploadMimeType(sample("pixel.webp"))).toBe("image/webp");
  expect(sniffUploadMimeType(sample("pixel.gif"))).toBe("image/gif");
});

test("an SVG is absent from the signature table", () => {
  expect(sniffUploadMimeType(sample("script.svg"))).toBeUndefined();
  expect(sniffUploadMimeType(new TextEncoder().encode("not a document"))).toBeUndefined();
});

test("sanitizeFileName strips controls and separators and caps at 255 characters", () => {
  expect(sanitizeFileName("report.pdf")).toBe("report.pdf");
  expect(sanitizeFileName("a/b\\c.pdf")).toBe("abc.pdf");
  expect(sanitizeFileName("q\u0000u\u0007ote.pdf")).toBe("quote.pdf");
  expect(sanitizeFileName("x".repeat(300))).toBe("x".repeat(255));
});

test("the upload size cap is 25 MB and is not a tautology of the caller's arithmetic", () => {
  expect(uploadMaxBytes).toBe(26_214_400);
  expect(isUploadOverSizeCap(26_214_400)).toBe(false);
  expect(isUploadOverSizeCap(26_214_401)).toBe(true);
});

test("kind follows the sniffed MIME type", () => {
  expect(documentKindFromMimeType("application/pdf")).toBe("pdf");
  expect(documentKindFromMimeType("image/png")).toBe("image");
});

test("the Storage key is org/orgId/doc/documentId/original", () => {
  expect(
    storageKeyForDocument(
      "0198b8f1-6ae4-7c39-9c3d-3cfd7af20000",
      "0198b8f1-6ae4-7c39-9c3d-3cfd7af20101",
    ),
  ).toBe(
    "org/0198b8f1-6ae4-7c39-9c3d-3cfd7af20000/doc/0198b8f1-6ae4-7c39-9c3d-3cfd7af20101/original",
  );
});
