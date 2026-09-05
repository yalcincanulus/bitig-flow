import { count, eq, useLiveQuery } from "@tanstack/react-db";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  ChartNoAxesCombinedIcon,
  FileTextIcon,
  FolderClosedIcon,
  LinkIcon,
  MinusIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";

import { DemoAnalyticsNotice } from "#/components/demo-analytics-notice";
import { DocumentKindIcon } from "#/components/document-kind";
import { HomeVisitTrend } from "#/components/home-visit-trend";
import { AnalyticsTrustMark } from "#/components/link-badges";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { StatList } from "#/components/stat-list";
import { Button } from "#/components/ui/button";
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
  formatAnalyticsInstant,
  formatTotalTime,
} from "#/lib/analytics-format";
import { analyticsRangeDateCount } from "#/lib/analytics-fold";
import { dashboardDestinations } from "#/lib/dashboard-destinations";
import { documentKindLabel } from "#/lib/document-kind";
import { cn } from "#/lib/utils";
import { getAnalytics } from "#/server/functions/analytics";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  loader: () => getAnalytics({ data: {} }),
  component: DashboardHome,
});

type HomeAnalytics = Awaited<ReturnType<typeof getAnalytics>>;

/**
 * A section of Home: a hairline, a heading, and whatever the section is about underneath.
 *
 * Home used to be six Cards stacked on one another, which gave every part of it the same weight and
 * the same border. A rule and a heading separate them for a tenth of the ink.
 */
