import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { gateCredential } from "#/server/viewer/gate-credential";
import { serveVisitorBytes } from "#/server/viewer/serve-visitor-bytes";

export const Route = createFileRoute("/v/$slug/bytes/$documentId")({
  server: {
    middleware: [gateCredential],
    handlers: {
      GET: ({ request, params }) => serveVisitorBytes(request, params.slug, params.documentId),
    },
  },
});
