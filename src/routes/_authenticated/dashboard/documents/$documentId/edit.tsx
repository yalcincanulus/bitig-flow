import { createFileRoute } from "@tanstack/react-router";

import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";

// The markdown editor is a route rather than a dialog so that autosave has a route lifecycle
// to hang from. Its contents arrive with the pane that performs the writing.
export const Route = createFileRoute("/_authenticated/dashboard/documents/$documentId/edit")({
  loader: async ({ context: { organization, queryClient }, params: { documentId } }) => {
    const { documents } = getCollections(queryClient, organization.id);

    await resolveRow(documents, documentId);
  },
  component: DocumentEditorPage,
});

function DocumentEditorPage() {
  const { documentId } = Route.useParams();

  return <p>Editing {documentId}</p>;
}
