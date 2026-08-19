import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { gateCredential } from "#/server/viewer/gate-credential";
import { ingestBeacon } from "#/server/viewer/ingest-beacon";

export const Route = createFileRoute("/v/$slug/beacon")({
  server: {
    middleware: [gateCredential],
    handlers: {
      POST: ({ request }) => ingestBeacon(request),
    },
  },
});
