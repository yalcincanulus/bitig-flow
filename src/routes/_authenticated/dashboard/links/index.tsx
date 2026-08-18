import { createFileRoute } from "@tanstack/react-router";
import { eq, or, useLiveQuery } from "@tanstack/react-db";

import { UnimplementedDashboardPage } from "#/components/unimplemented-dashboard-page";
import { getCollections } from "#/db-collections";
import { linksSearchSchema } from "#/lib/dashboard-search";

export const Route = createFileRoute("/_authenticated/dashboard/links/")({
  validateSearch: linksSearchSchema,
  component: LinksPage,
});

function LinksPage() {
  const search = Route.useSearch();
  const { organization, queryClient } = Route.useRouteContext();
  const { links } = getCollections(queryClient, organization.id);

  // Search still drives the live query so the collection contract stays in place until this page
  // can present Links. The count is not UI.
  useLiveQuery(
    (query) => {
      let filtered = query.from({ link: links });
      const { status, target } = search;

      if (target) {
        filtered = filtered.where(({ link }) =>
          or(eq(link.documentId, target), eq(link.vaultId, target)),
        );
      }
      if (status) {
        filtered = filtered.where(({ link }) => eq(link.isActive, status === "active"));
      }

      return filtered.select(({ link }) => link);
    },
    [links, search.status, search.target],
  );

  return <UnimplementedDashboardPage destination="links" />;
}
