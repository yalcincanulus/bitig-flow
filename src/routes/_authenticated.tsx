import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { DashboardSidebar } from "#/components/dashboard-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "#/components/ui/sidebar";
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
  const { organization, session } = Route.useRouteContext();
  const organizations = Route.useLoaderData();

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarStartsOpen()}>
        <DashboardSidebar
          organization={organization}
          organizations={organizations}
          user={session.user}
        />
        <SidebarInset>
          {/* The trigger is the only way into the mobile Sheet, so it lands here now. The
              Dashboard toolbar that will own this row is a later slice of #50. */}
          <div className="flex h-12 shrink-0 items-center gap-2 px-4">
            <SidebarTrigger />
          </div>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
