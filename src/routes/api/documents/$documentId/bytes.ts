import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { orgMiddleware } from "#/server/auth-middleware";
import { documentIdSchema } from "#/server/ids";
import { findDocument } from "#/server/repositories/documents";
import { byteErrorResponse, streamDocument } from "#/server/stream-document";

export const Route = createFileRoute("/api/documents/$documentId/bytes")({
  server: {
    middleware: [orgMiddleware],
    handlers: {
      GET: async ({ request, params, context }) => {
        const parsed = documentIdSchema.safeParse(params.documentId);
        if (!parsed.success) return byteErrorResponse(404);

        const found = await findDocument(context.orgId, parsed.data);
        if (!found) return byteErrorResponse(404);

        const disposition =
          new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";

        return streamDocument({
          document: found,
          range: request.headers.get("range"),
          disposition,
        });
      },
    },
  },
});
