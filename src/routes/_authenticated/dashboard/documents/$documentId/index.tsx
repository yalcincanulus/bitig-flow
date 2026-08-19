import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { LinkIcon, ShieldAlertIcon } from "lucide-react";
import { useState } from "react";

import { AnalyticsRangeControls } from "#/components/analytics-range-controls";
import { LinkWriteDialog } from "#/components/link-write-dialog";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { PreviewPdfDocument } from "#/components/preview-pdf-document";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";
import { analyticsNumberFormat, formatTotalTime } from "#/lib/analytics-format";
import { analyticsRangeSchema } from "#/lib/dashboard-search";
import { documentBytesUrl } from "#/lib/document-bytes";
import { previewQueryKey } from "#/lib/document-preview";
import { isLinkSlug, linkViewerPath } from "#/lib/link-slug";
import { analyticsTrustworthy } from "#/lib/link-trust";
import { getAnalyticsDocument } from "#/server/functions/analytics";
import { renderMarkdown } from "#/server/functions/documents";

export const Route = createFileRoute("/_authenticated/dashboard/documents/$documentId/")({
  validateSearch: analyticsRangeSchema,
  loaderDeps: ({ search: { from, to } }) => ({ from, to }),
  staleTime: 0,
  loader: async ({ context: { organization, queryClient }, params: { documentId }, deps }) => {
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
    const analytics = await getAnalyticsDocument({
      data: { documentId: document.id, ...deps },
    });

    return { document, html, analytics };
  },
  component: DocumentPage,
});

function DocumentPage() {
  const { document, html, analytics } = Route.useLoaderData();
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
  const { data: linkRows } = useLiveQuery(
    (query) => query.from({ link: links }).select(({ link }) => link),
    [links],
  );
  const [mutationError, setMutationError] = useState<string | null>(null);
  const linkById = new Map(linkRows.map((link) => [link.id, link]));

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
      ) : document.kind === "pdf" ? (
        <PreviewPdfDocument documentId={document.id} pageCount={document.pageCount} />
      ) : document.kind === "markdown" && html !== undefined ? (
        <article
          className="max-w-prose [&_a]:underline [&_img]:max-w-full [&_pre]:overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}

      <AnalyticsRangeControls {...analytics.range} documentId={document.id} />

      {analytics.links.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LinkIcon />
            </EmptyMedia>
            <EmptyTitle>This Document is in no Links</EmptyTitle>
            <EmptyDescription>
              Create a Link that reaches this Document to collect Visits, Viewer identities, Total
              time, and downloads for it.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {analytics.links.map((totals) => {
            const link = linkById.get(totals.linkId);
            const metrics = [
              { label: "Visits", value: analyticsNumberFormat.format(totals.visits) },
              {
                label: "Unique visitors",
                value: analyticsNumberFormat.format(totals.viewerIdentities),
              },
              { label: "Total time", value: formatTotalTime(totals.totalMs) },
              { label: "Downloads", value: analyticsNumberFormat.format(totals.downloads) },
            ];

            return (
              <Card key={totals.linkId} size="sm">
                <CardHeader>
                  <CardTitle>
                    <Link
                      to="/dashboard/analytics/$linkId"
                      params={{ linkId: totals.linkId }}
                      search={analytics.range}
                      className="hover:underline"
                    >
                      {link?.name ||
                        (link && isLinkSlug(link.slug) ? linkViewerPath(link.slug) : "Link")}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {link?.isActive === false ? "Inactive" : "Active"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {link && !analyticsTrustworthy(link) ? (
                    <Alert>
                      <ShieldAlertIcon />
                      <AlertTitle>Public Link</AlertTitle>
                      <AlertDescription>
                        This Link has no Requirements. Add a password or email Requirement to make
                        its analytics more trustworthy.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {metrics.map((metric) => (
                      <div key={metric.label} className="flex flex-col gap-1">
                        <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                        <dd className="text-lg font-semibold tabular-nums">{metric.value}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}
