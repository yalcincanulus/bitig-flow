import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { operatorMiddleware } from "#/server/auth-middleware";
import { runDemoReaper } from "#/server/repositories/demo-reaper";

export const Route = createFileRoute("/api/operations/reaper")({
  server: {
    middleware: [operatorMiddleware],
    handlers: {
      POST: async () =>
        Response.json(await runDemoReaper(), {
          headers: { "Cache-Control": "no-store" },
        }),
    },
  },
});
