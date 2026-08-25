import { createFileRoute } from "@tanstack/react-router";
// Load TanStack Start's server-route augmentation for createFileRoute.
import type {} from "@tanstack/react-start";

import { handleAuthRequest } from "#/server/auth-request";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthRequest(request),
      POST: ({ request }) => handleAuthRequest(request),
    },
  },
});
