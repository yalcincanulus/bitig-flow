import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { ShieldAlertIcon } from "lucide-react";

import { AnalyticsDwellChart } from "#/components/analytics-dwell-chart";
import { AnalyticsRangeControls } from "#/components/analytics-range-controls";
import { Page, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";
import {
  ANALYTICS_VISIT_CAP,
  dwellPagesWithZeros,
  type AnalyticsLinkDocument,
} from "#/lib/analytics-fold";
import { analyticsNumberFormat, formatTotalTime } from "#/lib/analytics-format";
import { analyticsRangeSchema } from "#/lib/dashboard-search";
import { isLinkSlug, linkViewerPath } from "#/lib/link-slug";
import { analyticsTrustworthy } from "#/lib/link-trust";
import { getAnalyticsLink } from "#/server/functions/analytics";

export const Route = createFileRoute("/_authenticated/dashboard/analytics/$linkId")({
  validateSearch: analyticsRangeSchema,
  loaderDeps: ({ search: { from, to } }) => ({ from, to }),
  loader: async ({ context: { organization, queryClient }, params: { linkId }, deps }) => {
    const { links } = getCollections(queryClient, organization.id);
    const link = await resolveRow(links, linkId);
    const analytics = await getAnalyticsLink({ data: { linkId: link.id, ...deps } });

    return { link, analytics };
  },
  component: AnalyticsLinkPage,
});

function lastActiveIso(value: Date | string | null) {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function linkLabel(link: { name: string | null; slug: string }) {
  return link.name || (isLinkSlug(link.slug) ? linkViewerPath(link.slug) : "Link");
}

function AnalyticsLinkPage() {
  const loaded = Route.useLoaderData();
  const { organization, queryClient } = Route.useRouteContext();
  const { links, documents } = getCollections(queryClient, organization.id);
  const link = links.get(loaded.link.id) ?? loaded.link;
  const { data: documentRows } = useLiveQuery(
    (query) => query.from({ document: documents }).select(({ document }) => document),
    [documents],
  );
  const documentById = new Map(documentRows.map((document) => [document.id, document]));
  const analytics = loaded.analytics;
  const lastActive = lastActiveIso(analytics.lastSeenAt);
  const visitLabel = analytics.truncated ? "Visits shown" : "Visits";
  const metrics = [
    { label: visitLabel, value: analyticsNumberFormat.format(analytics.totals.visits) },
    {
      label: "Unique visitors",
      value: analyticsNumberFormat.format(analytics.totals.viewerIdentities),
    },
    { label: "Captured emails", value: analyticsNumberFormat.format(analytics.totals.emails) },
    { label: "Total time", value: formatTotalTime(analytics.totals.totalMs) },
    { label: "Downloads", value: analyticsNumberFormat.format(analytics.totals.downloads) },
  ];
  const shownDocuments = documentsForLink(link.documentId, analytics.documents);

  return (
    <Page>
      <PageHeader>
        <PageTitle>{linkLabel(link)}</PageTitle>
        <PageDescription>
          {lastActive ? (
            <>
              Last active{" "}
              <time dateTime={lastActive}>{lastActive.slice(0, 16).replace("T", " ")} UTC</time>.
            </>
          ) : (
            "This Link has not been active in the range."
          )}
        </PageDescription>
      </PageHeader>

      <AnalyticsRangeControls {...analytics.range} linkId={link.id} />

      {analytics.truncated ? (
        <Alert>
          <AlertTitle>Showing the most recent {ANALYTICS_VISIT_CAP} Visits</AlertTitle>
          <AlertDescription>
            This range has more Visits than can be folded here. The numbers below are for the most
            recent {ANALYTICS_VISIT_CAP} Visits in the range, not a total.
          </AlertDescription>
        </Alert>
      ) : null}

      {!analyticsTrustworthy(link) ? (
        <Alert>
          <ShieldAlertIcon />
          <AlertTitle>Public Link</AlertTitle>
          <AlertDescription>
            This Link has no Requirements. Add a password or email Requirement to make its analytics
            more trustworthy.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {analytics.truncated ? <>Most recent {ANALYTICS_VISIT_CAP} Visits</> : "Totals"}
          </CardTitle>
          <CardDescription>
            {analytics.truncated
              ? `These numbers cover the most recent ${ANALYTICS_VISIT_CAP} Visits in the range, not a total.`
              : "Visits, unique visitors, captured emails, Total time, and downloads for the active range."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {metrics.map((metric) => (
              <div key={metric.label} className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{metric.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {shownDocuments.map((row) => {
        const document = documentById.get(row.documentId);
        const kind = document?.kind;
        const showPages = kind === "pdf";
        const pages = showPages ? dwellPagesWithZeros(document?.pageCount ?? null, row.pages) : [];

        return (
          <Card key={row.documentId}>
            <CardHeader>
              <CardTitle>{document?.title || "Document"}</CardTitle>
              <CardDescription>
                {kind === "pdf"
                  ? `${analyticsNumberFormat.format(row.views)} Views`
                  : `Total time ${formatTotalTime(row.totalMs)}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {kind === "markdown" ? (
                <p>
                  Reading position is not recorded, so this Total time is the finding for the whole
                  Document.
                </p>
              ) : null}
              {showPages ? (
                <>
                  <AnalyticsDwellChart pages={pages} />
                  <DwellTable pages={pages} views={row.views} />
                </>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </Page>
  );
}

function documentsForLink(
  documentId: string | null,
  documents: ReadonlyArray<AnalyticsLinkDocument>,
) {
  if (documentId === null) return documents;

  const found = documents.find((document) => document.documentId === documentId);
  return [
    found ?? {
      documentId,
      views: 0,
      totalMs: 0,
      downloads: 0,
      pages: [],
    },
  ];
}

function DwellTable({
  pages,
  views,
}: Readonly<{
  pages: ReadonlyArray<{ page: number; ms: number }>;
  views: number;
}>) {
  return (
    <Table>
      <TableCaption>
        {views > 0 && pages.every((row) => row.ms === 0)
          ? "Opened and ignored: every page stayed at zero."
          : "Per-page Dwell for this Document."}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Page</TableHead>
          <TableHead>Total time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pages.map((row) => (
          <TableRow key={row.page}>
            <TableCell>Page {row.page}</TableCell>
            <TableCell className="tabular-nums">{formatTotalTime(row.ms)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
