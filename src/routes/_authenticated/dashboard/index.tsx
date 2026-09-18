import { count, eq, useLiveQuery } from "@tanstack/react-db";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
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
import { Page, PageActions, PageHeader, PageTitle } from "#/components/page";
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
import { useIntentPreload } from "#/hooks/use-intent-preload";
import {
  analyticsNumberFormat,
  formatAnalyticsInstant,
  formatTotalTime,
} from "#/lib/analytics-format";
import { analyticsRangeDateCount } from "#/lib/analytics-fold";
import { dashboardDestinations } from "#/lib/dashboard-destinations";
import { documentKindLabel, type DocumentKind } from "#/lib/document-kind";
import { cn } from "#/lib/utils";
import { getAnalytics } from "#/server/functions/analytics";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  loader: () => getAnalytics({ data: {} }),
  component: DashboardHome,
});

type HomeAnalytics = Awaited<ReturnType<typeof getAnalytics>>;
type HomeDestination = (typeof dashboardDestinations)[keyof typeof dashboardDestinations];

/**
 * A section of Home: a hairline, a heading, and whatever the section is about underneath.
 *
 * Home used to be six Cards stacked on one another, which gave every part of it the same weight and
 * the same border. A rule and a heading separate them for a tenth of the ink.
 */
function HomeSection({
  title,
  action,
  children,
}: Readonly<{
  title: string;
  action?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex items-end justify-between gap-4 border-b border-border/70 pb-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-heading text-sm font-medium">{title}</h2>
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
          ? `${analyticsNumberFormat.format(vaultDocuments)} documents inside`
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
        <PageTitle className="text-2xl tracking-tight sm:text-3xl">
          {organization.name} overview
        </PageTitle>
        <PageActions>
          <HomeDestinationButton
            destination={dashboardDestinations.analytics}
            preloadScope={organization.id}
            variant="outline"
          >
            <ChartNoAxesCombinedIcon data-icon="inline-start" />
            View analytics
          </HomeDestinationButton>
        </PageActions>
      </PageHeader>

      <nav
        aria-label="Library"
        className="grid divide-y divide-border/70 border-y border-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        {library.map((item) => (
          <HomeLibraryItem
            key={item.destination.label}
            destination={item.destination}
            total={item.total}
            icon={item.icon}
            detail={item.detail}
            preloadScope={organization.id}
          />
        ))}
      </nav>

      <DemoAnalyticsNotice incomplete={analytics.analyticsIncomplete} />

      {started ? (
        <>
          <HomeEngagement analytics={analytics} />
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <HomeTopLinks analytics={analytics} links={links} preloadScope={organization.id} />
            <HomeSection
              title="Recently updated documents"
              action={
                <HomeDestinationButton
                  destination={dashboardDestinations.documents}
                  preloadScope={organization.id}
                  variant="ghost"
                  size="sm"
                >
                  All
                  <ArrowRightIcon data-icon="inline-end" />
                </HomeDestinationButton>
              }
            >
              {recentDocuments.length === 0 ? (
                // A Vault Link outlives the Documents it served, so Home can be started and empty.
                <p className="text-xs text-muted-foreground">No documents yet.</p>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {recentDocuments.map((document) => (
                    <HomeRecentDocument
                      key={document.id}
                      document={document}
                      preloadScope={organization.id}
                    />
                  ))}
                </ul>
              )}
            </HomeSection>
          </div>
        </>
      ) : (
        <HomeFirstSteps preloadScope={organization.id} />
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
          { label: "Links with visits", value: analyticsNumberFormat.format(totals.engagedLinks) },
          { label: "Total viewing time", value: formatTotalTime(totals.totalMs) },
          {
            label: "Time per visit",
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
  preloadScope,
}: Readonly<{
  analytics: HomeAnalytics;
  links: ReturnType<typeof getCollections>["links"];
  preloadScope: string;
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
      title="Most visited links"
      action={<HomeAnalyticsRangeButton range={analytics.range} preloadScope={preloadScope} />}
    >
      {topLinks.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartNoAxesCombinedIcon />
            </EmptyMedia>
            <EmptyTitle>
              {analytics.allTimeVisits === 0 ? "No visits yet" : "No visits in this range"}
            </EmptyTitle>
            <EmptyDescription>
              Share a link to see how people engage with your documents.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ol className="-mx-2 flex flex-col">
          {topLinks.map((row, index) => (
            <HomeTopLinkItem
              key={row.linkId}
              row={row}
              index={index}
              busiest={busiest}
              link={linkById.get(row.linkId)}
              range={analytics.range}
              preloadScope={preloadScope}
            />
          ))}
        </ol>
      )}
    </HomeSection>
  );
}

const firstSteps = [
  {
    destination: dashboardDestinations.documents,
    title: "Add your documents",
    description: "Write markdown in the app, or upload a PDF or an image.",
    icon: FileTextIcon,
  },
  {
    destination: dashboardDestinations.vaults,
    title: "Group them into a vault",
    description: "Share related documents together.",
    icon: FolderClosedIcon,
  },
  {
    destination: dashboardDestinations.links,
    title: "Share with a link",
    description: "Choose who can open it and see how it is read.",
    icon: LinkIcon,
  },
];

