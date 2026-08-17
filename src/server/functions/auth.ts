import { createServerFn } from "@tanstack/react-start";

import { authedMiddleware } from "#/server/auth-middleware";

export const hasAuthenticatedSession = createServerFn({ method: "GET" })
  .middleware([authedMiddleware])
  .handler(() => true);
