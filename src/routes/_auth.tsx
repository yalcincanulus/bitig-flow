import { Outlet, createFileRoute, isRedirect, redirect } from "@tanstack/react-router";

import { hasAuthenticatedSession, listOrganizations } from "#/server/functions/auth";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async () => {
    try {
      await hasAuthenticatedSession();
    } catch (error) {
      if (isRedirect(error)) return;
      throw error;
    }

    const organizations = (await listOrganizations()) ?? [];
    if (organizations.length === 0) {
      throw redirect({ href: "/onboarding" });
    }

    throw redirect({ to: "/dashboard/documents" });
  },
  component: Outlet,
});
