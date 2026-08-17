import { createFileRoute } from "@tanstack/react-router";
import { eq, or, useLiveQuery } from "@tanstack/react-db";

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
  const { data } = useLiveQuery(
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

  return <p>{data.length}</p>;
}
