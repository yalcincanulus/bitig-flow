import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { z } from "zod";

import { operatorMiddleware } from "#/server/auth-middleware";
import { terminateDemoEnvironment } from "#/server/repositories/demo-lifecycle";

export const Route = createFileRoute("/api/operations/demo-environments/$environmentId/end")({
  server: {
    middleware: [operatorMiddleware],
    handlers: {
      POST: async ({ params }) => {
        const environmentId = z.uuid().safeParse(params.environmentId);
        if (!environmentId.success) {
          return Response.json(
            { error: "Demo Environment not found" },
            { status: 404, headers: { "Cache-Control": "no-store" } },
          );
        }
        return Response.json(
          await terminateDemoEnvironment(environmentId.data, "operator_terminated"),
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
