import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { ArrowDownIcon, ChartNoAxesCombinedIcon } from "lucide-react";
import { useState } from "react";

import { AnalyticsRangeControls } from "#/components/analytics-range-controls";
import { DemoAnalyticsNotice } from "#/components/demo-analytics-notice";
import { AnalyticsTrustMark, LinkStatusBadge } from "#/components/link-badges";
import { Page, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { StatList } from "#/components/stat-list";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { TableFrame } from "#/components/table-frame";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { getCollections } from "#/db-collections";
import { useIntentPreload } from "#/hooks/use-intent-preload";
import { analyticsNumberFormat, formatTotalTime } from "#/lib/analytics-format";
import { dashboardDestinations } from "#/lib/dashboard-destinations";
import { analyticsRangeSchema } from "#/lib/dashboard-search";
import { isLinkSlug, linkViewerPath } from "#/lib/link-slug";
import { cn } from "#/lib/utils";
import { getAnalytics } from "#/server/functions/analytics";

export const Route = createFileRoute("/_authenticated/dashboard/analytics/")({
  validateSearch: analyticsRangeSchema,
  loaderDeps: ({ search: { from, to } }) => ({ from, to }),
  loader: ({ deps }) => getAnalytics({ data: deps }),
  component: AnalyticsPage,
});

const metricColumns = [
  { key: "visits", label: "Visits", format: "count" },
  { key: "viewerIdentities", label: "Unique", format: "count" },
  { key: "emails", label: "Emails", format: "count" },
  { key: "totalMs", label: "Total time", format: "duration" },
  { key: "downloads", label: "Downloads", format: "count" },
] as const;

type SortKey = (typeof metricColumns)[number]["key"];

function formatMetric(column: (typeof metricColumns)[number], value: number) {
  return column.format === "duration"
    ? formatTotalTime(value)
    : analyticsNumberFormat.format(value);
}

function AnalyticsLinkName({
  children,
  linkId,
  preloadScope,
  range,
}: Readonly<{
  children: string;
  linkId: string;
  preloadScope: string;
  range: { from: string; to: string };
}>) {
  const router = useRouter();
  const { linkProps } = useIntentPreload({
    scope: `${preloadScope}:${linkId}:${range.from}:${range.to}`,
    preload: () =>
      router.preloadRoute({
        to: "/dashboard/analytics/$linkId",
        params: { linkId },
        search: range,
      }),
  });

  return (
    <Link
      to="/dashboard/analytics/$linkId"
      params={{ linkId }}
      search={range}
      {...linkProps}
      className="truncate hover:underline"
    >
      {children}
    </Link>
  );
}

function AnalyticsPage() {
  const analytics = Route.useLoaderData();
  const { organization, queryClient } = Route.useRouteContext();
  const { links } = getCollections(queryClient, organization.id);
  const { data: linkRows } = useLiveQuery({
    query: (query) => query.from({ link: links }).select(({ link }) => link),
  });
  const [sortBy, setSortBy] = useState<SortKey>("visits");
  const linkById = new Map(linkRows.map((link) => [link.id, link]));
  const sortedLinks = [...analytics.links].sort((first, second) => {
    const activityDifference = second[sortBy] - first[sortBy];
    if (activityDifference !== 0) return activityDifference;
    return first.linkId.localeCompare(second.linkId);
  });
  const hasLinks = analytics.links.length > 0;
  const totals = analytics.links.reduce(
    (running, link) => ({
      visits: running.visits + link.visits,
      viewerIdentities: running.viewerIdentities + link.viewerIdentities,
      emails: running.emails + link.emails,
      totalMs: running.totalMs + link.totalMs,
      downloads: running.downloads + link.downloads,
    }),
    { visits: 0, viewerIdentities: 0, emails: 0, totalMs: 0, downloads: 0 },
  );
  const hasVisitsInRange = totals.visits > 0;

  return (
    <Page>
      <PageHeader>
        <PageTitle>{dashboardDestinations.analytics.label}</PageTitle>
        <PageDescription>
          Compare every Link by Visits, unique visitors, captured emails, Total time, and downloads.
        </PageDescription>
      </PageHeader>

      <AnalyticsRangeControls {...analytics.range} />
      <DemoAnalyticsNotice incomplete={analytics.analyticsIncomplete} />

      {analytics.allTimeVisits === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartNoAxesCombinedIcon />
            </EmptyMedia>
            <EmptyTitle>No Visits yet</EmptyTitle>
            <EmptyDescription>
              Share a Link to bring Visitors to a Document or Vault and start collecting analytics.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link to="/dashboard/links" />}>
              Share a Link
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Every Link in this range</CardTitle>
              <CardDescription>
                {hasVisitsInRange
                  ? "The Organization's totals for the active UTC date range."
                  : "This Organization has Visits, but none started during the active UTC date range."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatList
                stats={metricColumns.map((column) => ({
                  label: column.label,
                  value: formatMetric(column, totals[column.key]),
                }))}
              />
            </CardContent>
          </Card>

          {hasLinks ? (
            <TableFrame>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-3">Link</TableHead>
                  <TableHead>Status</TableHead>
                  {metricColumns.map((column) => (
                    <TableHead key={column.key} className="text-right last:pr-3">
                      <button
                        type="button"
                        aria-label={`Sort by ${column.label}`}
                        aria-pressed={sortBy === column.key}
                        onClick={() => setSortBy(column.key)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-sm px-1 py-0.5 hover:text-foreground",
                          sortBy === column.key ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {column.label}
                        <ArrowDownIcon
                          className={cn(
                            "size-3",
                            sortBy === column.key ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLinks.map((row) => {
                  const link = linkById.get(row.linkId);

                  return (
                    <TableRow key={row.linkId}>
                      <TableCell className="max-w-64 pl-3 font-medium">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <AnalyticsLinkName
                            linkId={row.linkId}
                            preloadScope={organization.id}
                            range={analytics.range}
                          >
                            {link?.name ||
                              (link && isLinkSlug(link.slug) ? linkViewerPath(link.slug) : "Link")}
                          </AnalyticsLinkName>
                          <AnalyticsTrustMark link={link} />
                        </span>
                      </TableCell>
                      <TableCell>
                        <LinkStatusBadge isActive={link?.isActive !== false} />
                      </TableCell>
                      {metricColumns.map((column) => (
                        <TableCell
                          key={column.key}
                          className={cn(
                            "text-right tabular-nums last:pr-3",
                            sortBy === column.key ? "font-medium" : "text-muted-foreground",
                          )}
                        >
                          {formatMetric(column, row[column.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </TableFrame>
          ) : null}
        </>
      )}
    </Page>
  );
}
