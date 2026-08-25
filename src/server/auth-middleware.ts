import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { hasPermission, roleSchema, type PermissionRequest } from "#/lib/access-control";
import { byRecoveryOrder } from "#/lib/organization-recovery";
import { auth, findOrganizationMembership } from "#/server/auth";
import { organizationIdSchema } from "#/server/ids";
import { requiredEnv } from "#/server/runtime-env";
import { findPlatformOperatorBindingForUser } from "#/server/repositories/platform-operator-binding";
import { demoSessionAvailability } from "#/server/repositories/demo-lifecycle";

function signInRedirect(): never {
  throw redirect({ href: "/sign-in" });
}

function onboardingRedirect(): never {
  throw redirect({ href: "/onboarding" });
}

function demoEntryRedirect(): never {
  throw redirect({ href: "/" });
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

  let demoEnvironment;
  if (authSession.user.isAnonymous) {
    const availability = await demoSessionAvailability(authSession.user.id);
    if (!availability.available) {
      return availability.reason === "missing" ? signInRedirect() : demoEntryRedirect();
    }
    demoEnvironment = availability.environment;
  }

  return next({
    context: {
      authSession,
      userId: authSession.user.id,
      demoEnvironment,
      demoEnvironmentId: demoEnvironment?.id,
    },
  });
});

// Public Demo entry still names an explicit server-owned tier. Admission, readiness, and identity
// creation are performed by its handler; this middleware prevents the route from becoming an
// unclassified public server boundary in the tier audit.
export const demoEntryMiddleware = createMiddleware().server(({ next, request }) => {
  const origin = request.headers.get("origin");
  if (origin !== new URL(requiredEnv("BETTER_AUTH_URL")).origin) {
    return Response.json(
      { error: "Demo entry requires the application origin" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return next();
});

// Public safety reports are intentionally anonymous, but still name a distinct server-owned tier
// and accept only requests made through this deployment's Viewer origin.
export const demoReportMiddleware = createMiddleware().server(({ next, request }) => {
  const origin = request.headers.get("origin");
  if (origin !== new URL(requiredEnv("BETTER_AUTH_URL")).origin) {
    return Response.json(
      { error: "Demo reports require the application origin" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return next();
});

export const operatorIdentityMiddleware = createMiddleware()
  .middleware([authedMiddleware])
  .server(async ({ next, context }) => {
    const binding = await findPlatformOperatorBindingForUser(context.userId);
    if (!binding) {
      setResponseStatus(403);
      throw forbiddenError();
    }
    return next({ context: { operatorUserId: binding.userId } });
  });

export const operatorMiddleware = createMiddleware()
  .middleware([operatorIdentityMiddleware])
  .server(async ({ next, context }) => {
    if (context.authSession.user.twoFactorEnabled !== true) {
      throw redirect({ href: "/operations/enroll" });
    }
    return next();
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

    const fallback = [...organizations].sort(byRecoveryOrder)[0]!;
    const fallbackId = organizationIdSchema.parse(fallback.id);
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
