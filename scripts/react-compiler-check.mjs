import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { transform } from "oxc-transform-react";

const cwd = process.cwd();
const root = resolve(process.argv[2] ?? cwd);

const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

const ignoredDirectories = new Set([
  "node_modules",
  ".git",
  ".vite",
  "dist",
  "build",
  ".output",
  ".vinxi",
  "coverage",
  ".logs",
  ".agents",
  ".claude",
  ".pnpm-store",
  ".tanstack",
  ".storybook",
  ".vercel",
  ".next",
  ".astro",
  ".svelte",
  ".vue",
  ".react",
  ".react-native",
  ".vscode",
  ".idea",
  ".env",
  "drizzle",
  "infra",
]);

async function collectFiles(directory, files = []) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".") {
      if (ignoredDirectories.has(entry.name)) continue;
    }

    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;

      await collectFiles(path, files);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!extensions.has(extname(entry.name))) continue;

    // Type declaration files are irrelevant to React Compiler.
    if (entry.name.endsWith(".d.ts")) continue;

    files.push(path);
  }

  return files;
}

function printDiagnostic(file, diagnostic) {
  const severity = String(diagnostic.severity ?? "unknown").toLowerCase();

  console.log();
  console.log(`${relative(cwd, file)} [${severity}]`);

  console.log(diagnostic.message);

  if (diagnostic.codeframe) {
    console.log();
    console.log(diagnostic.codeframe);
  }

  if (diagnostic.helpMessage) {
    console.log();
    console.log(`help: ${diagnostic.helpMessage}`);
  }
}

const files = await collectFiles(root);

let warningCount = 0;
let errorCount = 0;
let adviceCount = 0;

console.log(`React Compiler: checking ${files.length} files...`);

for (const file of files) {
  const source = await readFile(file, "utf8");

  let result;

  try {
    result = await transform(file, source, {
      // React Compiler runs before the JSX transform, so preserving JSX
      // keeps this checker focused on compiler diagnostics.
      jsx: "preserve",

      // Same default React Compiler configuration used by
      // viteReact({ compiler: true }).
      reactCompiler: true,
    });
  } catch (error) {
    errorCount++;

    console.error();
    console.error(`${relative(cwd, file)} [transform failure]`);
    console.error(error);

    continue;
  }

  for (const diagnostic of result.errors) {
    const severity = String(diagnostic.severity).toLowerCase();

    if (severity === "warning") {
      warningCount++;
    } else if (severity === "error") {
      errorCount++;
    } else {
      adviceCount++;
    }

    printDiagnostic(file, diagnostic);
  }
}

console.log();
console.log("React Compiler check finished.");
console.log(`Files:    ${files.length}`);
console.log(`Warnings: ${warningCount}`);
console.log(`Errors:   ${errorCount}`);
console.log(`Advice:   ${adviceCount}`);

if (errorCount > 0) {
  process.exitCode = 1;
}
