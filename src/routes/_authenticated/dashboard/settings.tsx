import { createFileRoute } from "@tanstack/react-router";

import { OrganizationDangerZone } from "#/components/organization-danger-zone";
import { OrganizationMembershipSettings } from "#/components/organization-membership-settings";
import { OrganizationSettings } from "#/components/organization-settings";
import { Page, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { authClient } from "#/lib/auth-client";
import { dashboardDestinations } from "#/lib/dashboard-destinations";

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
      throw new Error("Could not read the Memberships of this Organization");
    }

    return {
      ownerCount: listing.data.total,
    };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { organization, role } = Route.useRouteContext();
  const { ownerCount } = Route.useLoaderData();

  return (
    <Page>
      <PageHeader>
        <PageTitle>{dashboardDestinations.settings.label}</PageTitle>
        <PageDescription>
          View the active Organization and manage the details your Role permits.
        </PageDescription>
      </PageHeader>

      <OrganizationSettings
        key={`organization-settings-${organization.id}`}
        organization={organization}
        role={role}
      />
      <OrganizationMembershipSettings
        organizationId={organization.id}
        ownerCount={ownerCount}
        role={role}
      />
      <OrganizationDangerZone
        key={`organization-danger-zone-${organization.id}`}
        organization={organization}
        role={role}
      />
    </Page>
  );
}