function HomeSection({
  title,
  description,
  action,
  children,
}: Readonly<{
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex items-end justify-between gap-4 border-b border-border/70 pb-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-heading text-sm font-medium">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DashboardHome() {
  const analytics = Route.useLoaderData();
  const { organization, queryClient } = Route.useRouteContext();
  const { documents, vaults, vaultItems, links } = getCollections(queryClient, organization.id);
  const { data: documentTotals } = useLiveQuery({
    query: (q) =>
      q.from({ document: documents }).select(({ document }) => ({ total: count(document.id) })),
  });
  const { data: readyDocumentTotals } = useLiveQuery({
    query: (q) =>
      q
        .from({ document: documents })
        .where(({ document }) => eq(document.status, "ready"))
        .select(({ document }) => ({ total: count(document.id) })),
  });
  const { data: vaultTotals } = useLiveQuery({
    query: (q) => q.from({ vault: vaults }).select(({ vault }) => ({ total: count(vault.id) })),
  });
  const { data: vaultItemRows } = useLiveQuery({
    query: (q) =>
      q.from({ vaultItem: vaultItems }).select(({ vaultItem }) => ({
        documentId: vaultItem.documentId,
      })),
  });
  const { data: linkTotals } = useLiveQuery({
    query: (q) => q.from({ link: links }).select(({ link }) => ({ total: count(link.id) })),
  });
  const { data: activeLinkTotals } = useLiveQuery({
    query: (q) =>
      q
        .from({ link: links })
        .where(({ link }) => eq(link.isActive, true))
        .select(({ link }) => ({ total: count(link.id) })),
  });
  const { data: recentDocuments } = useLiveQuery({
    query: (q) =>
      q
        .from({ document: documents })
        .orderBy(({ document }) => document.updatedAt, "desc")
        .orderBy(({ document }) => document.id, "asc")
        .limit(6)
        .select(({ document }) => ({
          id: document.id,
          title: document.title,
          kind: document.kind,
          updatedAt: document.updatedAt,
        })),
  });

  const documentCount = documentTotals[0]?.total ?? 0;
  const vaultCount = vaultTotals[0]?.total ?? 0;
  const linkCount = linkTotals[0]?.total ?? 0;
  const pendingDocuments = documentCount - (readyDocumentTotals[0]?.total ?? 0);
  const inactiveLinks = linkCount - (activeLinkTotals[0]?.total ?? 0);
  const vaultDocuments = new Set(vaultItemRows.map((row) => row.documentId)).size;
  // A tile states its own total, and adds a second figure only when that figure is news.
  const library = [
    {
      destination: dashboardDestinations.documents,
      total: documentCount,
      icon: FileTextIcon,
      detail:
        pendingDocuments > 0
          ? `${analyticsNumberFormat.format(pendingDocuments)} awaiting upload`
          : null,
    },
    {
      destination: dashboardDestinations.vaults,
      total: vaultCount,
      icon: FolderClosedIcon,
      detail:
        vaultDocuments > 0
          ? `${analyticsNumberFormat.format(vaultDocuments)} Documents inside`
          : null,
    },
    {
      destination: dashboardDestinations.links,
      total: linkCount,
      icon: LinkIcon,
      detail: inactiveLinks > 0 ? `${analyticsNumberFormat.format(inactiveLinks)} inactive` : null,
    },
  ];
  // Nothing published means every figure below is a zero, so the page offers the first step instead.
  const started = documentCount > 0 || linkCount > 0;

  return (
    <Page className="gap-8">
      <PageHeader>
        <PageTitle className="text-2xl tracking-tight sm:text-3xl">{organization.name}</PageTitle>
        <PageDescription>
          What this Organization shares, and how people are reading it.
        </PageDescription>
        <PageActions>
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link {...dashboardDestinations.analytics.link} />}
          >
            <ChartNoAxesCombinedIcon data-icon="inline-start" />
            View analytics
          </Button>
        </PageActions>
      </PageHeader>

      <nav
        aria-label="Library"
        className="grid divide-y divide-border/70 border-y border-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        {library.map(({ destination, total, icon: Icon, detail }) => (
          <Link
            key={destination.label}
            {...destination.link}
            className="group flex items-center gap-4 px-4 py-4 transition-colors first:pl-1 last:pr-1 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-chart-2/10 text-chart-2">
              <Icon className="size-4.5" />
            </span>
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
                {destination.label}
              </span>
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="text-2xl leading-none font-semibold tabular-nums">
                  {analyticsNumberFormat.format(total)}
                </span>
                {detail === null ? null : (
                  <span className="truncate text-xs text-muted-foreground">{detail}</span>
                )}
              </span>
            </span>
            <ArrowUpRightIcon className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </nav>

      <DemoAnalyticsNotice incomplete={analytics.analyticsIncomplete} />

      {started ? (
        <>
          <HomeEngagement analytics={analytics} />
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <HomeTopLinks analytics={analytics} links={links} />
            <HomeSection
              title="Recently updated Documents"
              description="Pick up where this Organization left off."
              action={
                <Button
                  nativeButton={false}
                  variant="ghost"
                  size="sm"
                  render={<Link {...dashboardDestinations.documents.link} />}
                >
                  All
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              }
            >
              {recentDocuments.length === 0 ? (
                // A Vault Link outlives the Documents it served, so Home can be started and empty.
                <p className="text-xs text-muted-foreground">
                  This Organization has no Documents yet.
                </p>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {recentDocuments.map((document) => {
                    const updated = formatAnalyticsInstant(document.updatedAt);

                    return (
                      <li key={document.id}>
                        <Link
                          to="/dashboard/documents/$documentId"
                          params={{ documentId: document.id }}
                          className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <DocumentKindIcon kind={document.kind} className="size-4" />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium">
                              {document.title || "Untitled"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {documentKindLabel(document.kind)}
                            </span>
                          </span>
                          <time
                            dateTime={updated.dateTime}
                            title={updated.label}
                            className="shrink-0 text-xs text-muted-foreground tabular-nums"
                          >
                            {updated.dateTime.slice(0, 10)}
                          </time>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </HomeSection>
          </div>
        </>
      ) : (
        <HomeFirstSteps />
      )}
    </Page>
  );
}

/**
 * The Organization's engagement in the active range: the one figure that matters, its shape over
 * the range's dates, and the five readings that qualify it.
 */
function HomeEngagement({ analytics }: Readonly<{ analytics: HomeAnalytics }>) {
  const totals = analytics.links.reduce(
    (total, link) => ({
      visits: total.visits + link.visits,
      viewerIdentities: total.viewerIdentities + link.viewerIdentities,
      totalMs: total.totalMs + link.totalMs,
      downloads: total.downloads + link.downloads,
      engagedLinks: total.engagedLinks + (link.visits > 0 ? 1 : 0),
    }),
    { visits: 0, viewerIdentities: 0, totalMs: 0, downloads: 0, engagedLinks: 0 },
  );
  const dateCount = analyticsRangeDateCount(analytics.range);

  return (
    <section aria-label="Engagement" className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:items-end sm:gap-10">
        <div className="flex flex-col gap-2">
          <span className="text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
            Visits · last {dateCount} days
          </span>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-4xl leading-none font-semibold tracking-tight tabular-nums sm:text-5xl">
              {analyticsNumberFormat.format(totals.visits)}
            </span>
            <HomeVisitDelta
              visits={totals.visits}
              previous={analytics.previous}
              dateCount={dateCount}
            />
          </div>
        </div>
        <HomeVisitTrend range={analytics.range} days={analytics.days} />
      </div>
      <StatList
        stats={[
          {
            label: "Unique visitors",
            value: analyticsNumberFormat.format(totals.viewerIdentities),
          },
          { label: "Links with Visits", value: analyticsNumberFormat.format(totals.engagedLinks) },
          { label: "Total viewing time", value: formatTotalTime(totals.totalMs) },
          {
            label: "Time per Visit",
            value:
              totals.visits > 0 ? formatTotalTime(Math.round(totals.totalMs / totals.visits)) : "—",
          },
          { label: "Downloads", value: analyticsNumberFormat.format(totals.downloads) },
        ]}
      />
    </section>
  );
}

/**
 * How this range's Visits compare with the range of the same length before it.
 *
 * A count alone cannot say whether it is good news, so the comparison travels with it. When nothing
 * came before, there is no percentage to state and the chip says so instead of inventing one.
 */
function HomeVisitDelta({
  visits,
  previous,
  dateCount,
}: Readonly<{
  visits: number;
  previous: HomeAnalytics["previous"];
  dateCount: number;
}>) {
  if (visits === 0 && previous.visits === 0) return null;

  const rising = visits >= previous.visits;
  const Icon = visits === previous.visits ? MinusIcon : rising ? TrendingUpIcon : TrendingDownIcon;
  const change =
    previous.visits === 0
      ? "New"
      : `${rising ? "+" : "−"}${Math.round((Math.abs(visits - previous.visits) / previous.visits) * 100)}%`;

  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
          rising ? "bg-chart-2/15 text-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-3.5 self-center" />
        {change}
      </span>
      <span
        className="text-xs text-muted-foreground"
        title={`${previous.range.from} to ${previous.range.to}, UTC`}
      >
        vs {analyticsNumberFormat.format(previous.visits)} in the previous {dateCount} days
      </span>
    </span>
  );
}

/** The Links carrying this range's Visits, ranked, each bar drawn against the busiest of them. */
function HomeTopLinks({
  analytics,
  links,
}: Readonly<{
  analytics: HomeAnalytics;
  links: ReturnType<typeof getCollections>["links"];
}>) {
  const { data: linkRows } = useLiveQuery({
    query: (q) => q.from({ link: links }).select(({ link }) => link),
  });
  const linkById = new Map(linkRows.map((link) => [link.id, link]));
  const topLinks = analytics.links
    .filter((link) => link.visits > 0)
    .sort((a, b) => b.visits - a.visits || a.linkId.localeCompare(b.linkId))
    .slice(0, 5);
  const busiest = topLinks[0]?.visits ?? 0;

  return (
    <HomeSection
      title="Most visited Links"
      description="The five Links carrying the most Visits in this range."
      action={
        <Button
          nativeButton={false}
          variant="ghost"
          size="sm"
          render={<Link to="/dashboard/analytics" search={analytics.range} />}
        >
          Analytics
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      }
    >
      {topLinks.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartNoAxesCombinedIcon />
            </EmptyMedia>
            <EmptyTitle>
              {analytics.allTimeVisits === 0 ? "No Visits yet" : "No Visits in this range"}
            </EmptyTitle>
            <EmptyDescription>
              Share a Link to see how people engage with your Documents.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ol className="-mx-2 flex flex-col">
          {topLinks.map((row, index) => {
            const link = linkById.get(row.linkId);

            return (
              <li key={row.linkId} className="relative">
                <span
                  aria-hidden
                  className="absolute inset-y-1 left-0 rounded-lg bg-chart-2/12"
                  style={{ width: `${(row.visits / busiest) * 100}%` }}
                />
                <Link
                  to="/dashboard/analytics/$linkId"
                  params={{ linkId: row.linkId }}
                  search={analytics.range}
                  className="relative flex min-w-0 items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {link?.name || link?.slug || "Link"}
                      </span>
                      <AnalyticsTrustMark link={link} />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTotalTime(row.totalMs)} viewing time ·{" "}
                      {analyticsNumberFormat.format(row.viewerIdentities)} unique ·{" "}
                      {analyticsNumberFormat.format(row.downloads)} downloads
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {analyticsNumberFormat.format(row.visits)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {row.visits === 1 ? "visit" : "visits"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </HomeSection>
  );
}

const firstSteps = [
  {
    destination: dashboardDestinations.documents,
    title: "Add your Documents",
    description: "Write markdown in the app, or upload a PDF or an image.",
    icon: FileTextIcon,
  },
  {
    destination: dashboardDestinations.vaults,
    title: "Group them into a Vault",
    description: "Keep related Documents together to share as one unit.",
    icon: FolderClosedIcon,
  },
  {
    destination: dashboardDestinations.links,
    title: "Share with a Link",
    description: "Choose the Gate it imposes, then follow its Visits here.",
    icon: LinkIcon,
  },
];

/** What Home says while there is nothing to measure: the three steps that make a Visit possible. */
function HomeFirstSteps() {
  return (
    <HomeSection
      title="From Document to insight"
      description="Three steps stand between an empty Organization and its first Visit."
      action={
        <Button
          nativeButton={false}
          size="sm"
          render={<Link {...dashboardDestinations.documents.link} />}
        >
          Start here
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      }
    >
      <ol className="grid gap-4 sm:grid-cols-3">
        {firstSteps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-2">
            <span className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-chart-2/15 text-xs font-medium tabular-nums">
                {index + 1}
              </span>
              <Link
                {...step.destination.link}
                className="text-sm font-medium underline-offset-4 hover:underline"
              >
                {step.title}
              </Link>
            </span>
            <p className="text-xs text-muted-foreground">{step.description}</p>
          </li>
        ))}
      </ol>
    </HomeSection>
  );
}
