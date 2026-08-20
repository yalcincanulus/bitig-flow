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

  expect(source).toMatch(/analytics history\s+goes/);
  expect(source).toMatch(/Links including it will show less activity/);
  expect(source).not.toMatch(/visitCount/);
});
