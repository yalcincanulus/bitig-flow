import { createServerFn } from "@tanstack/react-start";

import { authedMiddleware, operatorMiddleware } from "#/server/auth-middleware";
import { findPlatformOperatorBindingForUser } from "#/server/repositories/platform-operator-binding";

export const platformOperatorRouteAccess = createServerFn({ method: "GET" })
  .middleware([authedMiddleware])
  .handler(async ({ context }) => {
    const binding = await findPlatformOperatorBindingForUser(context.userId);
    return {
      isOperator: Boolean(binding),
      twoFactorEnrolled: context.authSession.user.twoFactorEnabled === true,
    };
  });

export const operationsLanding = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(({ context }) => ({ email: context.authSession.user.email }));
