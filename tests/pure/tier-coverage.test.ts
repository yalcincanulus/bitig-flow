import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

import { serverFunctionsIn, serverRoutesIn, sourceFilePaths } from "./tier-scan";

const projectDirectory = fileURLToPath(new URL("../../", import.meta.url));
const serverFunctionDirectory = join(projectDirectory, "src/server/functions");
const routeDirectory = join(projectDirectory, "src/routes");

// Better Auth's catch-all owns its own credential path and is not ours to gate (ADR-0013). It is
// named here one file at a time on purpose: a pattern would silently exempt every future route
// that happened to match it.
const routesExemptFromTiers: ReadonlySet<string> = new Set(["src/routes/api/auth/$.ts"]);

function declarationsIn(
  directory: string,
  scan: (name: string, source: string) => ReadonlyArray<{ name: string; declaresTier: boolean }>,
) {
  return sourceFilePaths(directory).flatMap((path) => {
    const name = relative(projectDirectory, path);
    return scan(name, readFileSync(path, "utf8"));
  });
}

test("every server function declares a middleware tier", () => {
  // Runtime introspection was attempted first. TanStack Start's assembled functions expose RPC
  // metadata but not the builder's middleware options, so the sanctioned static scan is required.
  const serverFunctions = declarationsIn(serverFunctionDirectory, serverFunctionsIn);
  const functionsWithoutTier = serverFunctions
    .filter((serverFunction) => !serverFunction.declaresTier)
    .map((serverFunction) => serverFunction.name);

  expect(
    serverFunctions,
    "the server-function directory must contain server functions",
  ).not.toEqual([]);
  expect(functionsWithoutTier, "server functions without a middleware tier").toEqual([]);
});

test("every server route declares a middleware tier", () => {
  // A server route is not a server function, so the scan above cannot see it — and a server route
  // is where a missing tier is a data leak rather than a bug.
  const serverRoutes = declarationsIn(routeDirectory, serverRoutesIn);
  const routesWithoutTier = serverRoutes
    .filter(
      (serverRoute) => !serverRoute.declaresTier && !routesExemptFromTiers.has(serverRoute.name),
    )
    .map((serverRoute) => serverRoute.name);
  const routeNames = new Set(serverRoutes.map((serverRoute) => serverRoute.name));

  expect(serverRoutes, "the route directory must contain server routes").not.toEqual([]);
  expect(
    [...routesExemptFromTiers].filter((name) => !routeNames.has(name)),
    "exempted routes that no longer exist",
  ).toEqual([]);
  expect(routesWithoutTier, "server routes without a middleware tier").toEqual([]);
});

test("a server route without tier middleware is reported by name", () => {
  const source = `
    import { createFileRoute } from "@tanstack/react-router";

    export const Route = createFileRoute("/api/bytes/$documentId")({
      server: {
        handlers: { GET: ({ params }) => streamDocument(params.documentId) },
      },
    });
  `;

  expect(serverRoutesIn("src/routes/api/bytes/$documentId.ts", source)).toEqual([
    { name: "src/routes/api/bytes/$documentId.ts", declaresTier: false },
  ]);
});

test("a server route declaring orgMiddleware passes", () => {
  const source = `
    import { createFileRoute } from "@tanstack/react-router";

    export const Route = createFileRoute("/api/bytes/$documentId")({
      server: {
        middleware: [orgMiddleware],
        handlers: { GET: ({ params }) => streamDocument(params.documentId) },
      },
    });
  `;

  expect(serverRoutesIn("src/routes/api/bytes/$documentId.ts", source)).toEqual([
    { name: "src/routes/api/bytes/$documentId.ts", declaresTier: true },
  ]);
});

test("being signed in is not a tier for a server route", () => {
  const source = `
    import { createFileRoute } from "@tanstack/react-router";

    export const Route = createFileRoute("/api/bytes/$documentId")({
      server: {
        middleware: [authedMiddleware],
        handlers: { GET: () => new Response("ok") },
      },
    });
  `;

  expect(serverRoutesIn("src/routes/api/bytes/$documentId.ts", source)).toEqual([
    { name: "src/routes/api/bytes/$documentId.ts", declaresTier: false },
  ]);
});

