import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { DashboardSidebar } from "#/components/dashboard-sidebar";
import { DashboardToolbar } from "#/components/dashboard-toolbar";
import { DemoEnvironmentNotice } from "#/components/demo-environment-notice";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { TooltipProvider } from "#/components/ui/tooltip";
import { sidebarStartsOpen } from "#/lib/sidebar-preference";
import { listOrganizations } from "#/server/functions/auth";
import { getDashboardContext } from "#/server/functions/dashboard";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const dashboardContext = await getDashboardContext();

    if (location.pathname === "/dashboard" || location.pathname === "/dashboard/") {
      throw redirect({ to: "/dashboard/documents" });
    }

    return dashboardContext;
  },
  loader: () => listOrganizations(),
  component: DashboardChrome,
});

function DashboardChrome() {
  const { organization, session, demo, atOwnedOrganizationLimit } = Route.useRouteContext();
  const organizations = Route.useLoaderData();

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarStartsOpen()}>
        <DashboardSidebar
          organization={organization}
          organizations={organizations}
          atOwnedOrganizationLimit={atOwnedOrganizationLimit}
          demo={Boolean(demo)}
          user={{
            name: session.user.name,
            email: session.user.isAnonymous ? undefined : session.user.email,
            canSignOut: !session.user.isAnonymous,
          }}
        />
        {/* `min-w-0` is what lets a wide Page — the Links table, say — scroll inside the Chrome
            instead of pushing the whole window sideways. */}
        <SidebarInset className="min-w-0">
          <DashboardToolbar />
          {demo && (
            <DemoEnvironmentNotice
              expiresAt={demo.expiresAt}
              confirmedBytes={demo.confirmedBytes}
              storageLimit={demo.storageLimit}
              usage={demo.usage}
              limits={demo.limits}
            />
          )}
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
