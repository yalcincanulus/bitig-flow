import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { DownloadIcon, LinkIcon, PencilIcon } from "lucide-react";
import { useState } from "react";

import { AnalyticsRangeControls } from "#/components/analytics-range-controls";
import { DemoAnalyticsNotice } from "#/components/demo-analytics-notice";
import { DocumentKindBadge } from "#/components/document-kind";
import { AnalyticsTrustMark, GateBadges } from "#/components/link-badges";
import { LinkWriteDialog } from "#/components/link-write-dialog";
import { MarkdownBody } from "#/components/markdown-body";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { PreviewPdfDocument } from "#/components/preview-pdf-document";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { Spinner } from "#/components/ui/spinner";
import { TableFrame } from "#/components/table-frame";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";
import { analyticsNumberFormat, formatTotalTime } from "#/lib/analytics-format";
import { analyticsRangeSchema } from "#/lib/dashboard-search";
import { documentBytesUrl } from "#/lib/document-bytes";
import { previewQueryKey } from "#/lib/document-preview";
import { isLinkSlug, linkViewerPath } from "#/lib/link-slug";
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
  const { organization, queryClient, session, demo } = Route.useRouteContext();
  const { links, documents, vaults } = getCollections(queryClient, organization.id);
  const { data: documentRows } = useLiveQuery({
    query: (query) => query.from({ document: documents }).select(({ document }) => document),
  });
  const { data: vaultRows } = useLiveQuery({
    query: (query) => query.from({ vault: vaults }).select(({ vault }) => vault),
  });
  const { data: linkRows } = useLiveQuery({
    query: (query) => query.from({ link: links }).select(({ link }) => link),
  });
  const [mutationError, setMutationError] = useState<string | null>(null);
  const linkById = new Map(linkRows.map((link) => [link.id, link]));

  return (
    <Page>
      <PageHeader>
        <PageTitle>{document.title}</PageTitle>
        <PageDescription className="flex flex-wrap items-center gap-2">
          <DocumentKindBadge kind={document.kind} />
          <span>What a Visitor gets for this Document.</span>
        </PageDescription>
        <PageActions>
          {document.kind === "markdown" ? (
            <Button
              nativeButton={false}
              variant="outline"
              render={
                <Link
                  to="/dashboard/documents/$documentId/edit"
                  params={{ documentId: document.id }}
                />
              }
            >
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
          ) : null}
          {document.kind !== "markdown" && document.status === "ready" ? (
            <Button
              nativeButton={false}
              variant="outline"
              render={<a href={documentBytesUrl(document.id, { download: true })} />}
            >
              <DownloadIcon data-icon="inline-start" />
              Download
            </Button>
          ) : null}
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
              demo={Boolean(demo)}
            />
          ) : null}
        </PageActions>
      </PageHeader>

      {mutationError && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}

      {/* The Preview goes through the render module the Viewer uses, so it is laid out the way the
          Viewer lays it out: a sheet of paper on a desk. */}
      <section className="rounded-lg bg-viewer-desk px-4 py-6 ring-1 ring-foreground/10 md:px-8 md:py-10">
        <div className="mx-auto w-full max-w-[51rem]">
          {document.status === "pending" ? (
            <p className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
              <Spinner className="size-4" />
              Uploading…
            </p>
          ) : document.kind === "image" ? (
            <img
              src={documentBytesUrl(document.id)}
              alt=""
              className="mx-auto max-w-full rounded-sm shadow-md ring-1 ring-foreground/10"
            />
          ) : document.kind === "pdf" ? (
            <PreviewPdfDocument documentId={document.id} pageCount={document.pageCount} />
          ) : document.kind === "markdown" && html !== undefined ? (
            <MarkdownBody
              html={html}
              className="rounded-sm bg-viewer-paper px-6 py-8 shadow-md ring-1 ring-foreground/10 md:px-10"
            />
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">Activity through its Links</h2>
        </header>

        <AnalyticsRangeControls {...analytics.range} documentId={document.id} />
        <DemoAnalyticsNotice incomplete={analytics.analyticsIncomplete} />

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
          <TableFrame>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-3">Link</TableHead>
                <TableHead>Gate</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">Unique</TableHead>
                <TableHead className="text-right">Total time</TableHead>
                <TableHead className="pr-3 text-right">Downloads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.links.map((totals) => {
                const link = linkById.get(totals.linkId);

                return (
                  <TableRow key={totals.linkId}>
                    <TableCell className="max-w-64 pl-3 font-medium">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Link
                          to="/dashboard/analytics/$linkId"
                          params={{ linkId: totals.linkId }}
                          search={analytics.range}
                          className="truncate hover:underline"
                        >
                          {link?.name ||
                            (link && isLinkSlug(link.slug) ? linkViewerPath(link.slug) : "Link")}
                        </Link>
                        <AnalyticsTrustMark link={link} />
                      </span>
                    </TableCell>
                    <TableCell>{link ? <GateBadges link={link} /> : null}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {analyticsNumberFormat.format(totals.visits)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {analyticsNumberFormat.format(totals.viewerIdentities)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTotalTime(totals.totalMs)}
                    </TableCell>
                    <TableCell className="pr-3 text-right tabular-nums">
                      {analyticsNumberFormat.format(totals.downloads)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </TableFrame>
        )}
      </section>
    </Page>
  );
}
