import { Link, useMatchRoute } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  BoxesIcon,
  LayoutDashboardIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { ThemeToggle } from "#/components/theme-toggle";
import { UserMenu, type UserSummary } from "#/components/user-menu";
import { Separator } from "#/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "#/components/ui/sidebar";
import { useSidebar } from "#/components/ui/sidebar-context";
import { TooltipProvider } from "#/components/ui/tooltip";

const operationsDestinations = [
  { to: "/operations", label: "Overview", icon: LayoutDashboardIcon, exact: true },
  { to: "/operations/environments", label: "Environments", icon: BoxesIcon, exact: false },
  { to: "/operations/policy", label: "Policy", icon: SlidersHorizontalIcon, exact: false },
] as const;

function OperationsDestination({
  destination,
}: Readonly<{ destination: (typeof operationsDestinations)[number] }>) {
  const matchRoute = useMatchRoute();
  const { isMobile, setOpenMobile } = useSidebar();
  const isActive = Boolean(matchRoute({ to: destination.to, fuzzy: !destination.exact }));
  const Icon = destination.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={destination.label}
        render={
          <Link
            to={destination.to}
            activeOptions={{ exact: destination.exact }}
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

function OperationsSidebar({ user }: Readonly<{ user: UserSummary }>) {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/operations" />}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                <ShieldCheckIcon className="size-4" />
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">Operations</span>
                <span className="truncate text-muted-foreground">Platform operator</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Operations" className="flex min-h-0 flex-1 flex-col">
          <SidebarGroup>
            <SidebarGroupLabel>Deployment</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {operationsDestinations.map((destination) => (
                  <OperationsDestination key={destination.to} destination={destination} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Back to Dashboard" render={<Link to="/dashboard" />}>
                    <ArrowLeftIcon />
                    <span>Back to Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
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

function OperationsSidebarTrigger() {
  const { isMobile, open, openMobile } = useSidebar();
  return <SidebarTrigger aria-expanded={isMobile ? openMobile : open} />;
}

/**
 * The frame every Operations page sits in. It borrows the Dashboard's shape — inset sidebar, sticky
 * toolbar — so an operator moving between the two does not change applications, while carrying no
 * Organization: Operations is global (ADR-0071).
 */
export function OperationsChrome({
  user,
  sidebarOpen,
  children,
}: Readonly<{ user: UserSummary; sidebarOpen: boolean; children: ReactNode }>) {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <OperationsSidebar user={user} />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4 md:rounded-t-xl">
            <OperationsSidebarTrigger />
            <span className="flex h-4 shrink-0">
              <Separator orientation="vertical" />
            </span>
            <span className="text-xs text-muted-foreground">Operations</span>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
