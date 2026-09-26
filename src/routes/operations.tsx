import { Outlet, createFileRoute, notFound, redirect, useLocation } from "@tanstack/react-router";

import { OperationsChrome } from "#/components/operations-chrome";
import { sidebarStartsOpen } from "#/lib/sidebar-preference";
import { operationsHeader, platformOperatorRouteAccess } from "#/server/functions/operators";

export const Route = createFileRoute("/operations")({
  beforeLoad: async ({ location }) => {
    const access = await platformOperatorRouteAccess();
    if (!access.isOperator) throw notFound();
    if (!access.twoFactorEnrolled && location.pathname !== "/operations/enroll") {
      throw redirect({ href: "/operations/enroll" });
    }
  },
  loader: ({ location }) =>
    location.pathname === "/operations/enroll" ? null : operationsHeader(),
  component: OperationsRoute,
});

function OperationsRoute() {
  const location = useLocation();
  const operator = Route.useLoaderData();
  if (location.pathname === "/operations/enroll") return <Outlet />;
  if (!operator) return null;

  return (
    <OperationsChrome
      sidebarOpen={sidebarStartsOpen()}
      user={{ name: operator.name || operator.email, email: operator.email, canSignOut: true }}
    >
      <Outlet />
    </OperationsChrome>
  );
}
