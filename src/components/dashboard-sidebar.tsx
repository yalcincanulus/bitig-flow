import { Link, useMatchRoute } from "@tanstack/react-router";
import {
  ChartNoAxesCombinedIcon,
  FileTextIcon,
  FolderClosedIcon,
  LinkIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";

import { OrganizationSwitcher, type OrganizationSummary } from "#/components/organization-switcher";
import { UserMenu, type UserSummary } from "#/components/user-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "#/components/ui/sidebar";
import { useSidebar } from "#/components/ui/sidebar-context";
import { dashboardDestinations } from "#/lib/dashboard-destinations";

// Every Role sees the same destinations, so the list is a constant rather than a computed one.
const primaryDestinations = [
  { ...dashboardDestinations.documents, icon: FileTextIcon },
  { ...dashboardDestinations.vaults, icon: FolderClosedIcon },
  { ...dashboardDestinations.links, icon: LinkIcon },
  { ...dashboardDestinations.analytics, icon: ChartNoAxesCombinedIcon },
  { ...dashboardDestinations.people, icon: UsersIcon },
] as const;

const settingsDestination = { ...dashboardDestinations.settings, icon: SettingsIcon } as const;

type Destination = (typeof primaryDestinations)[number] | typeof settingsDestination;

type DashboardSidebarProps = Readonly<{
  organization: OrganizationSummary;
  organizations: readonly OrganizationSummary[];
  atOwnedOrganizationLimit: boolean;
  user: UserSummary;
}>;

function DestinationItem({ destination }: Readonly<{ destination: Destination }>) {
  const matchRoute = useMatchRoute();
  const { isMobile, setOpenMobile } = useSidebar();
  // Fuzzy matching is what keeps Documents active on a Preview or editor route, Vaults active on a
  // Vault detail, and Links active on a Link detail.
  const isActive = Boolean(matchRoute({ to: destination.link.to, fuzzy: true }));
  const Icon = destination.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={destination.label}
        render={
          <Link
            {...destination.link}
            activeOptions={{ includeSearch: false }}
            onClick={() => {
              if (isMobile) setOpenMobile(false);
            }}
          />
        }
      >
        <Icon />
        <span>{destination.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function DashboardSidebar({
  organization,
  organizations,
  atOwnedOrganizationLimit,
  user,
}: DashboardSidebarProps) {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <OrganizationSwitcher
          activeOrganization={organization}
          organizations={organizations}
          atOwnedOrganizationLimit={atOwnedOrganizationLimit}
        />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Dashboard" className="flex min-h-0 flex-1 flex-col">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {primaryDestinations.map((destination) => (
                  <DestinationItem key={destination.link.to} destination={destination} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <DestinationItem destination={settingsDestination} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
