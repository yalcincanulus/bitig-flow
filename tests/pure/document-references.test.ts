import { expect, test } from "vitest";

import {
  clipboardLooksLikeRemoteImage,
  extractDocumentReferences,
  imageReferenceMarkdown,
} from "#/lib/document-references";

const logo = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20101";
const chart = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20102";

test("extractDocumentReferences collects unique doc/ image ids from markdown source", () => {
  const source = [
    `# Launch notes`,
    ``,
    `![logo](doc/${logo}) and a repeat ![logo](doc/${logo})`,
    `![chart](doc/${chart} "Q3")`,
    `![spaced]( doc/${logo} )`,
    `![beacon](https://evil.example/pixel.png)`,
    `![broken](doc/not-a-uuid)`,
    "```",
    `![code](doc/${logo})`,
    "```",
    `Inline \`![tick](doc/${chart})\` stays code.`,
  ].join("\n");

  expect(extractDocumentReferences(source)).toEqual([logo, chart]);
});

test("extractDocumentReferences ignores a scheme or a root-relative path", () => {
  expect(
    extractDocumentReferences(
      `![a](https://app.example/doc/${logo}) ![b](/doc/${logo}) ![c](doc:${logo})`,
    ),
  ).toEqual([]);
});

test("imageReferenceMarkdown stores a scheme-less relative reference", () => {
  expect(imageReferenceMarkdown("logo", logo)).toBe(`![logo](doc/${logo})`);
  expect(imageReferenceMarkdown("logo", logo)).not.toContain("http");
  expect(imageReferenceMarkdown("logo", logo)).not.toContain("/api/");
  expect(imageReferenceMarkdown("logo", logo)).not.toContain("/v/");
});

test("clipboardLooksLikeRemoteImage is true for a remote image URL and false for a Document reference", () => {
  expect(clipboardLooksLikeRemoteImage("https://evil.example/pixel.png")).toBe(true);
  expect(clipboardLooksLikeRemoteImage(`![logo](https://evil.example/pixel.png)`)).toBe(true);
  expect(clipboardLooksLikeRemoteImage("https://example.com/notes")).toBe(false);
  expect(clipboardLooksLikeRemoteImage(`![logo](doc/${logo})`)).toBe(false);
  expect(clipboardLooksLikeRemoteImage("See the notes")).toBe(false);
});
