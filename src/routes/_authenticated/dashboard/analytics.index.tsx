import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { ChartNoAxesCombinedIcon } from "lucide-react";
import { useState } from "react";

import { AnalyticsLinkTotalsCard } from "#/components/analytics-link-totals-card";
import { AnalyticsRangeControls } from "#/components/analytics-range-controls";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { Field, FieldLabel } from "#/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { getCollections } from "#/db-collections";
import { analyticsNumberFormat, formatTotalTime } from "#/lib/analytics-format";
import { dashboardDestinations } from "#/lib/dashboard-destinations";
import { analyticsRangeSchema } from "#/lib/dashboard-search";
import { getAnalytics } from "#/server/functions/analytics";

export const Route = createFileRoute("/_authenticated/dashboard/analytics/")({
  validateSearch: analyticsRangeSchema,
  loaderDeps: ({ search: { from, to } }) => ({ from, to }),
  loader: ({ deps }) => getAnalytics({ data: deps }),
  component: AnalyticsPage,
});

const sortOptions = [
  { label: "Visits", value: "visits" },
  { label: "Unique visitors", value: "viewerIdentities" },
  { label: "Captured emails", value: "emails" },
  { label: "Total time", value: "totalMs" },
  { label: "Downloads", value: "downloads" },
] as const;

type SortKey = (typeof sortOptions)[number]["value"];

function isSortKey(value: unknown): value is SortKey {
  return sortOptions.some((option) => option.value === value);
}

function AnalyticsPage() {
  const analytics = Route.useLoaderData();
  const { organization, queryClient } = Route.useRouteContext();
  const { links } = getCollections(queryClient, organization.id);
  const { data: linkRows } = useLiveQuery(
    (query) => query.from({ link: links }).select(({ link }) => link),
    [links],
  );
  const [sortBy, setSortBy] = useState<SortKey>("visits");
  const linkById = new Map(linkRows.map((link) => [link.id, link]));
  const totalVisits = analytics.links.reduce((total, link) => total + link.visits, 0);
  const sortedLinks = [...analytics.links].sort((first, second) => {
    const activityDifference = second[sortBy] - first[sortBy];
    if (activityDifference !== 0) return activityDifference;
    return first.linkId.localeCompare(second.linkId);
  });
  const hasLinks = analytics.links.length > 0;
  const hasVisitsInRange = totalVisits > 0;

  return (
    <Page>
      <PageHeader>
        <PageTitle>{dashboardDestinations.analytics.label}</PageTitle>
        <PageDescription>
          Compare every Link by Visits, unique visitors, captured emails, Total time, and downloads.
        </PageDescription>
        {hasLinks ? (
          <PageActions>
            <Field orientation="horizontal">
              <FieldLabel htmlFor="analytics-sort">Sort by activity</FieldLabel>
              <Select
                items={sortOptions}
                value={sortBy}
                onValueChange={(value) => {
                  if (isSortKey(value)) setSortBy(value);
                }}
              >
                <SelectTrigger id="analytics-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {sortOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </PageActions>
        ) : null}
      </PageHeader>

      <AnalyticsRangeControls {...analytics.range} />

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
      ) : !hasVisitsInRange ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartNoAxesCombinedIcon />
            </EmptyMedia>
            <EmptyTitle>No Visits in this range</EmptyTitle>
            <EmptyDescription>
              This Organization has Visits, but none started during the active UTC date range.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {hasLinks ? (
        <div className="flex flex-col gap-3">
          {sortedLinks.map((totals) => {
            const link = linkById.get(totals.linkId);
            const metrics = [
              { label: "Visits", value: analyticsNumberFormat.format(totals.visits) },
              {
                label: "Unique visitors",
                value: analyticsNumberFormat.format(totals.viewerIdentities),
              },
              { label: "Captured emails", value: analyticsNumberFormat.format(totals.emails) },
              { label: "Total time", value: formatTotalTime(totals.totalMs) },
              { label: "Downloads", value: analyticsNumberFormat.format(totals.downloads) },
            ];

            return (
              <AnalyticsLinkTotalsCard
                key={totals.linkId}
                linkId={totals.linkId}
                range={analytics.range}
                link={link}
                metrics={metrics}
                metricsClassName="sm:grid-cols-3 xl:grid-cols-5"
              />
            );
          })}
        </div>
      ) : null}
    </Page>
  );
}
