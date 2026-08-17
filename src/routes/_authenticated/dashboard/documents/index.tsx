import { createFileRoute } from "@tanstack/react-router";
import { eq, ilike, useLiveQuery } from "@tanstack/react-db";

import { getCollections } from "#/db-collections";
import { documentsSearchSchema } from "#/lib/dashboard-search";

export const Route = createFileRoute("/_authenticated/dashboard/documents/")({
  validateSearch: documentsSearchSchema,
  component: DocumentsPage,
});

function DocumentsPage() {
  const search = Route.useSearch();
  const { organization, queryClient } = Route.useRouteContext();
  const { documents, vaultItems } = getCollections(queryClient, organization.id);
  const { data } = useLiveQuery(
    (query) => {
      let filtered = query.from({ document: documents });
      const { kind, q, vault } = search;

      if (kind) {
        filtered = filtered.where(({ document }) => eq(document.kind, kind));
      }
      if (q) {
        filtered = filtered.where(({ document }) => ilike(document.title, `%${q}%`));
      }

      if (!vault) return filtered.select(({ document }) => document);

      return filtered
        .innerJoin({ vaultItem: vaultItems }, ({ document, vaultItem }) =>
          eq(document.id, vaultItem.documentId),
        )
        .where(({ vaultItem }) => eq(vaultItem.vaultId, vault))
        .select(({ document }) => document);
    },
    [documents, search.kind, search.q, search.vault, vaultItems],
  );

  return <p>{data.length}</p>;
}
