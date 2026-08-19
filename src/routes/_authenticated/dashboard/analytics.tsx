import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { ChartNoAxesCombinedIcon, ShieldAlertIcon } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
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
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { getCollections } from "#/db-collections";
import { dashboardDestinations } from "#/lib/dashboard-destinations";
import { analyticsRangeSchema } from "#/lib/dashboard-search";
import { analyticsTrustworthy } from "#/lib/link-trust";
import { getAnalytics } from "#/server/functions/analytics";

export const Route = createFileRoute("/_authenticated/dashboard/analytics")({
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

const numberFormat = new Intl.NumberFormat();

function isSortKey(value: unknown): value is SortKey {
  return sortOptions.some((option) => option.value === value);
}

function formatTotalTime(milliseconds: number) {
  if (milliseconds < 1_000) return `${numberFormat.format(milliseconds)} ms`;
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function RangeControls({ from, to }: Readonly<{ from: string; to: string }>) {
  const navigate = useNavigate();

  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const nextFrom = values.get("from");
    const nextTo = values.get("to");
    if (typeof nextFrom !== "string" || typeof nextTo !== "string") return;

    void navigate({
      to: "/dashboard/analytics",
      search: { from: nextFrom, to: nextTo },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Date range</CardTitle>
        <CardDescription>
          Active range: <time dateTime={from}>{from}</time> through <time dateTime={to}>{to}</time>,
          using the UTC clock.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form key={`${from}:${to}`} onSubmit={applyRange}>
          <FieldGroup className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,12rem)_auto] sm:items-end">
            <Field>
              <FieldLabel htmlFor="analytics-from">From</FieldLabel>
              <Input id="analytics-from" name="from" type="date" defaultValue={from} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="analytics-to">To</FieldLabel>
              <Input id="analytics-to" name="to" type="date" defaultValue={to} required />
            </Field>
            <Field orientation="horizontal" className="flex-wrap">
              <Button type="submit">Apply range</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigate({ to: "/dashboard/analytics", search: {} })}
              >
                Last 30 days
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
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

      <RangeControls {...analytics.range} />

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
              { label: "Visits", value: numberFormat.format(totals.visits) },
              { label: "Unique visitors", value: numberFormat.format(totals.viewerIdentities) },
              { label: "Captured emails", value: numberFormat.format(totals.emails) },
              { label: "Total time", value: formatTotalTime(totals.totalMs) },
              { label: "Downloads", value: numberFormat.format(totals.downloads) },
            ];

            return (
              <Card key={totals.linkId} size="sm">
                <CardHeader>
                  <CardTitle>
                    <Link
                      to="/dashboard/links/$linkId"
                      params={{ linkId: totals.linkId }}
                      className="hover:underline"
                    >
                      {link?.name || (link ? `/v/${link.slug}` : "Link")}
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
            );
          })}
        </div>
      ) : null}
    </Page>
  );
}
