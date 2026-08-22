import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";

import { hasPermission, roleSchema, type PermissionRequest } from "#/lib/access-control";
import { auth, findOrganizationMembership } from "#/server/auth";
import { organizationIdSchema } from "#/server/ids";

function signInRedirect(): never {
  throw redirect({ href: "/sign-in" });
}

function onboardingRedirect(): never {
  throw redirect({ href: "/onboarding" });
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

export const authedMiddleware = createMiddleware().server(async ({ next, request }) => {
  const authSession = await auth.api.getSession({ headers: request.headers });
  if (!authSession) return signInRedirect();

  return next({ context: { authSession, userId: authSession.user.id } });
});

export const orgMiddleware = createMiddleware()
  .middleware([authedMiddleware])
  .server(async ({ next, context, request }) => {
    const headers = request.headers;
    const organizations = (await auth.api.listOrganizations({ headers })) ?? [];
    if (organizations.length === 0) return onboardingRedirect();

    const activeOrganizationId = context.authSession.session.activeOrganizationId;
    if (activeOrganizationId) {
      const orgId = organizationIdSchema.parse(activeOrganizationId);
      const membership = await findOrganizationMembership(orgId, context.userId);
      if (membership) {
        return next({
          context: {
            orgId,
            organization: membership.organization,
            role: roleSchema.parse(membership.role),
          },
        });
      }
    }

    const fallbackId = organizationIdSchema.parse(organizations[0]!.id);
    await auth.api.setActiveOrganization({
      body: { organizationId: fallbackId },
      headers,
    });
    const membership = await findOrganizationMembership(fallbackId, context.userId);
    if (!membership) return onboardingRedirect();

    return next({
      context: {
        orgId: fallbackId,
        organization: membership.organization,
        role: roleSchema.parse(membership.role),
      },
    });
  });

export function permission(request: PermissionRequest) {
  return createMiddleware({ type: "function" })
    .middleware([orgMiddleware])
    .server(async ({ next, context }) => {
      if (!hasPermission(context.role, request)) {
        throw forbiddenError();
      }

      return next();
    });
}
