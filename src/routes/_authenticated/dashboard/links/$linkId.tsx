import { createFileRoute } from "@tanstack/react-router";

import { UnimplementedDashboardPage } from "#/components/unimplemented-dashboard-page";
import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";

export const Route = createFileRoute("/_authenticated/dashboard/links/$linkId")({
  loader: ({ context: { organization, queryClient }, params: { linkId } }) => {
    const { links } = getCollections(queryClient, organization.id);

    return resolveRow(links, linkId);
  },
  component: LinkPage,
});

function LinkPage() {
  return <UnimplementedDashboardPage destination="links" />;
}
