import { createFileRoute } from "@tanstack/react-router";
// Load TanStack Start's server-route augmentation for createFileRoute.
import type {} from "@tanstack/react-start";

import { auth } from "#/server/auth";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
});
