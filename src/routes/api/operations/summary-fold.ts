import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { operatorMiddleware } from "#/server/auth-middleware";
import { runDemoSummaryFold } from "#/server/repositories/demo-summary-fold";

export const Route = createFileRoute("/api/operations/summary-fold")({
  server: {
    middleware: [operatorMiddleware],
    handlers: {
      POST: async () =>
        Response.json(await runDemoSummaryFold(), {
          headers: { "Cache-Control": "no-store" },
        }),
    },
  },
});
