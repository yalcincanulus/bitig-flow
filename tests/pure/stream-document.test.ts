import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

import { parseSync } from "oxc-parser";

const projectDirectory = fileURLToPath(new URL("../../", import.meta.url));
const helperPath = join(projectDirectory, "src/server/stream-document.ts");

const forbiddenImportModules = [
  "#/server/auth",
  "#/server/auth-middleware",
  "#/server/auth.ts",
  "#/server/auth-middleware.ts",
];

test("the streaming helper imports no authorization and no credential module", () => {
  const source = readFileSync(helperPath, "utf8");
  const parsed = parseSync("src/server/stream-document.ts", source);
  const imported = parsed.module.staticImports.map((entry) => entry.moduleRequest.value);

  expect(imported.some((module) => forbiddenImportModules.includes(module))).toBe(false);
  expect(source).not.toMatch(/getSession|orgMiddleware|authedMiddleware|activeOrganizationId/);
  expect(source).not.toMatch(/cookie|Cookie|visitId|slug/);
});
