import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";

import { LinkWriteDialog } from "#/components/link-write-dialog";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { Alert, AlertDescription } from "#/components/ui/alert";
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
  const { organization, queryClient, session } = Route.useRouteContext();
  const { links, documents, vaults } = getCollections(queryClient, organization.id);
  const { data: documentRows } = useLiveQuery(
    (query) => query.from({ document: documents }).select(({ document }) => document),
    [documents],
  );
  const { data: vaultRows } = useLiveQuery(
    (query) => query.from({ vault: vaults }).select(({ vault }) => vault),
    [vaults],
  );
  const [mutationError, setMutationError] = useState<string | null>(null);

  return (
    <Page>
      <PageHeader>
        <PageTitle>{document.title}</PageTitle>
        <PageDescription>What a Visitor gets for this Document.</PageDescription>
        <PageActions>
          {document.status === "ready" ? (
            <LinkWriteDialog
              organizationId={organization.id}
              organizationName={organization.name}
              createdBy={session.user.id}
              documents={documentRows}
              vaults={vaultRows}
              links={links}
              watchPersistence={(transaction, message) => {
                setMutationError(null);
                void transaction.isPersisted.promise.catch(() => setMutationError(message));
              }}
              lockedTarget={{ documentId: document.id }}
              triggerLabel="Create Link"
            />
          ) : null}
          {document.kind === "markdown" ? (
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={
                <Link
                  to="/dashboard/documents/$documentId/edit"
                  params={{ documentId: document.id }}
                />
              }
            >
              Edit
            </Button>
          ) : null}
          {document.kind !== "markdown" && document.status === "ready" ? (
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<a href={documentBytesUrl(document.id, { download: true })} />}
            >
              Download
            </Button>
          ) : null}
        </PageActions>
      </PageHeader>
      {mutationError && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}
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
