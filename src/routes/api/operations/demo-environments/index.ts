import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { fleetDeletionRequestSchema } from "#/lib/operations";
import { operatorMiddleware } from "#/server/auth-middleware";
import { deleteDemoEnvironmentBatch } from "#/server/repositories/demo-operations";

const noStoreHeaders = { "Cache-Control": "no-store" };

export const Route = createFileRoute("/api/operations/demo-environments/")({
  server: {
    middleware: [operatorMiddleware],
    handlers: {
      DELETE: async ({ request, context }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json(
            { error: "Fleet deletion confirmation must be valid JSON" },
            { status: 400, headers: noStoreHeaders },
          );
        }

        const parsed = fleetDeletionRequestSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Type the required fleet deletion confirmation exactly" },
            { status: 422, headers: noStoreHeaders },
          );
        }

        return Response.json(await deleteDemoEnvironmentBatch(context.operatorUserId), {
          headers: noStoreHeaders,
        });
      },
    },
  },
});
