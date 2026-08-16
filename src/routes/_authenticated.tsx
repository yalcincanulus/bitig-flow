import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "#/components/ui/sidebar";
import { TooltipProvider } from "#/components/ui/tooltip";
import { getDashboardContext } from "#/server/functions/dashboard";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const dashboardContext = await getDashboardContext();

    if (location.pathname === "/dashboard" || location.pathname === "/dashboard/") {
      throw redirect({ to: "/dashboard/documents" });
    }

    return dashboardContext;
  },
  component: DashboardChrome,
});

function DashboardChrome() {
  const { organization, session } = Route.useRouteContext();

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="none">
          <SidebarHeader>{organization.name}</SidebarHeader>
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
