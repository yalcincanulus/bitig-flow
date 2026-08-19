import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

test("the Dashboard allow_download toggle says it discourages rather than prevents downloading", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../src/components/link-write-dialog.tsx", import.meta.url)),
    "utf8",
  );

  expect(source).toMatch(/discourages rather than prevents/);
  expect(source.toLowerCase()).not.toMatch(/protected|secure/);
});
