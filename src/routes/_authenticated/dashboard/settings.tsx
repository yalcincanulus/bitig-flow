import { createFileRoute } from "@tanstack/react-router";
import { Building2Icon } from "lucide-react";

import { OrganizationDangerZone } from "#/components/organization-danger-zone";
import { OrganizationMembershipSettings } from "#/components/organization-membership-settings";
import { OrganizationSettings } from "#/components/organization-settings";
import { Page, PageHeader, PageTitle } from "#/components/page";
import { Badge } from "#/components/ui/badge";
import { authClient } from "#/lib/auth-client";
import { type OrganizationRole } from "#/lib/access-control";
import { dashboardDestinations } from "#/lib/dashboard-destinations";
import { roleLabel } from "#/lib/people";

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  loader: async ({ context: { organization } }) => {
    const listing = await authClient.organization.listMembers({
      query: {
        organizationId: organization.id,
        filterField: "role",
        filterOperator: "eq",
        filterValue: "owner",
        limit: 1,
      },
    });
    if (listing.error) {
      throw new Error("Could not read the memberships of this organization");
    }

    return {
      ownerCount: listing.data.total,
    };
  },
  component: SettingsPage,
});

/**
 * Who the settings below belong to, said once at the top so no section has to repeat the
 * Organization's name or the standing the reader holds in it.
 */
function OrganizationIdentity({ name, role }: Readonly<{ name: string; role: OrganizationRole }>) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&>svg]:size-5">
        <Building2Icon aria-hidden />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-base font-semibold tracking-tight">{name}</span>
        <span className="text-sm text-muted-foreground">Active organization</span>
      </div>
      <Badge variant={role === "member" ? "outline" : "secondary"} className="ml-auto">
        {roleLabel(role)}
      </Badge>
    </div>
  );
}

function SettingsPage() {
  const { organization, role, demo } = Route.useRouteContext();
  const { ownerCount } = Route.useLoaderData();

  return (
    <Page>
      <PageHeader>
        <PageTitle>{dashboardDestinations.settings.label}</PageTitle>
      </PageHeader>

      <div className="flex w-full max-w-3xl min-w-0 flex-col gap-8">
        <OrganizationIdentity name={organization.name} role={role} />

        <OrganizationSettings
          key={`organization-settings-${organization.id}`}
          organization={organization}
          role={role}
          demo={Boolean(demo)}
        />
        <OrganizationMembershipSettings
          organizationId={organization.id}
          ownerCount={ownerCount}
          role={role}
          demo={Boolean(demo)}
        />
        <OrganizationDangerZone
          key={`organization-danger-zone-${organization.id}`}
          organization={organization}
          role={role}
          demo={Boolean(demo)}
        />
      </div>
    </Page>
  );
}
