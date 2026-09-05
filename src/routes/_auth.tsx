import { Outlet, createFileRoute, isRedirect, redirect } from "@tanstack/react-router";

import { currentSessionUser, listOrganizations } from "#/server/functions/auth";
import { platformOperatorRouteAccess } from "#/server/functions/operators";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ location }) => {
    let sessionUser: Awaited<ReturnType<typeof currentSessionUser>> | null = null;
    try {
      sessionUser = await currentSessionUser();
    } catch (error) {
      if (isRedirect(error)) return { sessionUser };
      throw error;
    }

    if (location.pathname.startsWith("/accept-invitation/")) {
      return { sessionUser };
    }

    const operatorAccess = await platformOperatorRouteAccess();
    if (operatorAccess.isOperator) {
      throw redirect({
        href: operatorAccess.twoFactorEnrolled ? "/operations" : "/operations/enroll",
      });
    }

    const organizations = (await listOrganizations()) ?? [];
    if (organizations.length === 0) {
      throw redirect({ href: "/onboarding" });
    }

    throw redirect({ to: "/dashboard" });
  },
  component: Outlet,
});
