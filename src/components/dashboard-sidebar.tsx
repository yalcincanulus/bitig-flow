import { Link, useMatchRoute, useRouter } from "@tanstack/react-router";
import {
  ChartNoAxesCombinedIcon,
  FileTextIcon,
  FolderClosedIcon,
  HouseIcon,
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
import { useIntentPreload } from "#/hooks/use-intent-preload";
import { dashboardDestinations } from "#/lib/dashboard-destinations";

// Every Role sees the same destinations, so the list is a constant rather than a computed one.
const primaryDestinations = [
  { ...dashboardDestinations.home, icon: HouseIcon },
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
  demo: boolean;
  user: UserSummary;
}>;

function DestinationItem({
  destination,
  preloadScope,
}: Readonly<{ destination: Destination; preloadScope: OrganizationSummary["id"] }>) {
  const matchRoute = useMatchRoute();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  // Fuzzy matching is what keeps Documents active on a Preview or editor route, Vaults active on a
  // Vault detail, and Links active on a Link detail.
  const exact = destination.link.to === dashboardDestinations.home.link.to;
  const isActive = Boolean(matchRoute({ to: destination.link.to, fuzzy: !exact }));
  const { linkProps, cancelQueuedPreload } = useIntentPreload({
    scope: preloadScope,
    active: isActive,
    preload: () => router.preloadRoute(destination.link),
  });

  const Icon = destination.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={destination.label}
        render={
          <Link
            {...destination.link}
            activeOptions={{ includeSearch: false, exact }}
            {...linkProps}
            onClick={() => {
              cancelQueuedPreload();
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
  demo,
  user,
}: DashboardSidebarProps) {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <OrganizationSwitcher
          activeOrganization={organization}
          organizations={organizations}
          atOwnedOrganizationLimit={atOwnedOrganizationLimit}
          demo={demo}
        />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Dashboard" className="flex min-h-0 flex-1 flex-col">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {primaryDestinations.map((destination) => (
                  <DestinationItem
                    key={destination.link.to}
                    destination={destination}
                    preloadScope={organization.id}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <DestinationItem destination={settingsDestination} preloadScope={organization.id} />
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
