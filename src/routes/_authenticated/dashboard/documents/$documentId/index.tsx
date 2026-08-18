import { Link, createFileRoute } from "@tanstack/react-router";

import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { Button } from "#/components/ui/button";
import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";
import { documentBytesUrl } from "#/lib/document-bytes";
import { previewQueryKey } from "#/lib/document-preview";
import { renderMarkdown } from "#/server/functions/documents";

export const Route = createFileRoute("/_authenticated/dashboard/documents/$documentId/")({
  staleTime: 0,
  loader: async ({ context: { organization, queryClient }, params: { documentId } }) => {
    const { documents } = getCollections(queryClient, organization.id);
    const document = await resolveRow(documents, documentId);
    const html =
      document.kind === "markdown"
        ? await queryClient.ensureQueryData({
            queryKey: previewQueryKey(document.id, document.updatedAt),
            staleTime: Infinity,
            queryFn: () => renderMarkdown({ data: { documentId: document.id } }),
          })
        : undefined;

    return { document, html };
  },
  component: DocumentPage,
});

function DocumentPage() {
  const { document, html } = Route.useLoaderData();

  return (
    <Page>
      <PageHeader>
        <PageTitle>{document.title}</PageTitle>
        <PageDescription>What a Visitor gets for this Document.</PageDescription>
        <PageActions>
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
        </PageActions>
      </PageHeader>
      {document.status === "pending" ? (
        <p>Uploading…</p>
      ) : document.kind === "image" ? (
        <img src={documentBytesUrl(document.id)} alt="" className="max-w-full" />
      ) : document.kind === "markdown" && html !== undefined ? (
        <article
          className="max-w-prose [&_a]:underline [&_img]:max-w-full [&_pre]:overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}
    </Page>
  );
}
