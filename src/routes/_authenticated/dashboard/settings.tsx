import { createFileRoute } from "@tanstack/react-router";

import { OrganizationSettings } from "#/components/organization-settings";
import { Page, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { dashboardDestinations } from "#/lib/dashboard-destinations";

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { organization, role } = Route.useRouteContext();

  return (
    <Page>
      <PageHeader>
        <PageTitle>{dashboardDestinations.settings.label}</PageTitle>
        <PageDescription>
          View the active Organization and manage the details your Role permits.
        </PageDescription>
      </PageHeader>

      <OrganizationSettings key={organization.id} organization={organization} role={role} />
    </Page>
  );
}
