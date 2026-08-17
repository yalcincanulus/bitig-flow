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
import { SignOutButton } from "#/components/sign-out-button";
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
          <SidebarFooter className="flex flex-row items-center justify-between gap-2">
            <span>{session.user.name}</span>
            <SignOutButton />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
