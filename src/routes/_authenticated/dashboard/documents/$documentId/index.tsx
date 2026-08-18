import { Link, createFileRoute } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";
import { documentBytesUrl } from "#/lib/document-bytes";

export const Route = createFileRoute("/_authenticated/dashboard/documents/$documentId/")({
  loader: ({ context: { organization, queryClient }, params: { documentId } }) => {
    const { documents } = getCollections(queryClient, organization.id);

    return resolveRow(documents, documentId);
  },
  component: DocumentPage,
});

function DocumentPage() {
  const document = Route.useLoaderData();

  return (
    <main className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-lg font-medium">{document.title}</h1>
        <div className="flex gap-2">
          {document.kind === "markdown" ? (
            <Link to="/dashboard/documents/$documentId/edit" params={{ documentId: document.id }}>
              <Button variant="outline" size="sm">
                Edit
              </Button>
            </Link>
          ) : null}
          {document.kind !== "markdown" && document.status === "ready" ? (
            <a href={documentBytesUrl(document.id, { download: true })}>
              <Button variant="outline" size="sm">
                Download
              </Button>
            </a>
          ) : null}
        </div>
      </header>
      {document.status === "pending" ? (
        <p>Uploading…</p>
      ) : document.kind === "image" ? (
        <img src={documentBytesUrl(document.id)} alt="" className="max-w-full" />
      ) : null}
    </main>
  );
}
