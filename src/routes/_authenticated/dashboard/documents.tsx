import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";

import { getCollections } from "#/db-collections";

export const Route = createFileRoute("/_authenticated/dashboard/documents")({
  component: DocumentsPage,
});

function DocumentsPage() {
  const { organization, queryClient } = Route.useRouteContext();
  const { documents } = getCollections(queryClient, organization.id);
  const { data } = useLiveQuery((query) => query.from({ document: documents }), [documents]);

  return <p>{data.length}</p>;
}
