import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

import { documentBytesUrl } from "#/lib/document-bytes";
import { previewQueryKey } from "#/lib/document-preview";
import { renderHtml } from "#/lib/render-html";

import { sourceFilePaths } from "./tier-scan";

const imageId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20101";

test("raw HTML in markdown does not reach the output", () => {
  const html = renderHtml(
    'Hello <script>alert(1)</script> <img src="x" onerror="alert(1)">',
    () => undefined,
  );

  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(html).toContain("&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;");
});

test("a javascript URL is dead and a link opens in a new tab without opener", () => {
  const html = renderHtml(
    "[Click](javascript:alert(1)) and [docs](https://example.com)",
    () => undefined,
  );

  expect(html).not.toContain("javascript:");
  expect(html).toContain("Click");
  expect(html).toContain(
    '<a href="https://example.com" rel="noopener noreferrer" target="_blank">docs</a>',
  );
});

test("an unresolved image is its alt text and a Document reference uses the resolver", () => {
  const html = renderHtml(
    "![beacon](https://evil.example/pixel.png) and ![logo](doc/" + imageId + ")",
    (src) => (src === `doc/${imageId}` ? documentBytesUrl(imageId) : undefined),
  );

  expect(html).not.toContain("evil.example");
  expect(html).toContain("beacon");
  expect(html).not.toContain('<img src="https://');
  expect(html).toContain(`<img src="${documentBytesUrl(imageId)}" alt="logo">`);
});

test("markdown becomes HTML in exactly one module", () => {
  const projectDirectory = fileURLToPath(new URL("../../", import.meta.url));
  const sourceDirectory = fileURLToPath(new URL("../../src", import.meta.url));
  const importers = sourceFilePaths(sourceDirectory).filter((path) =>
    /from\s+["']@tanstack\/markdown(?:\/[^"']*)?["']/.test(readFileSync(path, "utf8")),
  );

  expect(importers.map((path) => relative(projectDirectory, path))).toEqual([
    "src/lib/render-html.ts",
  ]);
});

test("an autosave's updatedAt is a different Preview cache key", () => {
  const first = previewQueryKey(imageId, new Date("2026-08-17T12:00:00.000Z"));
  const second = previewQueryKey(imageId, new Date("2026-08-17T12:00:01.000Z"));

  expect(first).toEqual(["documents", imageId, "preview", "2026-08-17T12:00:00.000Z"]);
  expect(second).toEqual(["documents", imageId, "preview", "2026-08-17T12:00:01.000Z"]);
});
