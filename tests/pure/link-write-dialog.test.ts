import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("../../src/components/link-write-dialog.tsx", import.meta.url)),
  "utf8",
);

test("the Dashboard allow_download toggle says it discourages rather than prevents downloading", () => {
  expect(source).toMatch(/discourages rather than prevents/);
  expect(source.toLowerCase()).not.toMatch(/protected|secure/);
});

test("the Link delete dialog names the Visit count, says it cannot be undone, and points at deactivating", () => {
  const copy = readFileSync(
    fileURLToPath(new URL("../../src/lib/cascade-delete-copy.ts", import.meta.url)),
    "utf8",
  );

  expect(source).toMatch(/linkDeleteWarning\(visitCount\)/);
  expect(copy).toMatch(/cannot be undone/);
  expect(copy).toMatch(/Deactivate the Link/);
  expect(copy).toMatch(/visitCount === 1/);
});
