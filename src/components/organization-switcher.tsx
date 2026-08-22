import { useState } from "react";
import { useMatchRoute, useRouter } from "@tanstack/react-router";
import { Building2Icon, ChevronsUpDownIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "#/components/ui/sidebar";
import { authClient } from "#/lib/auth-client";
import { flushDocumentEditor } from "#/lib/document-editor-lifecycle";

export type OrganizationSummary = Readonly<{
  id: string;
  name: string;
}>;

type OrganizationSwitcherProps = Readonly<{
  activeOrganization: OrganizationSummary;
  organizations: readonly OrganizationSummary[];
}>;

export function OrganizationSwitcher({
  activeOrganization,
  organizations,
}: OrganizationSwitcherProps) {
  const router = useRouter();
  const matchRoute = useMatchRoute();
  const [switchingTo, setSwitchingTo] = useState<string>();
  const [error, setError] = useState<string>();
  const listDestination = matchRoute({
    to: "/dashboard/documents/$documentId",
    fuzzy: true,
  })
    ? "/dashboard/documents"
    : matchRoute({ to: "/dashboard/vaults/$vaultId", fuzzy: true })
      ? "/dashboard/vaults"
      : matchRoute({ to: "/dashboard/links/$linkId", fuzzy: true })
        ? "/dashboard/links"
        : undefined;

  async function switchOrganization(organizationId: string) {
    if (organizationId === activeOrganization.id || switchingTo) return;

    setSwitchingTo(organizationId);
    setError(undefined);

    try {
      await flushDocumentEditor();
      const result = await authClient.organization.setActive({ organizationId });
      if (result.error) {
        setError(result.error.message ?? "Could not switch Organization");
      } else {
        if (listDestination) {
          await router.navigate({ to: listDestination });
        }

        await router.invalidate({ sync: true });
      }
    } catch {
      setError("Could not switch Organization");
    }

    setSwitchingTo(undefined);
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                tooltip={activeOrganization.name}
                aria-label="Switch Organization"
                disabled={switchingTo !== undefined}
              />
            }
          >
            <div className="flex size-8 shrink-0 items-center justify-center">
              <Building2Icon />
            </div>
            <span className="truncate group-data-[collapsible=icon]:hidden">
              {activeOrganization.name}
            </span>
            <ChevronsUpDownIcon className="ml-auto group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Organizations</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={activeOrganization.id}
                onValueChange={(organizationId) => void switchOrganization(organizationId)}
              >
                {organizations.map((organization) => (
                  <DropdownMenuRadioItem
                    key={organization.id}
                    value={organization.id}
                    disabled={switchingTo !== undefined}
                  >
                    {organization.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="sr-only" role="alert">
          {error}
        </span>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
