import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "#/components/ui/sidebar";
import { OrganizationSwitcher } from "#/components/organization-switcher";
import { TooltipProvider } from "#/components/ui/tooltip";
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
      <SidebarProvider>
        <Sidebar collapsible="none">
          <SidebarHeader>
            <OrganizationSwitcher activeOrganization={organization} organizations={organizations} />
          </SidebarHeader>
          <SidebarContent />
          <SidebarFooter>{session.user.name}</SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
