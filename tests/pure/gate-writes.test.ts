import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const projectDirectory = fileURLToPath(new URL("../../", import.meta.url));

test("Gate writes live in the Viewer directory and take a Slug or Link id, never an OrganizationId", () => {
  const files = [
    "src/server/viewer/submit-gate.ts",
    "src/server/viewer/gate-progress.ts",
    "src/server/viewer/credential-guess-limit.ts",
    "src/server/viewer/form-submission-limit.ts",
    "src/server/viewer/mint-visit.ts",
  ];

  for (const file of files) {
    const source = readFileSync(join(projectDirectory, file), "utf8");
    expect(source, file).not.toMatch(/OrganizationId|orgMiddleware|orgId/);
  }

  expect(readFileSync(join(projectDirectory, "src/server/viewer/submit-gate.ts"), "utf8")).toMatch(
    /submitVisitorGate\(slug: string\)/,
  );
});