/** What Home says while there is nothing to measure: the three steps that make a Visit possible. */
function HomeFirstSteps({ preloadScope }: Readonly<{ preloadScope: string }>) {
  return (
    <HomeSection
      title="Get started"
      action={
        <HomeDestinationButton
          destination={dashboardDestinations.documents}
          preloadScope={preloadScope}
          size="sm"
        >
          Start here
          <ArrowRightIcon data-icon="inline-end" />
        </HomeDestinationButton>
      }
    >
      <ol className="grid gap-4 sm:grid-cols-3">
        {firstSteps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-2">
            <span className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-chart-2/15 text-xs font-medium tabular-nums">
                {index + 1}
              </span>
              <HomeDestinationTitleLink
                destination={step.destination}
                preloadScope={preloadScope}
                className="text-sm font-medium underline-offset-4 hover:underline"
              >
                {step.title}
              </HomeDestinationTitleLink>
            </span>
            <p className="text-xs text-muted-foreground">{step.description}</p>
          </li>
        ))}
      </ol>
    </HomeSection>
  );
}

function HomeDestinationButton({
  destination,
  preloadScope,
  children,
  variant,
  size,
}: Readonly<{
  destination: HomeDestination;
  preloadScope: string;
  children: ReactNode;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default";
}>) {
  const router = useRouter();
  const { linkProps } = useIntentPreload({
    scope: `${preloadScope}:${destination.link.to}`,
    preload: () => router.preloadRoute(destination.link),
  });

  return (
    <Button
      nativeButton={false}
      variant={variant}
      size={size}
      render={<Link {...destination.link} {...linkProps} />}
    >
      {children}
    </Button>
  );
}

function HomeDestinationTitleLink({
  destination,
  preloadScope,
  children,
  className,
}: Readonly<{
  destination: HomeDestination;
  preloadScope: string;
  children: ReactNode;
  className?: string;
}>) {
  const router = useRouter();
  const { linkProps } = useIntentPreload({
    scope: `${preloadScope}:${destination.link.to}`,
    preload: () => router.preloadRoute(destination.link),
  });

  return (
    <Link {...destination.link} {...linkProps} className={className}>
      {children}
    </Link>
  );
}

function HomeLibraryItem({
  destination,
  total,
  icon: Icon,
  detail,
  preloadScope,
}: Readonly<{
  destination: HomeDestination;
  total: number;
  icon: ComponentType<{ className?: string }>;
  detail: string | null;
  preloadScope: string;
}>) {
  const router = useRouter();
  const { linkProps } = useIntentPreload({
    scope: `${preloadScope}:${destination.link.to}`,
    preload: () => router.preloadRoute(destination.link),
  });

  return (
    <Link
      {...destination.link}
      {...linkProps}
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
  );
}

function HomeRecentDocument({
  document,
  preloadScope,
}: Readonly<{
  document: {
    id: string;
    title: string;
    kind: DocumentKind;
    updatedAt: Date;
  };
  preloadScope: string;
}>) {
  const router = useRouter();
  const updated = formatAnalyticsInstant(document.updatedAt);
  const { linkProps } = useIntentPreload({
    scope: `${preloadScope}:${document.id}`,
    preload: () =>
      router.preloadRoute({
        to: "/dashboard/documents/$documentId",
        params: { documentId: document.id },
      }),
  });

  return (
    <li>
      <Link
        to="/dashboard/documents/$documentId"
        params={{ documentId: document.id }}
        {...linkProps}
        className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <DocumentKindIcon kind={document.kind} className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{document.title || "Untitled"}</span>
          <span className="text-xs text-muted-foreground">{documentKindLabel(document.kind)}</span>
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
}

function HomeAnalyticsRangeButton({
  range,
  preloadScope,
}: Readonly<{
  range: HomeAnalytics["range"];
  preloadScope: string;
}>) {
  const router = useRouter();
  const { linkProps } = useIntentPreload({
    scope: `${preloadScope}:analytics:${range.from}:${range.to}`,
    preload: () => router.preloadRoute({ to: "/dashboard/analytics", search: range }),
  });

  return (
    <Button
      nativeButton={false}
      variant="ghost"
      size="sm"
      render={<Link to="/dashboard/analytics" search={range} {...linkProps} />}
    >
      Analytics
      <ArrowRightIcon data-icon="inline-end" />
    </Button>
  );
}

function HomeTopLinkItem({
  row,
  index,
  busiest,
  link,
  range,
  preloadScope,
}: Readonly<{
  row: HomeAnalytics["links"][number];
  index: number;
  busiest: number;
  link: ReturnType<ReturnType<typeof getCollections>["links"]["get"]>;
  range: HomeAnalytics["range"];
  preloadScope: string;
}>) {
  const router = useRouter();
  const { linkProps } = useIntentPreload({
    scope: `${preloadScope}:${row.linkId}:${range.from}:${range.to}`,
    preload: () =>
      router.preloadRoute({
        to: "/dashboard/analytics/$linkId",
        params: { linkId: row.linkId },
        search: range,
      }),
  });

  return (
    <li className="relative">
      <span
        aria-hidden
        className="absolute inset-y-1 left-0 rounded-lg bg-chart-2/12"
        style={{ width: `${(row.visits / busiest) * 100}%` }}
      />
      <Link
        to="/dashboard/analytics/$linkId"
        params={{ linkId: row.linkId }}
        search={range}
        {...linkProps}
        className="relative flex min-w-0 items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
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
}