test("a server block the scan cannot read counts as untiered", () => {
  const source = `
    import { createFileRoute } from "@tanstack/react-router";

    export const Route = createFileRoute("/api/bytes/$documentId")({ server: byteServerOptions });
  `;

  expect(serverRoutesIn("src/routes/api/bytes/$documentId.ts", source)).toEqual([
    { name: "src/routes/api/bytes/$documentId.ts", declaresTier: false },
  ]);
});

test("an aliased createFileRoute import is still scanned", () => {
  const source = `
    import { createFileRoute as fileRoute } from "@tanstack/react-router";

    export const Route = fileRoute("/api/bytes/$documentId")({
      server: { handlers: { GET: () => new Response("leak") } },
    });
  `;

  expect(serverRoutesIn("src/routes/api/bytes/$documentId.ts", source)).toEqual([
    { name: "src/routes/api/bytes/$documentId.ts", declaresTier: false },
  ]);
});

test("a route with no server block is not a server route", () => {
  const source = `
    import { createFileRoute } from "@tanstack/react-router";

    export const Route = createFileRoute("/dashboard")({ component: Dashboard });
  `;

  expect(serverRoutesIn("src/routes/dashboard.tsx", source)).toEqual([]);
});

test("a Viewer Gate POST declaring gateCredential passes", () => {
  const source = `
    import { createFileRoute } from "@tanstack/react-router";

    export const Route = createFileRoute("/v/$slug")({
      server: {
        middleware: [gateCredential],
        handlers: {
          POST: () => new Response(null, { status: 303 }),
        },
      },
    });
  `;

  expect(serverRoutesIn("src/routes/v/$slug.tsx", source)).toEqual([
    { name: "src/routes/v/$slug.tsx", declaresTier: true },
  ]);
});

test("orgMiddleware is not a Viewer Gate credential", () => {
  const source = `
    import { createFileRoute } from "@tanstack/react-router";

    export const Route = createFileRoute("/v/$slug")({
      server: {
        middleware: [orgMiddleware],
        handlers: { POST: () => new Response(null, { status: 303 }) },
      },
    });
  `;

  expect(serverRoutesIn("src/routes/v/$slug.tsx", source)).toEqual([
    { name: "src/routes/v/$slug.tsx", declaresTier: false },
  ]);
});

test("gateCredential does not tier a Dashboard byte route", () => {
  const source = `
    import { createFileRoute } from "@tanstack/react-router";

    export const Route = createFileRoute("/api/documents/$documentId/bytes")({
      server: {
        middleware: [gateCredential],
        handlers: { GET: () => new Response("leak") },
      },
    });
  `;

  expect(serverRoutesIn("src/routes/api/documents/$documentId/bytes.ts", source)).toEqual([
    { name: "src/routes/api/documents/$documentId/bytes.ts", declaresTier: false },
  ]);
});

test("a Dashboard byte route without orgMiddleware still fails", () => {
  const source = `
    import { createFileRoute } from "@tanstack/react-router";

    export const Route = createFileRoute("/api/documents/$documentId/bytes")({
      server: {
        handlers: { GET: () => new Response("leak") },
      },
    });
  `;

  expect(serverRoutesIn("src/routes/api/documents/$documentId/bytes.ts", source)).toEqual([
    { name: "src/routes/api/documents/$documentId/bytes.ts", declaresTier: false },
  ]);
});

test("handler-level middleware does not stand in for a route-level tier", () => {
  const source = `
    import { createFileRoute } from "@tanstack/react-router";

    export const Route = createFileRoute("/api/bytes/$documentId")({
      server: {
        handlers: ({ createHandlers }) =>
          createHandlers({
            GET: { middleware: [orgMiddleware], handler: () => new Response("ok") },
          }),
      },
    });
  `;

  expect(serverRoutesIn("src/routes/api/bytes/$documentId.ts", source)).toEqual([
    { name: "src/routes/api/bytes/$documentId.ts", declaresTier: false },
  ]);
});
