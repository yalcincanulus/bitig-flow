import { createServerFn } from "@tanstack/react-start";

import { orgMiddleware } from "#/server/auth";

export const getDashboardContext = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .handler(({ context }) => ({
    session: context.authSession,
    organization: context.organization,
    role: context.role,
  }));
