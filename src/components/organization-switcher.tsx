import { useState, type ReactNode } from "react";
import { useMatchRoute, useRouter } from "@tanstack/react-router";
import { Building2Icon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";

import { CreateOrganizationForm } from "#/components/create-organization-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "#/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { authClient } from "#/lib/auth-client";
import { flushDocumentEditor } from "#/lib/document-editor-lifecycle";

export type OrganizationSummary = Readonly<{
  id: string;
  name: string;
}>;

const ownedOrganizationCapReason = "You can run five Organizations of your own.";

type OrganizationSwitcherProps = Readonly<{
  activeOrganization: OrganizationSummary;
  organizations: readonly OrganizationSummary[];
  atOwnedOrganizationLimit: boolean;
  demo: boolean;
}>;

function CreateOrganizationItem({
  disabled,
  onClick,
}: Readonly<{
  disabled?: boolean;
  onClick?: () => void;
}>) {
  return (
    <DropdownMenuItem disabled={disabled} onClick={onClick}>
      <PlusIcon />
      Create Organization
    </DropdownMenuItem>
  );
}

function DisabledCreateItem({ reason }: Readonly<{ reason: string }>) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="flex w-full" />}>
        <CreateOrganizationItem disabled />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
    </Tooltip>
  );
}

export function OrganizationSwitcher({
  activeOrganization,
  organizations,
  atOwnedOrganizationLimit,
  demo,
}: OrganizationSwitcherProps) {
  const router = useRouter();
  const matchRoute = useMatchRoute();
  const [switchingTo, setSwitchingTo] = useState<string>();
  const [error, setError] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
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

  async function landInCreatedOrganization() {
    setCreateOpen(false);
    await router.navigate({ to: "/dashboard/documents" });
    await router.invalidate({ sync: true });
  }

  let createItem: ReactNode;
  if (demo) {
    createItem = <DisabledCreateItem reason="Disabled in demo" />;
  } else if (atOwnedOrganizationLimit) {
    createItem = <DisabledCreateItem reason={ownedOrganizationCapReason} />;
  } else {
    createItem = (
      <CreateOrganizationItem
        disabled={switchingTo !== undefined}
        onClick={() => setCreateOpen(true)}
      />
    );
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
            <DropdownMenuSeparator />
            <DropdownMenuGroup>{createItem}</DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Organization</DialogTitle>
              <DialogDescription>Name the Organization you will run.</DialogDescription>
            </DialogHeader>
            <CreateOrganizationForm
              submitLabel="Create Organization"
              onCreated={landInCreatedOrganization}
            />
          </DialogContent>
        </Dialog>
        <span className="sr-only" role="alert">
          {error}
        </span>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
