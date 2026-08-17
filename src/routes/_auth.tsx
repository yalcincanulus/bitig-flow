import { Outlet, createFileRoute, isRedirect, redirect } from "@tanstack/react-router";

import { hasAuthenticatedSession } from "#/server/functions/auth";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async () => {
    try {
      await hasAuthenticatedSession();
    } catch (error) {
      if (isRedirect(error)) return;
      throw error;
    }

    throw redirect({ to: "/dashboard/documents" });
  },
  component: Outlet,
});
