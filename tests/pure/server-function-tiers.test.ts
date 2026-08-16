import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync, Visitor, type Expression } from "oxc-parser";
import { expect, test } from "vitest";

const projectDirectory = fileURLToPath(new URL("../../", import.meta.url));
const serverFunctionDirectory = join(projectDirectory, "src/server/functions");
const tierMiddlewareNames = new Set(["authedMiddleware", "orgMiddleware"]);

type ServerFunctionDeclaration = Readonly<{
  name: string;
  declaresTier: boolean;
}>;

function sourceFilePaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFilePaths(path);
      return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path] : [];
    })
    .sort();
}

function chainCallsMethod(expression: Expression, methodName: string): boolean {
  if (expression.type !== "CallExpression") return false;
  if (expression.callee.type !== "MemberExpression" || expression.callee.computed) return false;

  return (
    expression.callee.property.name === methodName ||
    chainCallsMethod(expression.callee.object, methodName)
  );
}

function chainStartsWithCreateServerFn(expression: Expression): boolean {
  if (expression.type !== "CallExpression") return false;
  if (expression.callee.type === "Identifier") return expression.callee.name === "createServerFn";
  if (expression.callee.type !== "MemberExpression" || expression.callee.computed) return false;

  return chainStartsWithCreateServerFn(expression.callee.object);
}

function namesTierMiddleware(expression: Expression): boolean {
  if (expression.type === "Identifier") return tierMiddlewareNames.has(expression.name);

  return (
    expression.type === "CallExpression" &&
    expression.callee.type === "Identifier" &&
    expression.callee.name === "permission"
  );
}

function chainDeclaresTier(expression: Expression): boolean {
  if (expression.type !== "CallExpression") return false;
  if (expression.callee.type !== "MemberExpression" || expression.callee.computed) return false;

  if (
    expression.callee.property.name === "middleware" &&
    expression.arguments.some(
      (argument) =>
        argument.type === "ArrayExpression" &&
        argument.elements.some(
          (element) =>
            element !== null && element.type !== "SpreadElement" && namesTierMiddleware(element),
        ),
    )
  ) {
    return true;
  }

  return chainDeclaresTier(expression.callee.object);
}

function serverFunctionsIn(path: string): ServerFunctionDeclaration[] {
  const source = readFileSync(path, "utf8");
  const parsed = parseSync(path, source);
  if (parsed.errors.length > 0) {
    throw new Error(
      `Could not parse ${relative(projectDirectory, path)}: ${parsed.errors[0]!.message}`,
    );
  }
  const declarations: ServerFunctionDeclaration[] = [];

  new Visitor({
    VariableDeclarator(node) {
      if (
        node.init &&
        chainStartsWithCreateServerFn(node.init) &&
        chainCallsMethod(node.init, "handler")
      ) {
        declarations.push({
          name: `${relative(projectDirectory, path)}:${source.slice(node.id.start, node.id.end)}`,
          declaresTier: chainDeclaresTier(node.init),
        });
      }
    },
  }).visit(parsed.program);

  return declarations;
}

test("every server function declares a middleware tier", () => {
  // Runtime introspection was attempted first. TanStack Start's assembled functions expose RPC
  // metadata but not the builder's middleware options, so the sanctioned static scan is required.
  const serverFunctions = sourceFilePaths(serverFunctionDirectory).flatMap(serverFunctionsIn);
  const functionsWithoutTier = serverFunctions
    .filter((serverFunction) => !serverFunction.declaresTier)
    .map((serverFunction) => serverFunction.name);

  expect(
    serverFunctions,
    "the server-function directory must contain server functions",
  ).not.toEqual([]);
  expect(functionsWithoutTier, "server functions without a middleware tier").toEqual([]);
});
