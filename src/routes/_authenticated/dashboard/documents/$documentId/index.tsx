import { createFileRoute } from "@tanstack/react-router";

import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";

export const Route = createFileRoute("/_authenticated/dashboard/documents/$documentId/")({
  loader: ({ context: { organization, queryClient }, params: { documentId } }) => {
    const { documents } = getCollections(queryClient, organization.id);

    return resolveRow(documents, documentId);
  },
  component: DocumentPage,
});

function DocumentPage() {
  const document = Route.useLoaderData();

  return <p>{document.title}</p>;
}
