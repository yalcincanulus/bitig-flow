import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { roles, type PermissionRequest } from "#/lib/access-control";
import { auth, findOrganizationMembership } from "#/server/auth";
import { organizationIdSchema } from "#/server/ids";

const roleSchema = z.enum(["owner", "admin", "member"]);

function signInRedirect(): never {
  throw redirect({ href: "/sign-in" });
}

export type ForbiddenError = Readonly<{
  name: "ForbiddenError";
  code: "FORBIDDEN";
}>;

function forbiddenError(): ForbiddenError {
  return { name: "ForbiddenError", code: "FORBIDDEN" };
}

export function isForbiddenError(error: unknown): error is ForbiddenError {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === "FORBIDDEN"
  );
}

export const authedMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const authSession = await auth.api.getSession({ headers: getRequest().headers });
  if (!authSession) return signInRedirect();

  return next({ context: { authSession, userId: authSession.user.id } });
});

export const orgMiddleware = createMiddleware({ type: "function" })
  .middleware([authedMiddleware])
  .server(async ({ next, context }) => {
    const activeOrganizationId = context.authSession.session.activeOrganizationId;
    if (!activeOrganizationId) return signInRedirect();

    // This is the only application boundary allowed to mint an OrganizationId.
    const orgId = organizationIdSchema.parse(activeOrganizationId);
    const membership = await findOrganizationMembership(orgId, context.userId);

    if (!membership) return signInRedirect();

    return next({
      context: {
        orgId,
        organization: membership.organization,
        role: roleSchema.parse(membership.role),
      },
    });
  });

export function permission(request: PermissionRequest) {
  return createMiddleware({ type: "function" })
    .middleware([orgMiddleware])
    .server(async ({ next, context }) => {
      if (!roles[context.role].authorize(request).success) {
        throw forbiddenError();
      }

      return next();
    });
}
