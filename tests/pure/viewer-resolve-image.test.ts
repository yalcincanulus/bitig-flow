import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { viewerBytesUrl, viewerResolveImage } from "#/lib/document-bytes";

const viewerComponentSources = [
  "../../src/components/viewer-content-page.tsx",
  "../../src/components/viewer-page.tsx",
  "../../src/components/viewer-pdf.tsx",
  "../../src/components/viewer-pdf-document.tsx",
  "../../src/components/viewer-image.tsx",
  "../../src/components/viewer-byte-document.tsx",
  "../../src/components/viewer-bytes-status.tsx",
  "../../src/components/viewer-download-control.tsx",
  "../../src/components/viewer-uploading-state.tsx",
];

const heldId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20101";
const slug = "abc123xy";

test("a held Reference maps to this Link's byte route", () => {
  const resolveImage = viewerResolveImage(slug, new Set([heldId]));

  expect(resolveImage(`doc/${heldId}`)).toBe(viewerBytesUrl(slug, heldId));
});

test("a remote URL does not resolve", () => {
  const resolveImage = viewerResolveImage(slug, new Set([heldId]));

  expect(resolveImage("https://evil.example/pixel.png")).toBeUndefined();
});

test("a malformed reference does not resolve", () => {
  const resolveImage = viewerResolveImage(slug, new Set([heldId]));

  expect(resolveImage("doc/not-a-uuid")).toBeUndefined();
  expect(resolveImage(`doc/${heldId} `)).toBeUndefined();
});

test("a reference this Document does not hold does not resolve", () => {
  const resolveImage = viewerResolveImage(slug, new Set([heldId]));
  const deletedId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20199";

  expect(resolveImage(`doc/${deletedId}`)).toBeUndefined();
});

test("the Viewer slug route never preloads or caches its loader", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../src/routes/v/$slug.index.tsx", import.meta.url)),
    "utf8",
  );

  expect(source).toMatch(/preload:\s*false/);
  expect(source).toMatch(/staleTime:\s*0/);
});

test("the Viewer member route never preloads or caches its loader", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../src/routes/v/$slug.$documentId.tsx", import.meta.url)),
    "utf8",
  );

  expect(source).toMatch(/preload:\s*false/);
  expect(source).toMatch(/staleTime:\s*0/);
});

test("a download request uses the button query on the Link's byte route", () => {
  expect(viewerBytesUrl(slug, heldId, { download: true })).toBe(
    `/v/${slug}/bytes/${heldId}?download=button`,
  );
});

test("Viewer content panes never invalidate a loader", () => {
  for (const relativePath of viewerComponentSources) {
    const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
    expect(source, relativePath).not.toMatch(/invalidate\(/);
  }
});
