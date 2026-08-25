import { createServerFn } from "@tanstack/react-start";

import { userHasReachedOwnedOrganizationLimit } from "#/server/auth";
import { orgMiddleware } from "#/server/auth-middleware";
import { findDemoEnvironmentForUser } from "#/server/repositories/demo-lifecycle";

export const getDashboardContext = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .handler(async ({ context }) => {
    const demo = context.authSession.user.isAnonymous
      ? await findDemoEnvironmentForUser(context.authSession.user.id)
      : undefined;
    return {
      session: context.authSession,
      organization: context.organization,
      role: context.role,
      demo: demo ? { expiresAt: demo.expiresAt } : undefined,
      atOwnedOrganizationLimit: await userHasReachedOwnedOrganizationLimit(
        context.authSession.user.id,
      ),
    };
  });
