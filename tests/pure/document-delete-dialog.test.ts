import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

test("the Document delete dialog names the lost analytics history without a count", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL("../../src/routes/_authenticated/dashboard/documents/index.tsx", import.meta.url),
    ),
    "utf8",
  );

  expect(source).toMatch(/reading\s+history is deleted/);
  expect(source).toMatch(/analytics totals for affected links will decrease/);
  expect(source).not.toMatch(/visitCount/);
});
