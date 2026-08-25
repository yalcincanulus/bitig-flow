import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { SettingsIcon } from "lucide-react";

import { AnalyticsDwellChart } from "#/components/analytics-dwell-chart";
import { AnalyticsRangeControls } from "#/components/analytics-range-controls";
import { AnalyticsVisitTimeline } from "#/components/analytics-visit-timeline";
import { DemoAnalyticsNotice } from "#/components/demo-analytics-notice";
import { DocumentKindIcon } from "#/components/document-kind";
import { GateBadges, LinkStatusBadge } from "#/components/link-badges";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { StatList } from "#/components/stat-list";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
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
import {
  analyticsNumberFormat,
  formatAnalyticsInstant,
  formatTotalTime,
} from "#/lib/analytics-format";
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
  return formatAnalyticsInstant(value);
}

function linkLabel(link: { name: string | null; slug: string }) {
  return link.name || (isLinkSlug(link.slug) ? linkViewerPath(link.slug) : "Link");
}

function AnalyticsLinkPage() {
  const loaded = Route.useLoaderData();
  const { organization, queryClient } = Route.useRouteContext();
  const { links, documents } = getCollections(queryClient, organization.id);
  const link = links.get(loaded.link.id) ?? loaded.link;
  const { data: documentRows } = useLiveQuery({
    query: (query) => query.from({ document: documents }).select(({ document }) => document),
  });
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
              Last active <time dateTime={lastActive.dateTime}>{lastActive.label}</time>.
            </>
          ) : (
            "This Link has not been active in the range."
          )}
        </PageDescription>
        <PageActions>
          <GateBadges link={link} />
          <LinkStatusBadge isActive={link.isActive} />
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link to="/dashboard/links/$linkId" params={{ linkId: link.id }} />}
          >
            <SettingsIcon data-icon="inline-start" />
            Link settings
          </Button>
        </PageActions>
      </PageHeader>

      <AnalyticsRangeControls {...analytics.range} linkId={link.id} />
      <DemoAnalyticsNotice incomplete={analytics.analyticsIncomplete} />

      {analytics.truncated ? (
        <Alert>
          <AlertTitle>Showing the most recent {ANALYTICS_VISIT_CAP} Visits</AlertTitle>
          <AlertDescription>
            This range has more Visits than can be folded here. The numbers below are for the most
            recent {ANALYTICS_VISIT_CAP} Visits in the range, not a total.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {analytics.truncated ? <>Most recent {ANALYTICS_VISIT_CAP} Visits</> : "Totals"}
          </CardTitle>
          <CardDescription>
            {analyticsTrustworthy(link)
              ? "Visits, unique visitors, captured emails, Total time, and downloads for the active range."
              : "This Link has no Requirements, so anyone with the URL can create Visits. Add a password or an email Requirement to make these numbers trustworthy."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatList stats={metrics} />
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
              <CardTitle className="flex items-center gap-2">
                {kind ? (
                  <DocumentKindIcon kind={kind} className="size-3.5 text-muted-foreground" />
                ) : null}
                {document?.title || "Document"}
              </CardTitle>
              <CardDescription>
                {analyticsNumberFormat.format(row.views)} Views · Total time{" "}
                {formatTotalTime(row.totalMs)}
                {kind === "markdown"
                  ? " · Reading position is not recorded, so this is the finding for the whole Document."
                  : ""}
              </CardDescription>
            </CardHeader>
            {showPages ? (
              <CardContent className="flex flex-col gap-4">
                <AnalyticsDwellChart pages={pages} />
                <DwellTable pages={pages} views={row.views} />
              </CardContent>
            ) : null}
          </Card>
        );
      })}

      <AnalyticsVisitTimeline identities={analytics.identities} documents={documentById} />
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
          <TableHead className="text-right">Total time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pages.map((row) => (
          <TableRow key={row.page}>
            <TableCell>Page {row.page}</TableCell>
            <TableCell className="text-right tabular-nums">{formatTotalTime(row.ms)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
