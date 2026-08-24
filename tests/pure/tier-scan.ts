import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  parseSync,
  Visitor,
  type EcmaScriptModule,
  type Expression,
  type ObjectExpression,
} from "oxc-parser";

const functionTierNames: ReadonlySet<string> = new Set([
  "authedMiddleware",
  "orgMiddleware",
  "operatorIdentityMiddleware",
  "operatorMiddleware",
  // Possession of the emailed Invitation id, not a session (ADR-0066).
  "invitationRecipient",
]);

// A server route is stricter than a server function: Dashboard routes serve organization-owned
// bytes, so being signed in is not a tier — the request must be scoped to an organization.
// Viewer Gate POSTs declare a fourth credential instead: the Path-scoped Gate cookie, never
// `orgMiddleware`. `server.middleware` takes request middleware so a route can name its credential.
const dashboardRouteTierNames: ReadonlySet<string> = new Set(["orgMiddleware"]);
const viewerRouteTierNames: ReadonlySet<string> = new Set(["gateCredential"]);
const operationsRouteTierNames: ReadonlySet<string> = new Set(["operatorMiddleware"]);

function routeTierNamesFor(name: string): ReadonlySet<string> {
  if (/(?:^|\/)src\/routes\/api\/operations\//.test(name)) {
    return operationsRouteTierNames;
  }
  return /(?:^|\/)src\/routes\/v\//.test(name) ? viewerRouteTierNames : dashboardRouteTierNames;
}

export type TierDeclaration = Readonly<{
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

export function sourceFilePaths(directory: string): string[] {
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

function namesTierMiddleware(expression: Expression, tierNames: ReadonlySet<string>): boolean {
  if (expression.type === "Identifier") return tierNames.has(expression.name);

  return (
    expression.type === "CallExpression" &&
    expression.callee.type === "Identifier" &&
    expression.callee.name === "permission"
  );
}

function arrayNamesTierMiddleware(expression: Expression, tierNames: ReadonlySet<string>): boolean {
  return (
    expression.type === "ArrayExpression" &&
    expression.elements.some(
      (element) =>
        element !== null &&
        element.type !== "SpreadElement" &&
        namesTierMiddleware(element, tierNames),
    )
  );
}

function chainDeclaresTier(expression: Expression): boolean {
  const call = chainedMethodCall(expression);
  if (!call) return false;

  if (
    call.methodName === "middleware" &&
    call.arguments.some(
      (argument) =>
        argument.type !== "SpreadElement" && arrayNamesTierMiddleware(argument, functionTierNames),
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

function parseModule(name: string, source: string) {
  const parsed = parseSync(name, source);
  if (parsed.errors.length > 0) {
    throw new Error(`Could not parse ${name}: ${parsed.errors[0]!.message}`);
  }

  return parsed;
}

export function serverFunctionsIn(name: string, source: string): TierDeclaration[] {
  const parsed = parseModule(name, source);
  const declarations: TierDeclaration[] = [];
  const factories = serverFunctionFactories(parsed.module);

  new Visitor({
    CallExpression(node) {
      if (
        chainedMethodCall(node)?.methodName === "handler" &&
        chainStartsWithCreateServerFn(node, factories)
      ) {
        declarations.push({
          name: `${name}:${sourceLocation(source, node.start)}`,
          declaresTier: chainDeclaresTier(node),
        });
      }
    },
  }).visit(parsed.program);

  return declarations;
}

function namedProperty(object: ObjectExpression, propertyName: string): Expression | undefined {
  for (const property of object.properties) {
    if (property.type !== "Property" || property.computed) continue;
    if (property.key.type !== "Identifier" || property.key.name !== propertyName) continue;

    return property.value;
  }

  return undefined;
}

function routeFactoryNames(module: EcmaScriptModule): ReadonlySet<string> {
  const names = new Set<string>();

  for (const imported of module.staticImports) {
    if (imported.moduleRequest.value !== "@tanstack/react-router") continue;

    for (const entry of imported.entries) {
      if (entry.importName.name === "createFileRoute") names.add(entry.localName.value);
    }
  }

  return names;
}

function routeOptions(
  node: Expression,
  factoryNames: ReadonlySet<string>,
): ObjectExpression | undefined {
  // `createFileRoute("/path")({ ... })` — the options object is the argument of the outer call.
  if (node.type !== "CallExpression") return undefined;
  const factory = node.callee;
  if (
    factory.type !== "CallExpression" ||
    factory.callee.type !== "Identifier" ||
    !factoryNames.has(factory.callee.name)
  ) {
    return undefined;
  }
  const options = node.arguments[0];

  return options?.type === "ObjectExpression" ? options : undefined;
}

export function serverRoutesIn(name: string, source: string): TierDeclaration[] {
  const parsed = parseModule(name, source);
  const declarations: TierDeclaration[] = [];
  const factoryNames = routeFactoryNames(parsed.module);

  new Visitor({
    CallExpression(node) {
      const options = routeOptions(node, factoryNames);
      if (!options) return;
      const server = namedProperty(options, "server");
      // A route with no server block serves no bytes of its own; the router's guards cover it.
      if (server === undefined) return;
      // A server block the scan cannot read — spread in, or handed over as a variable — counts as
      // a server route with no tier. Anything unreadable fails rather than disappearing.
      const middleware =
        server.type === "ObjectExpression" ? namedProperty(server, "middleware") : undefined;

      declarations.push({
        name,
        // Only route-level middleware counts. Handler-level middleware would leave every handler
        // nobody annotated uncovered, which is the mistake this scan exists to catch.
        declaresTier:
          middleware !== undefined && arrayNamesTierMiddleware(middleware, routeTierNamesFor(name)),
      });
    },
  }).visit(parsed.program);

  return declarations;
}
