import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { viewerBytesUrl, viewerResolveImage } from "#/lib/document-bytes";

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
    fileURLToPath(new URL("../../src/routes/v/$slug.tsx", import.meta.url)),
    "utf8",
  );

  expect(source).toMatch(/preload:\s*false/);
  expect(source).toMatch(/staleTime:\s*0/);
});
