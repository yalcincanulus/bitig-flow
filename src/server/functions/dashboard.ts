import { createServerFn } from "@tanstack/react-start";

import { userHasReachedOwnedOrganizationLimit } from "#/server/auth";
import { orgMiddleware } from "#/server/auth-middleware";

export const getDashboardContext = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .handler(async ({ context }) => ({
    session: context.authSession,
    organization: context.organization,
    role: context.role,
    atOwnedOrganizationLimit: await userHasReachedOwnedOrganizationLimit(
      context.authSession.user.id,
    ),
  }));
