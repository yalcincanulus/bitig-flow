import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { operatorMiddleware } from "#/server/auth-middleware";
import { readDemoOperationsRecords } from "#/server/repositories/demo-operations";

export const Route = createFileRoute("/api/operations/demo-records")({
  server: {
    middleware: [operatorMiddleware],
    handlers: {
      GET: async () =>
        Response.json(await readDemoOperationsRecords(), {
          headers: { "Cache-Control": "no-store" },
        }),
    },
  },
});
