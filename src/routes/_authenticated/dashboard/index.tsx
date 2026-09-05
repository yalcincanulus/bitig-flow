import { count, useLiveQuery } from "@tanstack/react-db";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  ChartNoAxesCombinedIcon,
  FileTextIcon,
  FolderClosedIcon,
  LinkIcon,
} from "lucide-react";

import { DemoAnalyticsNotice } from "#/components/demo-analytics-notice";
import { AnalyticsTrustMark } from "#/components/link-badges";
import { StatList } from "#/components/stat-list";
import { DocumentKindIcon } from "#/components/document-kind";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { getCollections } from "#/db-collections";
import {
  analyticsNumberFormat,
  formatTotalTime,
  formatAnalyticsInstant,
} from "#/lib/analytics-format";
import { dashboardDestinations } from "#/lib/dashboard-destinations";
import { documentKindLabel } from "#/lib/document-kind";

import { getAnalytics } from "#/server/functions/analytics";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  loader: () => getAnalytics({ data: {} }),
  component: DashboardHome,
});

function DashboardHome() {
  const analytics = Route.useLoaderData();
  const { organization, queryClient } = Route.useRouteContext();
  const { documents, vaults, links } = getCollections(queryClient, organization.id);
  const { data: documentTotals } = useLiveQuery({
    query: (q) =>
      q.from({ document: documents }).select(({ document }) => ({ total: count(document.id) })),
  });
  const { data: vaultTotals } = useLiveQuery({
    query: (q) => q.from({ vault: vaults }).select(({ vault }) => ({ total: count(vault.id) })),
  });
  const { data: linkTotals } = useLiveQuery({
    query: (q) => q.from({ link: links }).select(({ link }) => ({ total: count(link.id) })),
  });
  const { data: recentDocuments } = useLiveQuery({
    query: (q) =>
      q
        .from({ document: documents })
        .orderBy(({ document }) => document.updatedAt, "desc")
        .orderBy(({ document }) => document.id, "asc")
        .limit(5)
        .select(({ document }) => ({
          id: document.id,
          title: document.title,
          kind: document.kind,
          updatedAt: document.updatedAt,
        })),
  });
  const summaries = [
    {
      destination: dashboardDestinations.documents,
      total: documentTotals[0]?.total ?? 0,
      icon: FileTextIcon,
      description: "Your written and uploaded content.",
    },
    {
      destination: dashboardDestinations.vaults,
      total: vaultTotals[0]?.total ?? 0,
      icon: FolderClosedIcon,
      description: "Documents organized into collections.",
    },
    {
      destination: dashboardDestinations.links,
      total: linkTotals[0]?.total ?? 0,
      icon: LinkIcon,
      description: "Sharing links across your organization.",
    },
  ];

  return (
    <Page>
      <PageHeader>
        <PageTitle>Home</PageTitle>
        <PageDescription>An overview of {organization.name}.</PageDescription>
        <PageActions>
          <Button variant="outline" render={<Link {...dashboardDestinations.analytics.link} />}>
            <ChartNoAxesCombinedIcon data-icon="inline-start" />
            View analytics
          </Button>
        </PageActions>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        {summaries.map(({ destination, total, icon: Icon, description }) => (
          <Card key={destination.label}>
            <CardHeader>
              <CardTitle>
                <h2>{destination.label}</h2>
              </CardTitle>
              <CardDescription>{description}</CardDescription>
              <CardAction>
                <Icon className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{total.toLocaleString()}</p>
            </CardContent>
            <CardFooter>
              <Button variant="ghost" size="sm" render={<Link {...destination.link} />}>
                Browse {destination.label.toLowerCase()}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <HomeAnalytics analytics={analytics} links={links} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Recently updated documents</h2>
            </CardTitle>
            <CardDescription>Pick up where your organization left off.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentDocuments.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileTextIcon />
                  </EmptyMedia>
                  <EmptyTitle>No documents yet</EmptyTitle>
                  <EmptyDescription>
                    Create a document or upload a file to start sharing.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-1">
                {recentDocuments.map((document) => {
                  const updated = formatAnalyticsInstant(document.updatedAt);
                  return (
                    <li key={document.id}>
                      <Link
                        to="/dashboard/documents/$documentId"
                        params={{ documentId: document.id }}
                        className="flex min-w-0 items-center gap-3 rounded-md p-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <DocumentKindIcon
                          kind={document.kind}
                          className="size-5 shrink-0 text-muted-foreground"
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="truncate text-sm font-medium">
                            {document.title || "Untitled"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {documentKindLabel(document.kind)}
                          </span>
                        </div>
                        <time
                          dateTime={updated.dateTime}
                          className="hidden shrink-0 text-xs text-muted-foreground sm:block"
                        >
                          {updated.label}
                        </time>
                        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              size="sm"
              render={<Link {...dashboardDestinations.documents.link} />}
            >
              View all documents
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>From document to insight</h2>
            </CardTitle>
            <CardDescription>
              Prepare your content, share it, and see how people engage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-5">
              <li className="flex flex-col gap-1">
                <Link
                  {...dashboardDestinations.documents.link}
                  className="text-sm font-medium underline-offset-4 hover:underline"
                >
                  1. Add your documents
                </Link>
                <p className="text-xs text-muted-foreground">
                  Write a document or upload a PDF or image.
                </p>
              </li>
              <li className="flex flex-col gap-1">
                <Link
                  {...dashboardDestinations.vaults.link}
                  className="text-sm font-medium underline-offset-4 hover:underline"
                >
                  2. Organize into vaults
                </Link>
                <p className="text-xs text-muted-foreground">
                  Keep related documents together to share as a collection.
                </p>
              </li>
              <li className="flex flex-col gap-1">
                <Link
                  {...dashboardDestinations.links.link}
                  className="text-sm font-medium underline-offset-4 hover:underline"
                >
                  3. Share with a link
                </Link>
                <p className="text-xs text-muted-foreground">
                  Choose access gates, then follow visits in analytics.
                </p>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}

function HomeAnalytics({
  analytics,
  links,
}: Readonly<{
  analytics: Awaited<ReturnType<typeof getAnalytics>>;
  links: ReturnType<typeof getCollections>["links"];
}>) {
  const { data: linkRows } = useLiveQuery({
    query: (q) => q.from({ link: links }).select(({ link }) => link),
  });
  const linkById = new Map(linkRows.map((link) => [link.id, link]));
  const totals = analytics.links.reduce(
    (total, link) => ({
      visits: total.visits + link.visits,
      totalMs: total.totalMs + link.totalMs,
      downloads: total.downloads + link.downloads,
      engagedLinks: total.engagedLinks + (link.visits > 0 ? 1 : 0),
    }),
    { visits: 0, totalMs: 0, downloads: 0, engagedLinks: 0 },
  );
  const topLinks = analytics.links
    .filter((link) => link.visits > 0)
    .sort((a, b) => b.visits - a.visits || a.linkId.localeCompare(b.linkId))
    .slice(0, 5);

  return (
    <section aria-label="Recent engagement" className="flex flex-col gap-4">
      <DemoAnalyticsNotice incomplete={analytics.analyticsIncomplete} />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Engagement · last 30 days</h2>
          </CardTitle>
          <CardDescription>
            Visits started from <time dateTime={analytics.range.from}>{analytics.range.from}</time>{" "}
            to <time dateTime={analytics.range.to}>{analytics.range.to}</time>, UTC.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatList
            stats={[
              { label: "Visits", value: analyticsNumberFormat.format(totals.visits) },
              {
                label: "Links with visits",
                value: analyticsNumberFormat.format(totals.engagedLinks),
              },
              { label: "Total viewing time", value: formatTotalTime(totals.totalMs) },
              {
                label: "Time per visit",
                value:
                  totals.visits > 0
                    ? formatTotalTime(Math.round(totals.totalMs / totals.visits))
                    : "—",
              },
              { label: "Downloads", value: analyticsNumberFormat.format(totals.downloads) },
            ]}
          />
        </CardContent>
        <CardFooter>
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link to="/dashboard/analytics" search={analytics.range} />}
          >
            Explore analytics
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Most visited links</h2>
          </CardTitle>
          <CardDescription>Your top five links by visits in this date range.</CardDescription>
        </CardHeader>
        <CardContent>
          {topLinks.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ChartNoAxesCombinedIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {analytics.allTimeVisits === 0
                    ? "No visits yet"
                    : "No visits in the last 30 days"}
                </EmptyTitle>
                <EmptyDescription>
                  Share a link to see how people engage with your documents.
                </EmptyDescription>
              </EmptyHeader>
              <Button
                nativeButton={false}
                variant="outline"
                size="sm"
                render={<Link to="/dashboard/links" />}
              >
                View sharing links
              </Button>
            </Empty>
          ) : (
            <ol className="flex flex-col gap-1">
              {topLinks.map((row, index) => {
                const link = linkById.get(row.linkId);
                return (
                  <li
                    key={row.linkId}
                    className="flex min-w-0 items-center gap-3 rounded-md p-3 hover:bg-muted"
                  >
                    <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Link
                          to="/dashboard/analytics/$linkId"
                          params={{ linkId: row.linkId }}
                          search={analytics.range}
                          className="truncate text-sm font-medium underline-offset-4 hover:underline"
                        >
                          {link?.name || link?.slug || "Link"}
                        </Link>
                        <AnalyticsTrustMark link={link} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTotalTime(row.totalMs)} viewing time ·{" "}
                        {analyticsNumberFormat.format(row.downloads)} downloads
                      </p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums">
                      {analyticsNumberFormat.format(row.visits)}{" "}
                      {row.visits === 1 ? "visit" : "visits"}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
