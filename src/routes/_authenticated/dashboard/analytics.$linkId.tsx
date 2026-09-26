import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { SettingsIcon, ShieldAlertIcon, TableIcon } from "lucide-react";
import { useState } from "react";

import { AnalyticsDwellChart } from "#/components/analytics-dwell-chart";
import { CompletionMeter } from "#/components/analytics-reading";
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
  formatCompletion,
  formatTotalTime,
} from "#/lib/analytics-format";
import { foldLinkReading, type DocumentReading } from "#/lib/analytics-reading";
import { analyticsRangeSchema } from "#/lib/dashboard-search";
import { documentKindLabel, type DocumentKind } from "#/lib/document-kind";
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
  const reading = foldLinkReading(analytics.identities, documentById);
  const lastActive = lastActiveIso(analytics.lastSeenAt);
  const { totals } = analytics;
  const metrics = [
    {
      label: analytics.truncated ? "Visits shown" : "Visits",
      value: analyticsNumberFormat.format(totals.visits),
    },
    {
      label: "Unique visitors",
      value: analyticsNumberFormat.format(totals.viewerIdentities),
      detail: `${analyticsNumberFormat.format(totals.emails)} with an email`,
    },
    ...(reading.completion === null
      ? []
      : [
          {
            label: "Avg. completion",
            value: formatCompletion(reading.completion),
            detail: "Share of PDF pages read",
          },
        ]),
    {
      label: "Total time",
      value: formatTotalTime(totals.totalMs),
      detail:
        totals.visits > 0
          ? `${formatTotalTime(Math.round(totals.totalMs / totals.visits))} per visit`
          : undefined,
    },
    { label: "Downloads", value: analyticsNumberFormat.format(totals.downloads) },
  ];
  const shownDocuments = [...documentsForLink(link.documentId, analytics.documents)].sort(
    (first, second) => second.totalMs - first.totalMs,
  );

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
            "This link has not been active in the range."
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
          <AlertTitle>Showing the most recent {ANALYTICS_VISIT_CAP} visits</AlertTitle>
          <AlertDescription>
            Only the most recent {ANALYTICS_VISIT_CAP} visits in this date range are included in the
            totals below.
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-label="Summary" className="flex flex-col gap-2">
        <Card>
          <CardContent>
            <StatList stats={metrics} />
          </CardContent>
        </Card>
        {!analyticsTrustworthy(link) ? (
          <p className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
            <ShieldAlertIcon className="size-3.5 shrink-0" />
            Anyone with this URL can visit, including bots. Require a password or email to reduce
            automated visits.
          </p>
        ) : null}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{shownDocuments.length === 1 ? "Document" : "Documents"}</CardTitle>
          <CardDescription>How each document was read in this range.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {shownDocuments.map((row) => (
            <DocumentReadingSection
              key={row.documentId}
              row={row}
              document={documentById.get(row.documentId)}
              reading={reading.documents.get(row.documentId)}
            />
          ))}
        </CardContent>
      </Card>

      <AnalyticsVisitTimeline
        identities={analytics.identities}
        documents={documentById}
        readings={reading.identities}
      />
    </Page>
  );
}

function DocumentReadingSection({
  row,
  document,
  reading,
}: Readonly<{
  row: AnalyticsLinkDocument;
  document: { title: string; kind: DocumentKind; pageCount: number | null } | undefined;
  reading: DocumentReading | undefined;
}>) {
  const [showTable, setShowTable] = useState(false);
  const kind = document?.kind;
  const showPages = kind === "pdf";
  const pages = showPages ? dwellPagesWithZeros(document?.pageCount ?? null, row.pages) : [];

  return (
    <section className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
            {kind ? (
              <DocumentKindIcon kind={kind} className="size-4 text-muted-foreground" />
            ) : null}
          </span>
          <div className="flex min-w-0 flex-col">
            <h3 className="truncate text-sm font-medium">{document?.title || "Document"}</h3>
            <p className="text-[0.6875rem] text-muted-foreground">
              {kind ? documentKindLabel(kind) : "Document"}
              {showPages && document?.pageCount ? ` · ${document.pageCount} pages` : ""}
              {kind === "markdown" ? " · Time is measured for the whole document." : ""}
            </p>
          </div>
        </div>
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs tabular-nums">
          <DocumentFigure label="Views" value={analyticsNumberFormat.format(row.views)} />
          <DocumentFigure label="Total time" value={formatTotalTime(row.totalMs)} />
          {row.downloads > 0 ? (
            <DocumentFigure label="Downloads" value={analyticsNumberFormat.format(row.downloads)} />
          ) : null}
          {reading?.completion != null ? (
            <div className="flex flex-col gap-0.5">
              <dt className="text-[0.625rem] text-muted-foreground">Avg. completion</dt>
              <dd>
                <CompletionMeter value={reading.completion} label="Average completion" />
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
      {showPages ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-medium">Time per page</h4>
            <Button
              variant="ghost"
              size="xs"
              aria-expanded={showTable}
              onClick={() => setShowTable((current) => !current)}
            >
              <TableIcon data-icon="inline-start" />
              {showTable ? "Hide table" : "Show table"}
            </Button>
          </div>
          <AnalyticsDwellChart
            pages={pages}
            readersByPage={reading?.readersByPage}
            views={reading?.views}
          />
          {showTable ? <DwellTable pages={pages} views={row.views} readers={reading} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function DocumentFigure({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[0.625rem] text-muted-foreground">{label}</dt>
      <dd className="font-medium whitespace-nowrap">{value}</dd>
    </div>
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
  readers,
}: Readonly<{
  pages: ReadonlyArray<{ page: number; ms: number }>;
  views: number;
  readers: DocumentReading | undefined;
}>) {
  return (
    <Table>
      <TableCaption>
        {views > 0 && pages.every((row) => row.ms === 0)
          ? "No reading time recorded."
          : "Time per page."}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Page</TableHead>
          <TableHead className="text-right">Views that reached it</TableHead>
          <TableHead className="text-right">Total time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pages.map((row) => (
          <TableRow key={row.page}>
            <TableCell>Page {row.page}</TableCell>
            <TableCell className="text-right tabular-nums">
              {analyticsNumberFormat.format(readers?.readersByPage.get(row.page) ?? 0)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatTotalTime(row.ms)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
