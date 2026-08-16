import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync, Visitor, type EcmaScriptModule, type Expression } from "oxc-parser";
import { expect, test } from "vitest";

const projectDirectory = fileURLToPath(new URL("../../", import.meta.url));
const serverFunctionDirectory = join(projectDirectory, "src/server/functions");
const tierMiddlewareNames = new Set(["authedMiddleware", "orgMiddleware"]);

type ServerFunctionDeclaration = Readonly<{
  name: string;
  declaresTier: boolean;
}>;

type ChainedMethodCall = Readonly<{
  methodName: string;
  receiver: Expression;
  arguments: Extract<Expression, { type: "CallExpression" }>["arguments"];
}>;

type ServerFunctionFactories = Readonly<{
  named: ReadonlySet<string>;
  namespaces: ReadonlySet<string>;
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

function chainedMethodCall(expression: Expression): ChainedMethodCall | undefined {
  if (expression.type !== "CallExpression") return undefined;
  if (expression.callee.type !== "MemberExpression" || expression.callee.computed) return undefined;

  return {
    methodName: expression.callee.property.name,
    receiver: expression.callee.object,
    arguments: expression.arguments,
  };
}

function isServerFunctionFactory(
  expression: Expression,
  factories: ServerFunctionFactories,
): boolean {
  if (expression.type === "Identifier") return factories.named.has(expression.name);

  return (
    expression.type === "MemberExpression" &&
    !expression.computed &&
    expression.object.type === "Identifier" &&
    factories.namespaces.has(expression.object.name) &&
    expression.property.name === "createServerFn"
  );
}

function chainStartsWithCreateServerFn(
  expression: Expression,
  factories: ServerFunctionFactories,
): boolean {
  if (expression.type !== "CallExpression") return false;
  if (isServerFunctionFactory(expression.callee, factories)) return true;
  const call = chainedMethodCall(expression);
  if (!call) return false;

  return chainStartsWithCreateServerFn(call.receiver, factories);
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
  const call = chainedMethodCall(expression);
  if (!call) return false;

  if (
    call.methodName === "middleware" &&
    call.arguments.some(
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

  return chainDeclaresTier(call.receiver);
}

function sourceLocation(source: string, offset: number): string {
  const linesBeforeExpression = source.slice(0, offset).split("\n");
  return `${linesBeforeExpression.length}:${linesBeforeExpression.at(-1)!.length + 1}`;
}

function serverFunctionFactories(module: EcmaScriptModule): ServerFunctionFactories {
  const named = new Set<string>();
  const namespaces = new Set<string>();

  for (const imported of module.staticImports) {
    if (imported.moduleRequest.value !== "@tanstack/react-start") continue;

    for (const entry of imported.entries) {
      if (entry.importName.name === "createServerFn") named.add(entry.localName.value);
      if (entry.importName.name === null) namespaces.add(entry.localName.value);
    }
  }

  return { named, namespaces };
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
  const factories = serverFunctionFactories(parsed.module);

  new Visitor({
    CallExpression(node) {
      if (
        chainedMethodCall(node)?.methodName === "handler" &&
        chainStartsWithCreateServerFn(node, factories)
      ) {
        declarations.push({
          name: `${relative(projectDirectory, path)}:${sourceLocation(source, node.start)}`,
          declaresTier: chainDeclaresTier(node),
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
